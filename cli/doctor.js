const fs = require('fs');
const path = require('path');

function run() {
  const projectRoot = process.cwd();
  const issues = [];
  const ok = [];

  console.log('\n🔍 AIM Doctor — Validating setup...\n');

  // 1. Check aim.json
  const configPath = path.join(projectRoot, 'aim.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      ok.push(`aim.json exists (stack: ${config.stack || 'unknown'})`);

      if (!config.workflow?.buildCommand) {
        issues.push('aim.json: workflow.buildCommand is not set');
      }
      if (!config.workflow?.testCommand) {
        issues.push('aim.json: workflow.testCommand is not set');
      }
    } catch (e) {
      issues.push(`aim.json: invalid JSON — ${e.message}`);
    }
  } else {
    issues.push('aim.json not found. Run `aim init` first.');
  }

  // 2. Check .aim/ directory
  const aimDir = path.join(projectRoot, '.aim');
  if (fs.existsSync(aimDir)) {
    ok.push('.aim/ directory exists');
  } else {
    issues.push('.aim/ directory not found. Run `aim init` first.');
  }

  // 3. Check runtime
  const runtimeDir = path.join(projectRoot, '.aim', 'runtime', 'hook-entry.js');
  if (fs.existsSync(runtimeDir)) {
    ok.push('.aim/runtime/ hook scripts present');
  } else {
    issues.push('.aim/runtime/ not found. Run `aim adapt claude-code` to generate.');
  }

  // 4. Check hooks.json (Claude Code)
  const hooksPath = path.join(projectRoot, '.claude', 'hooks.json');
  if (fs.existsSync(hooksPath)) {
    try {
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      const aimHooks = [];
      for (const [event, handlers] of Object.entries(hooks.hooks || {})) {
        const aim = (handlers || []).filter(h => h.description?.startsWith('AIM:'));
        aim.forEach(h => aimHooks.push(`${event}: ${h.description}`));
      }
      if (aimHooks.length > 0) {
        ok.push(`hooks.json has ${aimHooks.length} AIM hooks`);
      } else {
        issues.push('hooks.json exists but no AIM hooks found. Run `aim adapt claude-code`.');
      }
    } catch (e) {
      issues.push(`hooks.json: invalid JSON — ${e.message}`);
    }
  } else {
    issues.push('.claude/hooks.json not found. Run `aim adapt claude-code` to generate.');
  }

  // 5. Check skills
  const commandsDir = path.join(projectRoot, '.claude', 'commands');
  const expectedSkills = [
    'aim-implement.md', 'aim-plan.md', 'aim-mistake.md', 'aim-index.md',
    'aim-review.md', 'aim-debug.md', 'aim-learn.md', 'aim-refactor.md',
    'aim-kickstart.md', 'aim-roadmap.md', 'aim-todo.md', 'aim-analyze.md'
  ];
  const foundSkills = expectedSkills.filter(s =>
    fs.existsSync(path.join(commandsDir, s))
  );
  if (foundSkills.length === expectedSkills.length) {
    ok.push(`All ${expectedSkills.length} skill files present`);
  } else {
    const missing = expectedSkills.filter(s => !foundSkills.includes(s));
    issues.push(`Missing skills: ${missing.join(', ')}. Run \`aim adapt claude-code\`.`);
  }

  // 6. Check context-index.json
  const indexPath = path.join(projectRoot, '.aim', 'context-index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const moduleCount = Object.keys(idx.modules || {}).length;
      const withRules = Object.values(idx.modules || {}).filter(m => m.businessRules?.length > 0).length;
      const layerCount = Object.keys(idx.layers || {}).length;
      ok.push(`context-index.json: v${idx.version || '?'}, ${moduleCount} modules, ${layerCount} layers`);
      if (withRules < moduleCount) {
        issues.push(`context-index.json: ${moduleCount - withRules}/${moduleCount} modules missing businessRules. Run \`/aim-index --refresh\`.`);
      } else if (moduleCount > 0) {
        ok.push(`context-index.json: all ${moduleCount} modules have businessRules`);
      }
    } catch (e) {
      issues.push(`context-index.json: invalid JSON — ${e.message}`);
    }
  } else {
    issues.push('context-index.json not found. Run `/aim-index` to generate.');
  }

  // 7. Check mistakes.json
  const mistakesPath = path.join(projectRoot, '.aim', 'mistakes.json');
  if (fs.existsSync(mistakesPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(mistakesPath, 'utf8'));
      ok.push(`mistakes.json: ${(db.items || []).length} mistakes tracked`);
    } catch {
      issues.push('mistakes.json: invalid JSON');
    }
  } else {
    ok.push('mistakes.json: not yet created (will be created on first mistake)');
  }

  // 7b. Check roadmap.json
  const roadmapPath = path.join(projectRoot, '.aim', 'roadmap.json');
  if (fs.existsSync(roadmapPath)) {
    try {
      const roadmap = JSON.parse(fs.readFileSync(roadmapPath, 'utf8'));
      const phases = roadmap.phases || [];
      const features = roadmap.features || [];
      const done = features.filter(f => f.status === 'done').length;

      // Validate dependency references
      const featureIds = new Set(features.map(f => f.id));
      const badDeps = features.filter(f =>
        (f.dependencies || []).some(d => !featureIds.has(d))
      );
      if (badDeps.length > 0) {
        issues.push(`roadmap.json: ${badDeps.length} feature(s) reference non-existent dependencies`);
      }

      // Validate phase references
      const phaseIds = new Set(phases.map(p => p.id));
      const badPhase = features.filter(f => f.phase && !phaseIds.has(f.phase));
      if (badPhase.length > 0) {
        issues.push(`roadmap.json: ${badPhase.length} feature(s) reference non-existent phase`);
      }

      ok.push(`roadmap.json: ${phases.length} phases, ${features.length} features (${done} done)`);
    } catch (e) {
      issues.push(`roadmap.json: invalid JSON — ${e.message}`);
    }
  } else {
    ok.push('roadmap.json: not yet created (run /aim-kickstart to create)');
  }

  // 7c. Check todo.json
  const todoPath = path.join(projectRoot, '.aim', 'todo.json');
  if (fs.existsSync(todoPath)) {
    try {
      const todo = JSON.parse(fs.readFileSync(todoPath, 'utf8'));
      const tasks = todo.tasks || [];
      const done = tasks.filter(t => t.status === 'completed').length;
      ok.push(`todo.json: ${tasks.length} tasks (${done} completed), current: ${todo.currentFeature || 'none'}`);

      if (todo.currentSession && !todo.currentFeature) {
        issues.push('todo.json: has active session but no currentFeature set');
      }
    } catch (e) {
      issues.push(`todo.json: invalid JSON — ${e.message}`);
    }
  } else {
    ok.push('todo.json: not yet created (run /aim-kickstart to create)');
  }

  // 8. Check .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    if (content.includes('AIM')) {
      ok.push('.gitignore includes AIM entries');
    } else {
      issues.push('.gitignore missing AIM entries. Run `aim init` to add.');
    }
  }

  // 9. Check installed packs
  const packsDir = path.join(projectRoot, '.aim', 'packs');
  const regPath = path.join(packsDir, 'installed.json');
  if (fs.existsSync(regPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(regPath, 'utf8'));
      const packNames = Object.keys(registry.packs || {});
      let packIssues = 0;
      for (const name of packNames) {
        const packJson = path.join(packsDir, name, 'pack.json');
        if (!fs.existsSync(packJson)) {
          issues.push(`Pack "${name}": registered but missing pack.json`);
          packIssues++;
        }
      }
      if (packIssues === 0) {
        ok.push(`packs: ${packNames.length} installed (${packNames.join(', ') || 'none'})`);
      }
    } catch (e) {
      issues.push(`installed.json: invalid JSON — ${e.message}`);
    }
  } else {
    ok.push('packs: none installed');
  }

  // 10. Check aim-core availability
  try {
    const core = require('./core-resolver').resolveCore();
    ok.push(`aim-core: available (adapters: ${Object.keys(core.adapters).join(', ')})`);
  } catch {
    issues.push('aim-core: not found. Run `aim install` to download.');
  }

  // Output
  console.log('✓ Passing:');
  ok.forEach(msg => console.log(`  ✓ ${msg}`));

  if (issues.length > 0) {
    console.log('\n✗ Issues:');
    issues.forEach(msg => console.log(`  ✗ ${msg}`));
    console.log(`\n${issues.length} issue(s) found. Fix them and run \`aim doctor\` again.`);
  } else {
    console.log('\n✅ All checks passed. AIM is ready to use.');
  }

  console.log('');
}

module.exports = { run };
