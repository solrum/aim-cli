const path = require('path');
const os = require('os');

const CORE_DIR = path.join(os.homedir(), '.aim', 'core');
const DEV_CORE_DIR = path.join(__dirname, '..', '..', 'aim-core');

function resolveCore() {
  // 1. Explicit override via AIM_CORE_PATH (for local testing)
  if (process.env.AIM_CORE_PATH) {
    const overridePath = path.resolve(process.env.AIM_CORE_PATH);
    try {
      const core = require(overridePath);
      console.error(`[aim] Using local core: ${overridePath}`);
      return core;
    } catch (e) {
      console.error(`Error: AIM_CORE_PATH="${overridePath}" is invalid.`);
      console.error(`  ${e.message}`);
      process.exit(1);
    }
  }

  // 2. Try installed (~/.aim/core/)
  try {
    return require(CORE_DIR);
  } catch { /* not installed */ }

  // 3. Try dev fallback (../../aim-core)
  try {
    return require(DEV_CORE_DIR);
  } catch { /* not available */ }

  // 4. Not found
  console.error('Error: aim-core not found.');
  console.error('Run `aim install` to download aim-core.');
  process.exit(1);
}

module.exports = { resolveCore, CORE_DIR, DEV_CORE_DIR };
