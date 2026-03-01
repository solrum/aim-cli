const fs = require('fs');
const path = require('path');
const { checkInit } = require('./utils');

async function run() {
  const args = process.argv.slice(3);
  const isRefresh = args.includes('--refresh');
  const projectRoot = process.cwd();
  checkInit(projectRoot);

  console.log('\n🔍 AIM Index — Building context index...\n');

  const config = loadProjectConfig(projectRoot);
  const index = await buildIndex(projectRoot, config);

  const outputPath = path.join(projectRoot, '.aim', 'context-index.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));

  console.log(`✓ Context index written to .aim/context-index.json`);
  console.log(`  Layers: ${Object.keys(index.layers || {}).length}`);
  console.log(`  Features: ${(index.existingFeatures || []).length}`);
  console.log(`  Key files: ${Object.keys(index.keyFiles || {}).length}`);
  console.log('');
}

async function buildIndex(projectRoot, config) {
  const index = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    project: {
      name: path.basename(projectRoot),
      stack: config?.stack || detectLanguage(projectRoot),
      framework: config?.framework || null,
      architecture: detectArchitecture(projectRoot),
      rootModule: detectRootModule(projectRoot),
    },
    layers: {},
    dependencies: {},
    keyFiles: {},
    existingFeatures: [],
    stackPractices: {},
  };

  // Scan directories for layer detection
  const srcDirs = findSourceDirs(projectRoot);

  for (const dir of srcDirs) {
    const layer = detectLayerFromDir(dir);
    if (layer && layer !== 'other') {
      const relDir = path.relative(projectRoot, dir);
      const files = listSourceFiles(dir);
      const pattern = detectFilePattern(files);
      const reference = pickReferenceFile(files, dir);

      index.layers[layer] = {
        dir: relDir + '/',
        pattern: pattern,
        reference: reference ? path.relative(projectRoot, reference) : null,
        conventions: generateConventions(layer),
      };
    }
  }

  // Build dependency graph from layer names
  index.dependencies = buildDependencyGraph(Object.keys(index.layers));

  // Detect key files
  index.keyFiles = detectKeyFiles(projectRoot);

  // Group files into features
  index.existingFeatures = detectFeatures(projectRoot, index.layers);

  // Populate stack practices
  index.stackPractices = getStackPractices(index.project);

  return index;
}

function loadProjectConfig(projectRoot) {
  const configPath = path.join(projectRoot, 'aim.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function detectLanguage(projectRoot) {
  const files = fs.readdirSync(projectRoot);
  if (files.includes('go.mod')) return 'go';
  if (files.includes('package.json')) return 'typescript';
  if (files.includes('requirements.txt') || files.includes('pyproject.toml')) return 'python';
  if (files.includes('Cargo.toml')) return 'rust';
  return 'unknown';
}

function detectArchitecture(projectRoot) {
  const dirs = safeReaddir(projectRoot);

  // Check monorepo
  const isMonorepo = dirs.includes('apps') || dirs.includes('packages') || dirs.includes('services');

  // Check for clean/hexagonal architecture patterns
  const dirsToCheck = [];
  if (dirs.includes('internal')) dirsToCheck.push(path.join(projectRoot, 'internal'));
  if (dirs.includes('src')) dirsToCheck.push(path.join(projectRoot, 'src'));

  // Also check inside monorepo apps
  if (dirs.includes('apps')) {
    const apps = safeReaddir(path.join(projectRoot, 'apps'));
    for (const app of apps) {
      const appSrc = path.join(projectRoot, 'apps', app, 'src');
      if (fs.existsSync(appSrc)) dirsToCheck.push(appSrc);
      // Check inside modules for hexagonal layers
      const modulesDir = path.join(appSrc, 'modules');
      if (fs.existsSync(modulesDir)) {
        const modules = safeReaddir(modulesDir);
        for (const mod of modules) {
          const modDir = path.join(modulesDir, mod);
          const modSubs = safeReaddir(modDir);
          const hexLayers = ['domain', 'application', 'infrastructure', 'presentation']
            .filter(d => modSubs.includes(d)).length;
          if (hexLayers >= 3) return isMonorepo ? 'monorepo-hexagonal' : 'hexagonal';
        }
      }
    }
  }

  for (const dir of dirsToCheck) {
    const subDirs = safeReaddir(dir);
    const hasLayers = ['handler', 'service', 'repository', 'model', 'domain', 'usecase']
      .filter(d => subDirs.includes(d) || subDirs.includes(d + 's')).length;
    if (hasLayers >= 2) return isMonorepo ? 'monorepo-clean-architecture' : 'clean-architecture';
  }

  if (isMonorepo) return 'monorepo';
  return null;
}

function detectRootModule(projectRoot) {
  // Go
  const goMod = path.join(projectRoot, 'go.mod');
  if (fs.existsSync(goMod)) {
    const content = fs.readFileSync(goMod, 'utf8');
    const match = content.match(/^module\s+(.+)$/m);
    if (match) return match[1].trim();
  }
  // Node
  const pkg = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      return JSON.parse(fs.readFileSync(pkg, 'utf8')).name || null;
    } catch { /* ignore */ }
  }
  return null;
}

