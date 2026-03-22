/**
 * aim skill — Skill management commands.
 *
 *   aim skill new <name> --type <type>   Scaffold a new skill from type template
 *   aim skill evolve <name> "<lesson>"   Append a lesson to skill's gotchas.md
 *   aim skill evolve <name> --from-mistake <id>  Pull lesson from mistakes.json
 *   aim skill list                       List all skills with health status
 */
const fs = require('fs');
const path = require('path');

const SKILL_TYPES = [
  'knowledge', 'verification', 'data', 'automation',
  'scaffolding', 'review', 'runbook', 'infra'
];

function run() {
  const args = process.argv.slice(3);
  const subcommand = args[0];

  const projectRoot = process.cwd();

  if (subcommand === 'new') {
    return runNew(args.slice(1), projectRoot);
  } else if (subcommand === 'evolve') {
    return runEvolve(args.slice(1), projectRoot);
  } else if (subcommand === 'list') {
    return runList(projectRoot);
  } else {
    printHelp();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// aim skill new <name> --type <type>
// ──────────────────────────────────────────────────────────────────────────────

function runNew(args, projectRoot) {
  const name = args.find(a => !a.startsWith('-'));
  const typeFlag = args.indexOf('--type');
  const type = typeFlag >= 0 ? args[typeFlag + 1] : 'knowledge';

  if (!name) {
    console.error('Error: skill name required\n  aim skill new <name> --type <type>');
    process.exit(1);
  }

  if (!SKILL_TYPES.includes(type)) {
    console.error(`Error: unknown type "${type}"\n  Valid types: ${SKILL_TYPES.join(', ')}`);
    process.exit(1);
  }

  const skillsDir = path.join(projectRoot, '.aim', 'skills');
  const targetDir = path.join(skillsDir, name);

  if (fs.existsSync(targetDir)) {
    console.error(`Error: skill "${name}" already exists at ${targetDir}`);
    process.exit(1);
  }

  // Find type template: _type-{type}/ first, then fall back to _template/
  const typeTemplatePath = path.join(skillsDir, `_type-${type}`);
  const genericTemplatePath = path.join(skillsDir, '_template');
  const templateSource = fs.existsSync(typeTemplatePath)
    ? typeTemplatePath
    : (fs.existsSync(genericTemplatePath) ? genericTemplatePath : null);

  if (!templateSource) {
    console.error('Error: no template found. Run `aim adapt claude-code` to generate templates.');
    process.exit(1);
  }

  // Copy template → target, replacing placeholders
  console.log(`\n📦 Creating skill "${name}" (type: ${type})...\n`);
  copyWithPlaceholders(templateSource, targetDir, {
    '{skill-name}': name,
    '{type}': type,
  });

  // Add entry to SKILLS.md index
  const skillsIndexPath = path.join(skillsDir, 'SKILLS.md');
  addToSkillsIndex(skillsIndexPath, name, type);

  console.log(`✅ Skill "${name}" created at .aim/skills/${name}/\n`);
  console.log('Next steps:');
  console.log(`  1. Edit .aim/skills/${name}/SKILL.md`);
  console.log(`     - Fill in Purpose, Use When, Required Inputs, Expected Output`);
  console.log(`     - Update SKILL-CONTEXT block (used for injection)`);
  console.log(`  2. Add trigger keywords in SKILLS.md (replace placeholders)`);
  console.log(`  3. Add knowledge fragments to .aim/skills/${name}/knowledge/`);
  console.log(`  4. Add templates to .aim/skills/${name}/templates/ (if applicable)`);
  console.log('');
}

function copyWithPlaceholders(src, dest, replacements) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyWithPlaceholders(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath, 'utf8');
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.split(placeholder).join(value);
      }
      fs.writeFileSync(destPath, content);
    }
  }
}

