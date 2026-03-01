const path = require('path');
const os = require('os');

const CORE_DIR = path.join(os.homedir(), '.aim', 'core');
const DEV_CORE_DIR = path.join(__dirname, '..', '..', 'aim-core');

function resolveCore() {
  // 1. Try installed (~/.aim/core/)
  try {
    return require(CORE_DIR);
  } catch { /* not installed */ }

  // 2. Try dev fallback (../../aim-core)
  try {
    return require(DEV_CORE_DIR);
  } catch { /* not available */ }

  // 3. Not found
  console.error('Error: aim-core not found.');
  console.error('Run `aim install` to download aim-core.');
  process.exit(1);
}

module.exports = { resolveCore, CORE_DIR, DEV_CORE_DIR };
