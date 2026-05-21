// Strava API proxy — Vercel Serverless Function
// Uses refresh_token to get a fresh access_token on each cold start.
// Env vars: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getAccessToken() {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${r.status}`);
  const d = await r.json();
  if (!d.access_token) throw new Error('No access_token in Strava response');
  return d.access_token;
}

async function stravaGet(path, token) {
  const r = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Strava API ${r.status} on ${path}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { client_id, client_secret, STRAVA_REFRESH_TOKEN: refresh } = {
    client_id:           process.env.STRAVA_CLIENT_ID,
    client_secret:       process.env.STRAVA_CLIENT_SECRET,
    STRAVA_REFRESH_TOKEN: process.env.STRAVA_REFRESH_TOKEN,
  };

  if (!client_id || !client_secret || !refresh) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: 'Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN in Vercel.',
    });
  }

  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return res.status(200).json({ ..._cache, fromCache: true });
  }

  try {
    const token = await getAccessToken();

    const [athleteR, statsR, activitiesR] = await Promise.allSettled([
      stravaGet('/athlete', token),
      stravaGet('/athlete/stats', token).catch(() => null),
      stravaGet('/athlete/activities?per_page=20&after=' + Math.floor((Date.now() - 90 * 86400000) / 1000), token),
    ]);

    const athlete    = athleteR.status    === 'fulfilled' ? athleteR.value    : null;
    const stats      = statsR.status      === 'fulfilled' ? statsR.value      : null;
    const activities = activitiesR.status === 'fulfilled' ? activitiesR.value : [];

    const recentRuns = (activities || [])
      .filter(a => a.type === 'Run' || a.sport_type === 'Run')
      .slice(0, 20)
      .map(a => ({
        id:          a.id,
        name:        a.name,
        date:        a.start_date_local?.slice(0, 10),
        distanceKm:  +(a.distance / 1000).toFixed(2),
        durationMin: Math.round(a.moving_time / 60),
        paceMinKm:   a.distance > 0
          ? `${Math.floor(a.moving_time / 60 / (a.distance / 1000))}:${String(Math.round((a.moving_time / 60 / (a.distance / 1000) % 1) * 60)).padStart(2, '0')}`
          : null,
        heartRateAvg: a.average_heartrate ?? null,
        elevationM:   a.total_elevation_gain ?? null,
      }));

    const ytdRun = stats?.ytd_run_totals;
    const allRun = stats?.all_run_totals;

    const result = {
      synced: true,
      fetchedAt: new Date().toISOString(),
      athlete: athlete ? {
        name:       `${athlete.firstname} ${athlete.lastname}`,
        city:       athlete.city,
        country:    athlete.country,
        avatar:     athlete.profile_medium,
        followers:  athlete.follower_count,
      } : null,
      ytd: ytdRun ? {
        runs:      ytdRun.count,
        distanceKm: +(ytdRun.distance / 1000).toFixed(1),
        durationH:  +(ytdRun.moving_time / 3600).toFixed(1),
        elevationM: ytdRun.elevation_gain,
      } : null,
      allTime: allRun ? {
        runs:      allRun.count,
        distanceKm: +(allRun.distance / 1000).toFixed(1),
      } : null,
      recentRuns,
    };

    _cache = result; _cacheTime = Date.now();
    return res.status(200).json(result);

  } catch (err) {
    console.error('[strava]', err.message);

    if (_cache) {
      return res.status(200).json({
        ..._cache, fromCache: true, stale: true,
        cacheAgeMinutes: Math.round((Date.now() - _cacheTime) / 60000),
      });
    }

    return res.status(500).json({
      synced: false,
      error:   'fetch_failed',
      message: err.message,
    });
  }
};