function addToSkillsIndex(indexPath, skillName, type) {
  const newRow = `| ${skillName} | ${type} | [keyword1], [keyword2] | skills/${skillName}/ |`;

  if (!fs.existsSync(indexPath)) {
    const header = [
      '# Skills Index',
      '',
      '| Skill | Type | Triggers | Path |',
      '|-------|------|----------|------|',
      newRow,
      '',
    ].join('\n');
    fs.writeFileSync(indexPath, header);
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  if (content.includes(`| ${skillName} |`)) return; // already exists

  // Append before last blank line or at end
  const updated = content.trimEnd() + '\n' + newRow + '\n';
  fs.writeFileSync(indexPath, updated);
  console.log(`  Updated SKILLS.md index (placeholder triggers — fill them in)`);
}

// ──────────────────────────────────────────────────────────────────────────────
// aim skill evolve <name> "<lesson>" [--from-mistake <id>]
// ──────────────────────────────────────────────────────────────────────────────

function runEvolve(args, projectRoot) {
  const name = args.find(a => !a.startsWith('-'));
  if (!name) {
    console.error('Error: skill name required\n  aim skill evolve <name> "<lesson>"');
    process.exit(1);
  }

  const skillDir = path.join(projectRoot, '.aim', 'skills', name);
  if (!fs.existsSync(skillDir)) {
    console.error(`Error: skill "${name}" not found at .aim/skills/${name}/`);
    process.exit(1);
  }

  const gotchasPath = path.join(skillDir, 'evolution', 'gotchas.md');
  if (!fs.existsSync(gotchasPath)) {
    fs.mkdirSync(path.join(skillDir, 'evolution'), { recursive: true });
    fs.writeFileSync(gotchasPath, `# Gotchas: ${name}\n`);
  }

  // --from-mistake <id>: pull from mistakes.json
  const mistakeFlag = args.indexOf('--from-mistake');
  if (mistakeFlag >= 0) {
    const mistakeId = args[mistakeFlag + 1];
    return evolveFromMistake(name, mistakeId, skillDir, gotchasPath, projectRoot);
  }

  // Direct lesson string
  const lesson = args.filter(a => !a.startsWith('-') && a !== name).join(' ').trim();
  if (!lesson) {
    console.error('Error: lesson text required\n  aim skill evolve <name> "<lesson>"');
    process.exit(1);
  }

  appendGotcha(gotchasPath, lesson, 'Manual entry', 'See lesson description above.');
  bumpChangelog(path.join(skillDir, 'SKILL.md'), `auto-evolved: ${lesson.slice(0, 60)}`);
  console.log(`\n✅ Lesson recorded in .aim/skills/${name}/evolution/gotchas.md\n`);
}

function evolveFromMistake(skillName, mistakeId, skillDir, gotchasPath, projectRoot) {
  const mistakesPath = path.join(projectRoot, '.aim', 'mistakes.json');
  if (!fs.existsSync(mistakesPath)) {
    console.error('Error: .aim/mistakes.json not found');
    process.exit(1);
  }

  let db;
  try { db = JSON.parse(fs.readFileSync(mistakesPath, 'utf8')); }
  catch { console.error('Error: invalid mistakes.json'); process.exit(1); }

  const mistake = (db.items || []).find(m => String(m.id) === String(mistakeId));
  if (!mistake) {
    console.error(`Error: mistake #${mistakeId} not found`);
    process.exit(1);
  }

  appendGotcha(gotchasPath, mistake.summary, mistake.category, mistake.prevention);
  bumpChangelog(path.join(skillDir, 'SKILL.md'), `from-mistake #${mistakeId}: ${mistake.summary.slice(0, 50)}`);
  console.log(`\n✅ Mistake #${mistakeId} linked to skill "${skillName}"\n`);
  console.log(`   ${mistake.summary}`);
  console.log(`   → .aim/skills/${skillName}/evolution/gotchas.md\n`);
}

function appendGotcha(gotchasPath, summary, rootCause, fix) {
  const heading = `## ${summary.slice(0, 80)}`;
  const existing = fs.readFileSync(gotchasPath, 'utf8');
  if (existing.includes(heading)) {
    console.log('  (already documented — skipped)');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const entry = [
    '',
    heading,
    `**Root cause:** ${rootCause}`,
    `**Fix:** ${fix}`,
    `**Recorded:** ${today}`,
  ].join('\n');
  fs.appendFileSync(gotchasPath, entry + '\n');
}

function bumpChangelog(skillMdPath, note) {
  if (!fs.existsSync(skillMdPath)) return;
  const content = fs.readFileSync(skillMdPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);

  // Find current version from last changelog entry
  const versionMatch = content.match(/- v(\d+)\.(\d+):/g);
  let newVersion = 'v1.1';
  if (versionMatch) {
    const last = versionMatch[versionMatch.length - 1];
    const [, major, minor] = last.match(/v(\d+)\.(\d+)/);
    newVersion = `v${major}.${parseInt(minor) + 1}`;
  }

  const newEntry = `- ${newVersion}: ${today} — ${note}`;

  if (content.includes('## Changelog')) {
    const updated = content.replace(
      /## Changelog\n/,
      `## Changelog\n${newEntry}\n`
    );
    fs.writeFileSync(skillMdPath, updated);
  } else {
    fs.appendFileSync(skillMdPath, `\n## Changelog\n${newEntry}\n`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// aim skill list
// ──────────────────────────────────────────────────────────────────────────────

function runList(projectRoot) {
  const skillsDir = path.join(projectRoot, '.aim', 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.log('No .aim/skills/ directory found. Run `aim adapt claude-code` first.');
    return;
  }

  // Load SKILLS.md index for type info
  const indexPath = path.join(skillsDir, 'SKILLS.md');
  const indexedSkills = {};
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.startsWith('|')) continue;
      if (/[-–]{3,}/.test(line) || /skill\s*\|/i.test(line)) continue;
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) indexedSkills[cols[0]] = cols[1]; // name → type
    }
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'));

  if (entries.length === 0) {
    console.log('No user skills found. Run `aim skill new <name>` to create one.');
    return;
  }

  console.log('\n📚 Skills Health:\n');
  console.log('  Name'.padEnd(30), 'Type'.padEnd(14), 'SKILL.md', 'verify/', 'evolve/', 'SKILLS.md');
  console.log('  ' + '─'.repeat(80));

  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.name);
    const hasSKILL = fs.existsSync(path.join(dir, 'SKILL.md'));
    const hasVerify = fs.existsSync(path.join(dir, 'verification', 'checklist.md'));
    const hasEvolve = fs.existsSync(path.join(dir, 'evolution', 'gotchas.md'));
    const inIndex = Boolean(indexedSkills[entry.name]);
    const type = indexedSkills[entry.name] || '?';

    const icon = (v) => v ? '✅' : '❌';
    const warn = (!hasSKILL || !hasVerify || !hasEvolve || !inIndex);

    console.log(
      `  ${(warn ? '⚠️ ' : '  ') + entry.name}`.padEnd(34),
      type.padEnd(14),
      icon(hasSKILL).padEnd(10),
      icon(hasVerify).padEnd(9),
      icon(hasEvolve).padEnd(9),
      icon(inIndex)
    );
  }

  console.log('');
  const issues = [];
  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.name);
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) {
      issues.push(`  ${entry.name}: missing SKILL.md`);
    }
    if (!fs.existsSync(path.join(dir, 'verification', 'checklist.md'))) {
      issues.push(`  ${entry.name}: missing verification/checklist.md`);
    }
    if (!indexedSkills[entry.name]) {
      issues.push(`  ${entry.name}: not in SKILLS.md index (won't be auto-routed)`);
    }
  }

  if (issues.length > 0) {
    console.log('Issues:');
    issues.forEach(i => console.log(i));
    console.log('');
  } else {
    console.log('✅ All skills healthy\n');
  }
}

function printHelp() {
  console.log(`
AIM Skill Management

Usage:
  aim skill new <name> --type <type>       Scaffold new skill from type template
  aim skill evolve <name> "<lesson>"       Append lesson to evolution/gotchas.md
  aim skill evolve <name> --from-mistake <id>  Pull lesson from mistakes.json
  aim skill list                           List skills with health status

Skill types: ${SKILL_TYPES.join(', ')}

Examples:
  aim skill new verify-grpc-handler --type verification
  aim skill new create-report --type automation
  aim skill evolve add-cqrs-command "WithTx required for check-then-insert"
  aim skill evolve postgres-best-practices --from-mistake 42
`);
}

module.exports = { run };
