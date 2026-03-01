const fs = require('fs');
const path = require('path');

async function run() {
  const projectRoot = process.cwd();
  const args = process.argv.slice(3);
  const tool = args.find(a => !a.startsWith('-')) || 'claude-code';
  const isRefresh = args.includes('--refresh');

  console.log(`\n🎯 AIM — AI Implementation Manager\n`);

  // Step 1: Detect project stack
  console.log('Step 1/4: Detecting project...');
  const stack = detectStack(projectRoot);
  console.log(`  Stack: ${stack.language} + ${stack.framework || 'none'}`);
  console.log(`  Database: ${stack.database || 'none'}`);

  // Step 2: Generate aim.json
  console.log('Step 2/4: Generating aim.json...');
  const config = generateConfig(projectRoot, stack, tool);
  if (!isRefresh || !fs.existsSync(path.join(projectRoot, 'aim.json'))) {
    fs.writeFileSync(
      path.join(projectRoot, 'aim.json'),
      JSON.stringify(config, null, 2)
    );
    console.log('  Created aim.json');
  } else {
    console.log('  aim.json exists, skipping (use --force to overwrite)');
  }

  // Step 3: Auto-install relevant first-party packs
  console.log('Step 3/5: Installing relevant packs...');
  installRelevantPacks(projectRoot, stack);

  // Step 4: Generate runtime adapter
  console.log(`Step 4/5: Adapting for ${tool}...`);
  await require('./adapt').adaptForTool(projectRoot, tool);

  // Step 5: Update .gitignore
  console.log('Step 5/5: Updating .gitignore...');
  updateGitignore(projectRoot);
  console.log('  .gitignore updated');

  // Summary
  console.log(`
✅ AIM initialized for ${stack.language}/${tool}

What was set up:
  aim.json              Project configuration
  .aim/runtime/         Local hook scripts
  .aim/packs/           Relevant knowledge packs
  ${tool === 'claude-code' ? '.claude/commands/aim-*  Skill files' : '.aim/prompts/  Skill files'}
  .gitignore            Updated with AIM entries

Next steps:
  1. Review aim.json and adjust stack/framework/database
  2. Run /aim-kickstart to design architecture + create roadmap
  3. Run /aim-plan to plan your first feature
  4. Run /aim-index after implementing to update references
`);
}

function detectStack(projectRoot) {
  const stack = { language: 'unknown' };
  let files;
  try {
    files = fs.readdirSync(projectRoot);
  } catch {
    return stack;
  }

  // Language detection
  if (files.includes('package.json')) {
    stack.language = 'typescript';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      if (pkg.dependencies?.next || pkg.devDependencies?.next) stack.framework = 'nextjs';
      else if (pkg.dependencies?.express) stack.framework = 'express';
      else if (pkg.dependencies?.nestjs || pkg.dependencies?.['@nestjs/core']) stack.framework = 'nestjs';
    } catch { /* ignore */ }
  } else if (files.includes('go.mod')) {
    stack.language = 'go';
    try {
      const goMod = fs.readFileSync(path.join(projectRoot, 'go.mod'), 'utf8');
      if (goMod.includes('gin-gonic')) stack.framework = 'gin';
      else if (goMod.includes('gorilla/mux')) stack.framework = 'gorilla';
      else if (goMod.includes('go-chi')) stack.framework = 'chi';
    } catch { /* ignore */ }
  } else if (files.includes('requirements.txt') || files.includes('pyproject.toml')) {
    stack.language = 'python';
  } else if (files.includes('Cargo.toml')) {
    stack.language = 'rust';
  }

  // Database detection
  const dcPath = path.join(projectRoot, 'docker-compose.yml');
  if (fs.existsSync(dcPath)) {
    try {
      const dc = fs.readFileSync(dcPath, 'utf8');
      if (dc.includes('postgres')) stack.database = 'postgresql';
      else if (dc.includes('mysql')) stack.database = 'mysql';
      else if (dc.includes('mongo')) stack.database = 'mongodb';
    } catch { /* ignore */ }
  }

  return stack;
}

function generateConfig(projectRoot, stack, tool) {
  return {
    "$schema": "https://raw.githubusercontent.com/solrum/aim/main/schema/aim-config.schema.json",
    stack: stack.language,
    database: stack.database || null,
    framework: stack.framework || null,
    patterns: [],
    enrichPrompts: true,
    maxMistakeContext: 3,
    enforcement: {
      default: "nudge",
      overrides: {}
    },
    workflow: {
      requirePlan: "warn",
      requireVerification: true,
      buildCommand: getDefaultBuildCommand(stack),
      testCommand: getDefaultTestCommand(stack)
    },
    rules: { useUniversal: true, useStackRules: true },
    mistakes: { projectFile: ".aim/mistakes.json", useGlobal: true, autoRecord: true },
    knowledge: { useStackPractices: true, useTechNotes: true, maxItemsPerChunk: 3 }
  };
}

function getDefaultBuildCommand(stack) {
  const commands = {
    go: 'go build ./...',
    typescript: 'npm run build',
    python: 'python -m py_compile',
    rust: 'cargo build'
  };
  return commands[stack.language] || 'echo "no build command configured"';
}

function getDefaultTestCommand(stack) {
  const commands = {
    go: 'go test ./...',
    typescript: 'npm test',
    python: 'pytest',
    rust: 'cargo test'
  };
  return commands[stack.language] || 'echo "no test command configured"';
}

function installRelevantPacks(projectRoot, stack) {
  let packsRoot;
  try {
    const core = require('./core-resolver').resolveCore();
    packsRoot = core.paths.packs;
  } catch {
    packsRoot = path.join(__dirname, '..', '..', 'aim-packs');
  }

  if (!fs.existsSync(packsRoot)) {
    console.log('  No first-party packs found, skipping');
    return;
  }

  const packsDir = path.join(projectRoot, '.aim', 'packs');
  fs.mkdirSync(packsDir, { recursive: true });

  const entries = fs.readdirSync(packsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('pack-'));

  let installed = 0;
  for (const entry of entries) {
    const packPath = path.join(packsRoot, entry.name);
    const metaPath = path.join(packPath, 'pack.json');
    if (!fs.existsSync(metaPath)) continue;

    let meta;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { continue; }

    // Match by stack or database
    const packStack = meta.stack || [];
    const packTags = meta.tags || [];
    const isRelevant = packStack.length === 0
      || packStack.includes(stack.language)
      || packTags.includes(stack.database)
      || packTags.includes('testing')
      || packTags.includes('security');

    if (!isRelevant) continue;

    const targetDir = path.join(packsDir, entry.name);
    if (fs.existsSync(targetDir)) continue; // Already installed

    copyDirSync(packPath, targetDir);
    installed++;
    console.log(`  Installed ${meta.name}@${meta.version}`);
  }

  if (installed === 0) console.log('  All relevant packs already installed');
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function updateGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const aimIgnoreBlock = `
# AIM — AI Implementation Manager
.aim/current-plan.md
.aim/plan-state.json
.aim/roadmap.json
.aim/todo.json
.aim/session.lock
.aim/metrics.json
.aim/runtime/
.claude/commands/aim-*
`;
  const AIM_MARKER = '# AIM — AI Implementation Manager';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (content.includes(AIM_MARKER)) return;
    fs.appendFileSync(gitignorePath, aimIgnoreBlock);
  } else {
    fs.writeFileSync(gitignorePath, aimIgnoreBlock.trim() + '\n');
  }
}

module.exports = { run };
