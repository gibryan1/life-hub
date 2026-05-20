// Quick diagnostic — call /.netlify/functions/health to verify env vars are set.
// Returns which variables are present without exposing their values.

exports.handler = async function () {
  const vars = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    GARMIN_EMAIL:      !!process.env.GARMIN_EMAIL,
    GARMIN_PASSWORD:   !!process.env.GARMIN_PASSWORD,
  };

  const missing = Object.entries(vars).filter(([, set]) => !set).map(([k]) => k);
  const ok = missing.length === 0;

  return {
    statusCode: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      ok,
      vars,
      missing,
      message: ok
        ? 'All environment variables are set.'
        : `Missing: ${missing.join(', ')}. Set them in Netlify → Site configuration → Environment variables, then redeploy.`,
    }),
  };
};
