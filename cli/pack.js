const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { checkInit } = require('./utils');

function run() {
  const args = process.argv.slice(3);
  const subcommand = args[0];
  const subcommands = { install, uninstall, list, create, update };

  if (!subcommand || !subcommands[subcommand]) {
    console.log(`Usage: aim pack <command> [args]

Commands:
  install <source>    Install from npm, git URL, or local path
  uninstall <name>    Remove an installed pack
  list                List installed packs
  create <name>       Scaffold a new pack
  update [name]       Update one or all packs

Sources:
  aim pack install @aim-community/pack-postgresql     (npm)
  aim pack install github:user/repo                   (git)
  aim pack install ./my-local-pack                    (local)
`);
    process.exit(1);
  }

  checkInit(process.cwd());
  subcommands[subcommand](args.slice(1));
}

function getPacksDir(projectRoot) {
  return path.join(projectRoot, '.aim', 'packs');
}

function getRegistryPath(projectRoot) {
  return path.join(getPacksDir(projectRoot), 'installed.json');
}

function loadRegistry(projectRoot) {
  const regPath = getRegistryPath(projectRoot);
  if (!fs.existsSync(regPath)) return { packs: {} };
  return JSON.parse(fs.readFileSync(regPath, 'utf8'));
}

function saveRegistry(projectRoot, registry) {
  const regPath = getRegistryPath(projectRoot);
  fs.mkdirSync(path.dirname(regPath), { recursive: true });
  fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
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

function resolvePackSource(source) {
  // Local path
  if (source.startsWith('./') || source.startsWith('/') || source.startsWith('../')) {
    const abs = path.resolve(source);
    if (!fs.existsSync(abs) || !fs.existsSync(path.join(abs, 'pack.json'))) {
      console.error(`Error: "${abs}" is not a valid pack (missing pack.json).`);
      process.exit(1);
    }
    return { type: 'local', path: abs };
  }

  // Git URL
  if (source.startsWith('github:') || source.startsWith('git@') || source.includes('.git')) {
    const gitUrl = source.startsWith('github:')
      ? `https://github.com/${source.replace('github:', '')}.git`
      : source;
    return { type: 'git', url: gitUrl };
  }

  // npm package name
  return { type: 'npm', name: source };
}

function install(args) {
  const source = args[0];
  if (!source) {
    console.error('Usage: aim pack install <source>');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const packsDir = getPacksDir(projectRoot);
  const resolved = resolvePackSource(source);

  let packDir;
  let packMeta;

  if (resolved.type === 'local') {
    packMeta = JSON.parse(fs.readFileSync(path.join(resolved.path, 'pack.json'), 'utf8'));
    const packName = packMeta.name.replace(/^@[^/]+\//, '');
    packDir = path.join(packsDir, packName);

    if (fs.existsSync(packDir)) {
      fs.rmSync(packDir, { recursive: true });
    }
    copyDirSync(resolved.path, packDir);
    console.log(`Installed ${packMeta.name}@${packMeta.version} from local path.`);
  } else if (resolved.type === 'git') {
    const tmpDir = path.join(packsDir, '.tmp-clone');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

    try {
      execSync(`git clone --depth 1 ${resolved.url} "${tmpDir}"`, { stdio: 'pipe' });
      const metaPath = path.join(tmpDir, 'pack.json');
      if (!fs.existsSync(metaPath)) {
        console.error('Error: cloned repo has no pack.json.');
        process.exit(1);
      }
      packMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const packName = packMeta.name.replace(/^@[^/]+\//, '');
      packDir = path.join(packsDir, packName);

      if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true });
      copyDirSync(tmpDir, packDir);
      // Remove .git from installed pack
      const dotGit = path.join(packDir, '.git');
      if (fs.existsSync(dotGit)) fs.rmSync(dotGit, { recursive: true });
      console.log(`Installed ${packMeta.name}@${packMeta.version} from git.`);
    } finally {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    }
  } else {
    // npm — download to temp and copy
    const tmpDir = path.join(packsDir, '.tmp-npm');
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      execSync(`npm pack ${resolved.name} --pack-destination "${tmpDir}"`, { stdio: 'pipe', cwd: tmpDir });
      const tgz = fs.readdirSync(tmpDir).find(f => f.endsWith('.tgz'));
      if (!tgz) {
        console.error(`Error: failed to download ${resolved.name} from npm.`);
        process.exit(1);
      }
      execSync(`tar -xzf "${tgz}"`, { cwd: tmpDir, stdio: 'pipe' });
      const extracted = path.join(tmpDir, 'package');
      const metaPath = path.join(extracted, 'pack.json');
      if (!fs.existsSync(metaPath)) {
        console.error('Error: npm package has no pack.json — not an AIM pack.');
        process.exit(1);
      }
      packMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const packName = packMeta.name.replace(/^@[^/]+\//, '');
      packDir = path.join(packsDir, packName);

      if (fs.existsSync(packDir)) fs.rmSync(packDir, { recursive: true });
      copyDirSync(extracted, packDir);
      console.log(`Installed ${packMeta.name}@${packMeta.version} from npm.`);
    } finally {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    }
  }

  // Update registry
  const registry = loadRegistry(projectRoot);
  const packName = packMeta.name.replace(/^@[^/]+\//, '');
  registry.packs[packName] = {
    name: packMeta.name,
    version: packMeta.version,
    source: source,
    installedAt: new Date().toISOString(),
  };
  saveRegistry(projectRoot, registry);
}

function uninstall(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: aim pack uninstall <name>');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const packName = name.replace(/^@[^/]+\//, '');
  const packDir = path.join(getPacksDir(projectRoot), packName);

  if (!fs.existsSync(packDir)) {
    console.error(`Pack "${packName}" is not installed.`);
    process.exit(1);
  }

  fs.rmSync(packDir, { recursive: true });

  const registry = loadRegistry(projectRoot);
  delete registry.packs[packName];
  saveRegistry(projectRoot, registry);

  console.log(`Uninstalled ${packName}.`);
}

function list() {
  const projectRoot = process.cwd();
  const registry = loadRegistry(projectRoot);
  const packs = Object.entries(registry.packs);

  if (packs.length === 0) {
    console.log('No packs installed. Use `aim pack install <source>` to add one.');
    return;
  }

  console.log(`\nInstalled packs (${packs.length}):\n`);
  for (const [key, info] of packs) {
    console.log(`  ${info.name}@${info.version}`);
    console.log(`    source: ${info.source}`);
    console.log(`    installed: ${info.installedAt}`);
  }
  console.log('');
}

function create(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: aim pack create <name>');
    process.exit(1);
  }

  const packDir = path.resolve(name);
  if (fs.existsSync(packDir)) {
    console.error(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(path.join(packDir, 'knowledge'));
  fs.mkdirSync(path.join(packDir, 'rules'));
  fs.mkdirSync(path.join(packDir, 'skills'));

  // Write pack.json from template
  let template;
  try {
    const core = require('./core-resolver').resolveCore();
    template = fs.readFileSync(path.join(core.paths.templates, 'pack.json'), 'utf8');
  } catch {
    const corePath = path.join(__dirname, '..', '..', 'aim-core', 'templates', 'pack.json');
    template = fs.readFileSync(corePath, 'utf8');
  }
  template = template.replace('NAME', name);
  fs.writeFileSync(path.join(packDir, 'pack.json'), template);

  // Write example knowledge fragment
  fs.writeFileSync(path.join(packDir, 'knowledge', 'example.md'), `## fragment: example-best-practice
tags: ["${name}"]
when: implementing
---
Add your knowledge content here.
---
`);

  console.log(`Created pack scaffold at ./${name}/`);
  console.log(`  pack.json       — pack metadata`);
  console.log(`  knowledge/      — knowledge fragments`);
  console.log(`  rules/          — optional rules`);
  console.log(`  skills/         — optional skills`);
}

function update(args) {
  const projectRoot = process.cwd();
  const registry = loadRegistry(projectRoot);
  const targetName = args[0]?.replace(/^@[^/]+\//, '');

  const toUpdate = targetName
    ? [[targetName, registry.packs[targetName]]]
    : Object.entries(registry.packs);

  if (targetName && !registry.packs[targetName]) {
    console.error(`Pack "${targetName}" is not installed.`);
    process.exit(1);
  }

  let updated = 0;
  for (const [, info] of toUpdate) {
    if (!info) continue;
    console.log(`Updating ${info.name} from ${info.source}...`);
    // Re-install from original source
    install([info.source]);
    updated++;
  }

  console.log(`Updated ${updated} pack(s).`);
}

module.exports = { run };
