// Health check — visit /api/health to verify env vars are set
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const vars = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    GARMIN_EMAIL:      !!process.env.GARMIN_EMAIL,
    GARMIN_PASSWORD:   !!process.env.GARMIN_PASSWORD,
  };
  const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
  const ok = missing.length === 0;
  return res.status(ok ? 200 : 500).json({
    ok, vars, missing,
    message: ok ? 'All environment variables are set.' : `Missing: ${missing.join(', ')}`,
  });
};
