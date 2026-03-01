const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CORE_DIR } = require('./core-resolver');

const REPO_URL = 'https://github.com/solrum/aim-core.git';

function run() {
  console.log('\nAIM — Installing aim-core...\n');

  // Check if already installed
  if (fs.existsSync(CORE_DIR)) {
    console.log(`aim-core already installed at ${CORE_DIR}`);
    console.log('Use `aim update` to pull latest changes.');
    return;
  }

  // Create parent directory
  fs.mkdirSync(path.dirname(CORE_DIR), { recursive: true });

  // Git clone (main branch only)
  console.log(`Cloning ${REPO_URL} (branch: main)...`);
  try {
    execSync(`git clone -b main --single-branch ${REPO_URL} "${CORE_DIR}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('\nError: git clone failed.');
    console.error('Make sure git is installed and you have network access.');
    process.exit(1);
  }

  // Verify
  try {
    const core = require(CORE_DIR);
    if (!core.adapters) {
      throw new Error('core.adapters not found');
    }
  } catch (e) {
    console.error(`\nWarning: aim-core installed but verification failed: ${e.message}`);
    console.error('The installation may be incomplete.');
    return;
  }

  // Print version from package.json + git tag
  const version = getVersion();
  console.log(`\nInstalled aim-core@${version}`);
  console.log(`Location: ${CORE_DIR}`);
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
