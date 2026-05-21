// Garmin Connect proxy — Vercel Serverless Function
//
// Auth: set GARMIN_BEARER_TOKEN in Vercel env vars.
// How to get it:
//   1. Log in to connect.garmin.com in Chrome (MFA is fine)
//   2. Open DevTools → Network tab → filter by "connectapi"
//   3. Click any request → Headers → find "Authorization: Bearer eyJ..."
//   4. Copy the token value (everything after "Bearer ")
//   5. vercel env add GARMIN_BEARER_TOKEN production
//   6. Redeploy (git push)
// Tokens last ~1 hour; repeat when it stops working.

const GC_API = 'https://connectapi.garmin.com';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function calcRecoveryScore({ hrv, sleepScore, bodyBattery }) {
  const hrvNorm   = hrv         != null ? Math.min(100, Math.max(0, ((hrv - 20) / 100) * 100)) : null;
  const sleepNorm = sleepScore  != null ? Math.min(100, Math.max(0, sleepScore))                : null;
  const bbNorm    = bodyBattery != null ? Math.min(100, Math.max(0, bodyBattery))               : null;
  const pairs = [[hrvNorm, 0.40], [sleepNorm, 0.40], [bbNorm, 0.20]].filter(([v]) => v != null);
  if (!pairs.length) return { recoveryScore: null, recoveryStatus: 'unknown' };
  const wTotal = pairs.reduce((s, [, w]) => s + w, 0);
  const score  = Math.round(pairs.reduce((s, [v, w]) => s + v * (w / wTotal), 0));
  return { recoveryScore: score, recoveryStatus: score >= 75 ? 'green' : score >= 45 ? 'amber' : 'red' };
}

async function gcFetch(path, token) {
  const r = await fetch(GC_API + path, {
    headers: { Authorization: `Bearer ${token}`, NK: 'NT', 'Di-Backend': 'connectapi.garmin.com' },
  });
  if (r.status === 401) {
    const err = new Error('Bearer token expired — refresh GARMIN_BEARER_TOKEN in Vercel.');
    err.tokenExpired = true;
    throw err;
  }
  if (!r.ok) throw new Error(`Garmin API ${r.status} on ${path}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = process.env.GARMIN_BEARER_TOKEN;
  if (!token) {
    return res.status(500).json({
      synced: false, recoveryScore: null, recoveryStatus: 'unknown',
      error: 'no_token',
      message: 'Set GARMIN_BEARER_TOKEN in Vercel env vars. Log in to connect.garmin.com → DevTools → Network → any connectapi request → copy the Authorization: Bearer value.',
    });
  }

  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return res.status(200).json({ ..._cache, fromCache: true });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Get display name (needed for some endpoints)
    const profile = await gcFetch('/userprofile-service/socialProfile', token);
    const displayName = profile.displayName;
    if (!displayName) throw new Error('Could not get Garmin display name from profile.');

    const [summaryR, sleepR, hrvR] = await Promise.allSettled([
      gcFetch(`/usersummary-service/usersummary/daily/${displayName}?calendarDate=${today}`, token),
      gcFetch(`/sleep-service/sleep/dailySleepData?date=${today}`, token),
      gcFetch(`/hrv-service/hrv/${displayName}?startDate=${today}&endDate=${today}`, token),
    ]);

    const daily     = summaryR.status === 'fulfilled' ? summaryR.value : null;
    const sleepData = sleepR.status   === 'fulfilled' ? sleepR.value   : null;
    const hrvData   = hrvR.status     === 'fulfilled' ? hrvR.value     : null;

    if (summaryR.status === 'rejected') console.warn('[garmin] daily summary failed:', summaryR.reason?.message);
    if (sleepR.status   === 'rejected') console.warn('[garmin] sleep failed:',         sleepR.reason?.message);
    if (hrvR.status     === 'rejected') console.warn('[garmin] hrv failed:',            hrvR.reason?.message);

    const hrv        = hrvData?.lastNight?.value ?? null;
    const sleepScore = sleepData?.dailySleepDTO?.sleepScores?.overall?.value ?? null;
    const bodyBattery = daily?.bodyBatteryMostRecentValue ?? null;

    const { recoveryScore, recoveryStatus } = calcRecoveryScore({ hrv, sleepScore, bodyBattery });

    const result = {
      synced: true,
      fetchedAt: new Date().toISOString(),
      hrv5MinHigh: hrv,
      sleepScore,
      sleepDurationHours: sleepData?.dailySleepDTO?.sleepTimeSeconds != null
        ? +(sleepData.dailySleepDTO.sleepTimeSeconds / 3600).toFixed(1) : null,
      bodyBattery,
      heartRateResting: daily?.restingHeartRateValue ?? daily?.restingHeartRate ?? null,
      heartRateAvg:     daily?.averageHeartRateValue ?? daily?.averageHeartRate ?? null,
      heartRateMax:     daily?.maxHeartRateValue     ?? daily?.maxHeartRate     ?? null,
      steps:            daily?.totalSteps ?? daily?.steps ?? null,
      stepsGoal:        daily?.dailyStepGoal ?? 10000,
      calories:         daily?.totalKilocalories ?? null,
      stressAvg:        daily?.averageStressLevel ?? null,
      distanceKm:       daily?.totalDistanceMeters != null
        ? +(daily.totalDistanceMeters / 1000).toFixed(2) : null,
      activeMinutes:    (daily?.moderateIntensityMinutes != null && daily?.vigorousIntensityMinutes != null)
        ? daily.moderateIntensityMinutes + daily.vigorousIntensityMinutes * 2 : null,
      hrvStatus:        hrvData?.status ?? null,
      recoveryScore,
      recoveryStatus,
    };

    _cache = result; _cacheTime = Date.now();
    return res.status(200).json(result);

  } catch (err) {
    console.error('[garmin]', err.message);

    if (_cache) {
      return res.status(200).json({
        ..._cache, fromCache: true, stale: true,
        cacheAgeMinutes: Math.round((Date.now() - _cacheTime) / 60000),
        warning: err.tokenExpired ? err.message : 'Live fetch failed — showing last known data.',
      });
    }

    return res.status(err.tokenExpired ? 401 : 500).json({
      synced: false, recoveryScore: null, recoveryStatus: 'unknown',
      error: err.tokenExpired ? 'token_expired' : 'fetch_failed',
      message: err.tokenExpired
        ? err.message
        : `Garmin fetch failed: ${err.message}`,
    });
  }
};
