const fs = require('fs');
const path = require('path');

function checkInit(projectRoot) {
  const aimJson = path.join(projectRoot, 'aim.json');
  if (!fs.existsSync(aimJson)) {
    console.error('Error: aim.json not found. Run `aim init` first.');
    process.exit(1);
  }
}

module.exports = { checkInit };
