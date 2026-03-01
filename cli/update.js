const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CORE_DIR } = require('./core-resolver');

function run() {
  console.log('\nAIM — Updating aim-core...\n');

  // Check if installed
  if (!fs.existsSync(CORE_DIR)) {
    console.error('aim-core is not installed.');
    console.error('Run `aim install` first.');
    process.exit(1);
  }

  // Read current version
  const oldVersion = getVersion();
  console.log(`Current: ${oldVersion}`);

  // Fetch + pull
  console.log('Pulling latest from main...');
  try {
    const output = execSync(`git -C "${CORE_DIR}" pull origin main`, { encoding: 'utf8' });
    console.log(output.trim());
  } catch (e) {
    console.error('\nError: git pull failed.');
    console.error('Check your network connection and that ~/.aim/core/ is a valid git repo.');
    process.exit(1);
  }

  // Clear require cache
  try {
    delete require.cache[require.resolve(path.join(CORE_DIR, 'package.json'))];
  } catch { /* ignore */ }

  // Read new version
  const newVersion = getVersion();

  if (oldVersion === newVersion) {
    console.log(`\naim-core@${newVersion} — already up to date.`);
  } else {
    console.log(`\nUpdated aim-core: ${oldVersion} → ${newVersion}`);

    // Show changelog between versions
    try {
      const log = execSync(
        `git -C "${CORE_DIR}" log --oneline ${oldVersion}..${newVersion} 2>/dev/null`,
        { encoding: 'utf8' }
      ).trim();
      if (log) {
        console.log('\nChanges:');
        console.log(log.split('\n').map(l => `  ${l}`).join('\n'));
      }
    } catch { /* old version may not be a valid ref */ }
  }
}

function getVersion() {
  let version = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(CORE_DIR, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch { /* ignore */ }

  try {
    const tag = execSync(`git -C "${CORE_DIR}" describe --tags --exact-match 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (tag) version = tag;
  } catch { /* no tag on current commit */ }

  return version;
}

module.exports = { run };
