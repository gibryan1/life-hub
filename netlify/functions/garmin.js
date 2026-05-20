// ═══════════════════════════════════════════════════════════════
// GARMIN CONNECT — Netlify Serverless Function
// ═══════════════════════════════════════════════════════════════
//
// SETUP: Netlify → Site configuration → Environment variables → Add:
//   GARMIN_EMAIL    = your Garmin Connect login email
//   GARMIN_PASSWORD = your Garmin Connect password
//
// After setting variables, trigger a redeploy for them to take effect.
// Then sync your Garmin watch via the Garmin Connect phone app before
// calling this function — it only reads data that has been uploaded.
//
// RECOVERY SCORE FORMULA:
//   HRV 40% + Sleep Score 40% + Body Battery 20%
//   Each normalised 0-100. Green ≥ 75 · Amber 45-74 · Red < 45
// ═══════════════════════════════════════════════════════════════

const { GarminConnect } = require('garmin-connect');

// Module-level cache — survives warm Lambda invocations
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function calcRecoveryScore({ hrv, sleepScore, bodyBattery }) {
  const hrvNorm   = hrv          != null ? Math.min(100, Math.max(0, ((hrv - 20) / 100) * 100)) : null;
  const sleepNorm = sleepScore   != null ? Math.min(100, Math.max(0, sleepScore))                : null;
  const bbNorm    = bodyBattery  != null ? Math.min(100, Math.max(0, bodyBattery))               : null;

  const pairs = [
    [hrvNorm,   0.40],
    [sleepNorm, 0.40],
    [bbNorm,    0.20],
  ].filter(([v]) => v != null);

  if (!pairs.length) return { recoveryScore: null, recoveryStatus: 'unknown' };

  const wTotal = pairs.reduce((s, [, w]) => s + w, 0);
  const score  = Math.round(pairs.reduce((s, [v, w]) => s + v * (w / wTotal), 0));
  const recoveryStatus = score >= 75 ? 'green' : score >= 45 ? 'amber' : 'red';
  return { recoveryScore: score, recoveryStatus };
}

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  // ── Environment variable check ─────────────────────────────
  const email    = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    console.error('[garmin] GARMIN_EMAIL or GARMIN_PASSWORD is not set in Netlify environment variables.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'missing_credentials',
        message: 'GARMIN_EMAIL and GARMIN_PASSWORD are not set. Go to Netlify → Site configuration → Environment variables and add them, then redeploy.',
        synced: false,
        recoveryScore: null,
        recoveryStatus: 'unknown',
      }),
    };
  }

  // ── Serve from cache if still fresh ───────────────────────
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return { statusCode: 200, headers, body: JSON.stringify({ ..._cache, fromCache: true }) };
  }

  // ── Fetch from Garmin Connect ──────────────────────────────
  try {
    const gc = new GarminConnect({ username: email, password });
    await gc.login();

    const [summaryResult, sleepResult, hrvResult] = await Promise.allSettled([
      gc.getDailySummary(),
      gc.getSleep(),
      gc.getHRV(),
    ]);

    const daily    = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    const sleepData = sleepResult.status  === 'fulfilled' ? sleepResult.value   : null;
    const hrvData   = hrvResult.status    === 'fulfilled' ? hrvResult.value     : null;

    const hrv          = hrvData?.lastNight?.value ?? hrvData?.weekly?.highestValue ?? null;
    const sleepScore   = sleepData?.dailySleepDTO?.sleepScores?.overall?.value ?? sleepData?.sleepScores?.overall ?? null;
    const bodyBattery  = daily?.bodyBatteryMostRecentValue ?? null;

    const { recoveryScore, recoveryStatus } = calcRecoveryScore({ hrv, sleepScore, bodyBattery });

    const result = {
      synced: true,
      fetchedAt: new Date().toISOString(),
      hrv5MinHigh:        hrv,
      sleepScore,
      sleepDurationHours: sleepData?.dailySleepDTO?.sleepTimeSeconds != null
        ? +(sleepData.dailySleepDTO.sleepTimeSeconds / 3600).toFixed(1)
        : sleepData?.sleepTimeSeconds != null
          ? +(sleepData.sleepTimeSeconds / 3600).toFixed(1)
          : null,
      bodyBattery,
      heartRateResting:   daily?.restingHeartRate  ?? null,
      heartRateAvg:       daily?.averageHeartRate   ?? null,
      heartRateMax:       daily?.maxHeartRate       ?? null,
      steps:              daily?.totalSteps ?? daily?.steps ?? null,
      stepsGoal:          daily?.dailyStepGoal ?? 10000,
      calories:           daily?.totalKilocalories  ?? null,
      stressAvg:          daily?.averageStressLevel ?? null,
      distanceKm:         daily?.totalDistanceMeters != null
        ? +(daily.totalDistanceMeters / 1000).toFixed(2) : null,
      activeMinutes:      daily?.moderateIntensityMinutes != null && daily?.vigorousIntensityMinutes != null
        ? daily.moderateIntensityMinutes + daily.vigorousIntensityMinutes * 2 : null,
      hrvStatus:          hrvData?.lastNight?.feedbackPhrase ?? null,
      recoveryScore,
      recoveryStatus,
    };

    _cache = result;
    _cacheTime = Date.now();

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (err) {
    console.error('[garmin] Fetch error:', err.message);

    // Return stale cache rather than failing outright
    if (_cache) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ..._cache,
          fromCache: true,
          stale: true,
          cacheAgeMinutes: Math.round((Date.now() - _cacheTime) / 60000),
          warning: 'Live fetch failed — showing last known data.',
        }),
      };
    }

    const isAuth = /invalid|unauthorized|401|403|login|password|credentials/i.test(err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        synced: false,
        recoveryScore: null,
        recoveryStatus: 'unknown',
        error: isAuth ? 'auth_failed' : 'fetch_failed',
        message: isAuth
          ? 'Garmin login failed — check that GARMIN_EMAIL and GARMIN_PASSWORD are correct in Netlify.'
          : 'Could not reach Garmin Connect. Sync your watch via the Garmin Connect app and try again.',
        detail: err.message,
      }),
    };
  }
};
