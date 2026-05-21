// Run this ONCE locally to generate Garmin OAuth tokens.
// Requirements: MFA must be disabled on your Garmin account while running this.
//
// Usage:
//   node get-garmin-tokens.js your@email.com yourpassword
//
// Then add the two output values as Vercel env vars:
//   vercel env add GARMIN_OAUTH1 production
//   vercel env add GARMIN_OAUTH2 production
// (paste the value when prompted, then redeploy)

const { GarminConnect } = require('garmin-connect');

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node get-garmin-tokens.js your@email.com yourpassword');
  process.exit(1);
}

async function main() {
  const gc = new GarminConnect({ username: email, password });
  console.log('Logging in to Garmin Connect…');
  await gc.login();
  console.log('Login successful!\n');

  const oauth1 = gc.client.oauth1Token;
  const oauth2 = gc.client.oauth2Token;

  if (!oauth1 || !oauth2) {
    console.error('Could not retrieve tokens after login.');
    process.exit(1);
  }

  console.log('=== Add these as Vercel environment variables ===\n');
  console.log('GARMIN_OAUTH1:');
  console.log(JSON.stringify(oauth1));
  console.log('\nGARMIN_OAUTH2:');
  console.log(JSON.stringify(oauth2));
  console.log('\n=== Done ===');
  console.log('Run:  vercel env add GARMIN_OAUTH1 production');
  console.log('Then: vercel env add GARMIN_OAUTH2 production');
  console.log('Then: git push origin main  (to redeploy)');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
