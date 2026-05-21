// Garmin Connect proxy — Vercel Serverless Function
// Uses stored OAuth tokens (GARMIN_OAUTH1 + GARMIN_OAUTH2 env vars) to avoid
// re-logging in on every cold start, which fails when MFA is enabled.
// Run get-garmin-tokens.js locally once to generate the token values.

const { GarminConnect } = require('garmin-connect');

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

async function getGarminClient(email, password) {
  const gc = new GarminConnect({ username: email, password });

  const oauth1Str = process.env.GARMIN_OAUTH1;
  const oauth2Str = process.env.GARMIN_OAUTH2;

  if (oauth1Str && oauth2Str) {
    try {
      gc.loadToken(JSON.parse(oauth1Str), JSON.parse(oauth2Str));
      return gc;
    } catch (e) {
      console.warn('[garmin] Token parse failed, falling back to login:', e.message);
    }
  }

  // Fallback: password login (requires MFA disabled on Garmin account)
  await gc.login();
  return gc;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const email    = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    console.error('[garmin] Missing credentials.');
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'Set GARMIN_EMAIL and GARMIN_PASSWORD in Vercel environment variables.',
      synced: false, recoveryScore: null, recoveryStatus: 'unknown',
    });
  }

  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return res.status(200).json({ ..._cache, fromCache: true });
  }

  try {
    const gc = await getGarminClient(email, password);

    const [summaryR, sleepR, hrvR] = await Promise.allSettled([
      gc.getDailySummary(), gc.getSleep(), gc.getHRV(),
    ]);

    const daily    = summaryR.status === 'fulfilled' ? summaryR.value : null;
    const sleepData = sleepR.status  === 'fulfilled' ? sleepR.value   : null;
    const hrvData   = hrvR.status    === 'fulfilled' ? hrvR.value     : null;

    const hrv         = hrvData?.lastNight?.value ?? hrvData?.weekly?.highestValue ?? null;
    const sleepScore  = sleepData?.dailySleepDTO?.sleepScores?.overall?.value ?? sleepData?.sleepScores?.overall ?? null;
    const bodyBattery = daily?.bodyBatteryMostRecentValue ?? null;

    const { recoveryScore, recoveryStatus } = calcRecoveryScore({ hrv, sleepScore, bodyBattery });

    const result = {
      synced: true, fetchedAt: new Date().toISOString(),
      hrv5MinHigh: hrv, sleepScore,
      sleepDurationHours: sleepData?.dailySleepDTO?.sleepTimeSeconds != null
        ? +(sleepData.dailySleepDTO.sleepTimeSeconds / 3600).toFixed(1)
        : sleepData?.sleepTimeSeconds != null ? +(sleepData.sleepTimeSeconds / 3600).toFixed(1) : null,
      bodyBattery,
      heartRateResting: daily?.restingHeartRate  ?? null,
      heartRateAvg:     daily?.averageHeartRate   ?? null,
      heartRateMax:     daily?.maxHeartRate       ?? null,
      steps:            daily?.totalSteps ?? daily?.steps ?? null,
      stepsGoal:        daily?.dailyStepGoal ?? 10000,
      calories:         daily?.totalKilocalories  ?? null,
      stressAvg:        daily?.averageStressLevel ?? null,
      distanceKm:       daily?.totalDistanceMeters != null ? +(daily.totalDistanceMeters / 1000).toFixed(2) : null,
      activeMinutes:    daily?.moderateIntensityMinutes != null && daily?.vigorousIntensityMinutes != null
        ? daily.moderateIntensityMinutes + daily.vigorousIntensityMinutes * 2 : null,
      hrvStatus:        hrvData?.lastNight?.feedbackPhrase ?? null,
      recoveryScore, recoveryStatus,
    };

    _cache = result; _cacheTime = Date.now();
    return res.status(200).json(result);

  } catch (err) {
    console.error('[garmin] Error:', err.message);

    if (_cache) {
      return res.status(200).json({
        ..._cache, fromCache: true, stale: true,
        cacheAgeMinutes: Math.round((Date.now() - _cacheTime) / 60000),
        warning: 'Live fetch failed — showing last known data.',
      });
    }

    const isMFA  = /mfa|ticket not found/i.test(err.message);
    const isAuth = /invalid|unauthorized|401|403|login|password|credentials/i.test(err.message);
    return res.status(500).json({
      synced: false, recoveryScore: null, recoveryStatus: 'unknown',
      error: isMFA ? 'mfa_required' : isAuth ? 'auth_failed' : 'fetch_failed',
      message: isMFA
        ? 'Garmin MFA is blocking login. Run get-garmin-tokens.js locally and add GARMIN_OAUTH1 + GARMIN_OAUTH2 to Vercel env vars.'
        : isAuth
        ? 'Garmin login failed — check GARMIN_EMAIL and GARMIN_PASSWORD in Vercel.'
        : 'Could not reach Garmin Connect. Sync your watch via the Garmin Connect app and try again.',
      detail: err.message,
    });
  }
};