function findSourceDirs(projectRoot) {
  const dirs = [];
  const roots = ['internal', 'src', 'lib', 'app', 'pkg', 'cmd'];

  for (const root of roots) {
    const rootPath = path.join(projectRoot, root);
    if (fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory()) {
      walkDirs(rootPath, dirs, 3); // max depth 3
    }
  }

  // Monorepo: scan apps/ and packages/ workspaces
  const workspaceRoots = ['apps', 'packages', 'services', 'libs'];
  for (const wsRoot of workspaceRoots) {
    const wsPath = path.join(projectRoot, wsRoot);
    if (!fs.existsSync(wsPath) || !fs.statSync(wsPath).isDirectory()) continue;

    const workspaces = safeReaddir(wsPath).filter(d => {
      const dp = path.join(wsPath, d);
      try { return fs.statSync(dp).isDirectory(); } catch { return false; }
    });

    for (const ws of workspaces) {
      // Check src/ inside each workspace
      for (const srcDir of ['src', 'lib']) {
        const srcPath = path.join(wsPath, ws, srcDir);
        if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
          walkDirs(srcPath, dirs, 5); // deeper for nested module structures
        }
      }
      // Check prisma/ inside database packages
      const prismaPath = path.join(wsPath, ws, 'prisma');
      if (fs.existsSync(prismaPath)) dirs.push(prismaPath);
    }
  }

  // Also check top-level for migrations/, test/, prisma/
  const topLevel = ['migrations', 'migration', 'test', 'tests', 'spec', 'prisma'];
  for (const d of topLevel) {
    const dp = path.join(projectRoot, d);
    if (fs.existsSync(dp) && fs.statSync(dp).isDirectory()) {
      dirs.push(dp);
    }
  }

  return dirs;
}

function walkDirs(dir, result, maxDepth) {
  if (maxDepth <= 0) return;
  result.push(dir);
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walkDirs(path.join(dir, entry.name), result, maxDepth - 1);
      }
    }
  } catch { /* ignore permission errors */ }
}

function detectLayerFromDir(dir) {
  const name = path.basename(dir).toLowerCase();
  const layerMap = {
    handler: ['handler', 'handlers', 'controller', 'controllers', 'presentation', 'gateway', 'gateways'],
    service: ['service', 'services', 'usecase', 'usecases', 'application', 'commands', 'queries'],
    repository: ['repository', 'repositories', 'repo', 'repos', 'store', 'stores', 'dal', 'persistence'],
    domain: ['model', 'models', 'domain', 'entity', 'entities', 'value-objects', 'events', 'exceptions'],
    dto: ['dto', 'dtos', 'shared'],
    migration: ['migration', 'migrations'],
    test: ['test', 'tests', 'spec', 'specs'],
    config: ['config', 'configuration'],
    infra: ['infra', 'infrastructure', 'deploy'],
    middleware: ['middleware', 'middlewares'],
  };

  for (const [layer, names] of Object.entries(layerMap)) {
    if (names.includes(name)) return layer;
  }
  return 'other';
}

function listSourceFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && !f.startsWith('_'))
      .filter(f => /\.(go|ts|js|py|rs)$/.test(f));
  } catch {
    return [];
  }
}

function detectFilePattern(files) {
  if (files.length < 2) return null;
  // Find common suffix pattern
  const parts = files.map(f => f.split(/[._]/));
  if (parts.length > 0 && parts[0].length > 1) {
    const suffix = parts[0].slice(1).join('_');
    const allMatch = parts.every(p => p.slice(1).join('_') === suffix);
    if (allMatch) return `{name}_${suffix}`;
  }
  return null;
}

function pickReferenceFile(files, dir) {
  if (files.length === 0) return null;
  // Prefer files with "user" in name (common complete example), otherwise largest
  const userFile = files.find(f => f.includes('user'));
  if (userFile) return path.join(dir, userFile);

  // Pick largest file
  let largest = files[0];
  let maxSize = 0;
  for (const f of files) {
    try {
      const size = fs.statSync(path.join(dir, f)).size;
      if (size > maxSize) { maxSize = size; largest = f; }
    } catch { /* ignore */ }
  }
  return path.join(dir, largest);
}

