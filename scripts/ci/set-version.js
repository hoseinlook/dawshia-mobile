// Sets the app version from the CI run (used by .github/workflows/release.yml).
// Tag v1.2.3 → version 1.2.3; other runs keep the app.json version (iOS needs a
// purely numeric version). The run number is the Android versionCode and the
// iOS buildNumber, so every build can update the previous one.
const fs = require('fs');

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
const isTag = (process.env.GITHUB_REF || '').startsWith('refs/tags/');
if (isTag) app.expo.version = process.env.GITHUB_REF_NAME.replace(/^v/, '');
app.expo.android = { ...app.expo.android, versionCode: run };
app.expo.ios = { ...app.expo.ios, buildNumber: String(run) };
fs.writeFileSync('app.json', JSON.stringify(app, null, 2));
console.log(`version ${app.expo.version}, build ${run}`);
