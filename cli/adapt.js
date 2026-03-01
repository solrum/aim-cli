const path = require('path');
const { checkInit } = require('./utils');

const SUPPORTED_TOOLS = ['claude-code', 'cursor', 'windsurf', 'generic'];

async function run() {
  const args = process.argv.slice(3);
  const tool = args.find(a => !a.startsWith('-'));
  const isUpdate = args.includes('--update');
  const isRemove = args.includes('--remove');

  if (!tool || !SUPPORTED_TOOLS.includes(tool)) {
    console.log(`Usage: aim adapt <tool> [--update] [--remove]

Tools:
  claude-code   Full mode — hooks + skills + runtime
  cursor        Lite mode — .cursorrules + skills (no hooks)
  windsurf      Lite mode — .windsurfrules + skills (no hooks)
  generic       Prompts only — skills copied to .aim/prompts/

Options:
  --update      Re-copy runtime scripts to latest version
  --remove      Remove AIM hooks (keeps user hooks)
`);
    process.exit(1);
  }

  const projectRoot = process.cwd();
  checkInit(projectRoot);

  if (isRemove) {
    await removeForTool(projectRoot, tool);
    return;
  }

  await adaptForTool(projectRoot, tool);
}

async function adaptForTool(projectRoot, tool) {
  const core = require('./core-resolver').resolveCore();

  const adapter = core.adapters[tool];
  if (!adapter) {
    console.error(`Error: adapter "${tool}" not found in aim-core.`);
    console.error(`Available: ${Object.keys(core.adapters).join(', ')}`);
    process.exit(1);
  }

  adapter.generate(projectRoot);

  // Deploy pack rules/skills alongside core rules/skills
  deployPackAssets(projectRoot, tool);
}

async function removeForTool(projectRoot, tool) {
  const core = require('./core-resolver').resolveCore();

  const adapter = core.adapters[tool];
  if (!adapter) {
    console.error(`Error: adapter "${tool}" not found.`);
    process.exit(1);
  }

  if (typeof adapter.removeHooks === 'function') {
    const fs = require('fs');
    const hooksPath = path.join(projectRoot, '.claude', 'hooks.json');
    adapter.removeHooks(hooksPath);
  } else {
    console.log(`Note: ${tool} adapter does not support --remove (no hooks to remove).`);
  }
}

function deployPackAssets(projectRoot, tool) {
  const fs = require('fs');
  const packsDir = path.join(projectRoot, '.aim', 'packs');
  if (!fs.existsSync(packsDir)) return;

  const entries = fs.readdirSync(packsDir, { withFileTypes: true });
  let rulesCount = 0;
  let skillsCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(packsDir, entry.name);

    // Deploy pack rules
    const packRules = path.join(packDir, 'rules');
    if (fs.existsSync(packRules)) {
      const targetRules = path.join(projectRoot, '.aim', 'rules');
      fs.mkdirSync(targetRules, { recursive: true });
      for (const file of fs.readdirSync(packRules).filter(f => f.endsWith('.md'))) {
        fs.copyFileSync(path.join(packRules, file), path.join(targetRules, `pack-${entry.name}-${file}`));
        rulesCount++;
      }
    }

    // Deploy pack skills (for Claude Code: .claude/commands/)
    const packSkills = path.join(packDir, 'skills');
    if (fs.existsSync(packSkills)) {
      const targetSkills = tool === 'claude-code'
        ? path.join(projectRoot, '.claude', 'commands')
        : path.join(projectRoot, '.aim', 'prompts');
      fs.mkdirSync(targetSkills, { recursive: true });
      for (const file of fs.readdirSync(packSkills).filter(f => f.endsWith('.md'))) {
        fs.copyFileSync(path.join(packSkills, file), path.join(targetSkills, `aim-pack-${entry.name}-${file}`));
        skillsCount++;
      }
    }
  }

  if (rulesCount > 0 || skillsCount > 0) {
    console.log(`Deployed pack assets: ${rulesCount} rules, ${skillsCount} skills.`);
  }
}

module.exports = { run, adaptForTool, removeForTool };