function generateConventions(layer) {
  const conventions = {
    handler: [
      'Validate all input fields before processing',
      'Return DTO, never domain model',
      'Wrap errors with context before returning',
    ],
    service: [
      'Accept interfaces, return concrete',
      'Business logic only — no HTTP/DB concerns',
      'Return domain errors, not infrastructure errors',
    ],
    repository: [
      'Implement interface defined in service layer',
      'Return domain model, not DB model',
      'All queries must use parameterized inputs',
    ],
    domain: [
      'Domain models contain business logic, not persistence logic',
      'Validate invariants in constructor/factory',
      'No external dependencies in domain layer',
    ],
    migration: [
      'Always include UP and DOWN migration',
      'Add INDEX on every FK column',
      'Test on empty DB AND DB with existing data',
    ],
    test: [
      'Test behavior, not implementation details',
      'Include edge cases: nil, empty, boundary values',
      'Use table-driven tests for multiple scenarios',
    ],
  };
  return conventions[layer] || [];
}

function buildDependencyGraph(layers) {
  const graph = {};
  const order = {
    handler: ['service', 'dto'],
    service: ['repository', 'domain'],
    repository: ['domain'],
    dto: ['domain'],
    migration: [],
    test: [],
  };
  for (const layer of layers) {
    graph[layer] = (order[layer] || []).filter(d => layers.includes(d));
  }
  return graph;
}

function detectKeyFiles(projectRoot) {
  const keyFiles = {};
  const candidates = {
    entrypoint: ['cmd/api/main.go', 'cmd/main.go', 'main.go', 'src/index.ts', 'src/main.ts', 'app.py', 'src/main.rs',
      'apps/message/src/main.ts', 'apps/auth/src/main.ts', 'apps/backlog/src/main.ts'],
    router: ['internal/router/router.go', 'src/router.ts', 'src/routes/index.ts',
      'apps/message/src/app.module.ts', 'apps/auth/src/app.module.ts'],
    config: ['internal/config/config.go', 'src/config.ts', 'config/config.py',
      'apps/message/src/config/index.ts'],
    errors: ['internal/errors/errors.go', 'src/errors.ts'],
    schema: ['prisma/schema.prisma', 'packages/database/prisma/schema.prisma'],
  };

  for (const [key, paths] of Object.entries(candidates)) {
    for (const p of paths) {
      if (fs.existsSync(path.join(projectRoot, p))) {
        keyFiles[key] = p;
        break;
      }
    }
  }
  return keyFiles;
}

function detectFeatures(projectRoot, layers) {
  const features = {};
  for (const [layer, info] of Object.entries(layers)) {
    const dir = path.join(projectRoot, info.dir);
    const files = listSourceFiles(dir);
    for (const file of files) {
      // Extract feature name: user_handler.go → user, payment_service.go → payment
      const name = file.split(/[._]/)[0];
      if (!features[name]) features[name] = { name, files: [] };
      features[name].files.push(path.join(info.dir, file));
    }
  }
  return Object.values(features).filter(f => f.files.length > 1);
}

function getStackPractices(project) {
  const practices = {};

  if (project.stack === 'go') {
    practices['clean-architecture'] = [
      'Dependencies point inward: handler → service → repo → model',
      'Domain layer has zero external dependencies',
      'Cross-layer communication via interfaces only',
    ];
  }

  if (project.stack === 'typescript') {
    practices['typescript'] = [
      'Use strict TypeScript — no `any`, enable strictNullChecks',
      'Prefer interfaces for contracts, classes for implementations',
      'Use readonly where immutability is intended',
    ];
    if (project.framework === 'nestjs') {
      practices['nestjs'] = [
        'Use dependency injection — never instantiate services directly',
        'Validate DTOs with class-validator decorators',
        'Use Guards for auth, Interceptors for cross-cutting concerns',
      ];
    }
    if (project.architecture?.includes('hexagonal')) {
      practices['hexagonal'] = [
        'Domain layer: zero framework imports, pure business logic',
        'Application layer: CommandHandler/QueryHandler orchestrate domain',
        'Infrastructure layer: implements domain repository interfaces',
        'Presentation layer: Controllers dispatch to CommandBus/QueryBus',
      ];
    }
  }

  return practices;
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  } catch {
    return [];
  }
}

module.exports = { run, buildIndex };
