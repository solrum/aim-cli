async function run() {
  const args = process.argv.slice(3);
  const subcommand = args[0];

  const core = require('./core-resolver').resolveCore();

  const { loadMistakes, saveMistakes } = core.runtime.mistakes;
  const isGlobal = args.includes('--global');
  const scope = isGlobal ? 'global' : 'project';

  switch (subcommand) {
    case 'list':
      listMistakes(scope, args[1]);
      break;
    case 'stats':
      showStats(scope);
      break;
    case 'clear':
      clearMistake(scope, args[1]);
      break;
    default:
      console.log(`Usage: aim mistake <command> [--global]

Commands:
  list [category]   List mistakes, optionally filtered by category
  stats             Show mistake statistics
  clear <id>        Remove mistake by ID

Options:
  --global          Use global mistake DB (~/.aim/global-mistakes.json)

Categories: architecture, database, testing, security, performance, api, validation, error-handling, naming, other

Note: Use /aim-mistake in your AI tool to add mistakes interactively.
`);
      process.exit(1);
  }
}

function listMistakes(scope, category) {
  const core = require('./core-resolver').resolveCore();

  const db = core.runtime.mistakes.loadMistakes(scope);
  let items = db.items || [];

  if (category) {
    items = items.filter(m => m.category === category);
  }

  if (items.length === 0) {
    console.log(category
      ? `No mistakes found in category "${category}".`
      : 'No mistakes recorded yet.');
    return;
  }

  console.log(`\nMistakes (${scope}, ${items.length} total):\n`);
  console.log('ID       | Sev    | Cat          | Occ | Summary');
  console.log('---------|--------|--------------|-----|--------');

  items.forEach(m => {
    const id = (m.id || '?').padEnd(8);
    const sev = (m.severity || '?').padEnd(6);
    const cat = (m.category || '?').padEnd(12);
    const occ = String(m.occurrences || 1).padStart(3);
    console.log(`${id} | ${sev} | ${cat} | ${occ} | ${m.summary || ''}`);
  });

  console.log('');
}

function showStats(scope) {
  const core = require('./core-resolver').resolveCore();

  const db = core.runtime.mistakes.loadMistakes(scope);
  const items = db.items || [];

  if (items.length === 0) {
    console.log('No mistakes recorded yet.');
    return;
  }

  // By category
  const byCategory = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };

  items.forEach(m => {
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    if (m.severity) bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1;
  });

  // Top 5 most frequent
  const top5 = [...items]
    .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
    .slice(0, 5);

  // Stale (30+ days)
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const stale = items.filter(m =>
    m.lastSeen && new Date(m.lastSeen).getTime() < thirtyDaysAgo
  );

  console.log(`
Mistake Statistics (${scope})
${'═'.repeat(40)}

Total: ${items.length}

By severity:
  High:   ${bySeverity.high}
  Medium: ${bySeverity.medium}
  Low:    ${bySeverity.low}

By category:`);

  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });

  console.log('\nTop 5 most frequent:');
  top5.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.summary} (${m.occurrences || 1}x, ${m.severity})`);
  });

  if (stale.length > 0) {
    console.log(`\nStale (30+ days without occurrence): ${stale.length}`);
    stale.forEach(m => {
      console.log(`  - ${m.id}: ${m.summary}`);
    });
  }

  console.log('');
}

function clearMistake(scope, id) {
  if (!id) {
    console.error('Error: provide mistake ID. Usage: aim mistake clear <id>');
    process.exit(1);
  }

  const core = require('./core-resolver').resolveCore();

  const db = core.runtime.mistakes.loadMistakes(scope);
  const idx = (db.items || []).findIndex(m => m.id === id);

  if (idx === -1) {
    console.error(`Mistake "${id}" not found.`);
    process.exit(1);
  }

  const removed = db.items.splice(idx, 1)[0];
  core.runtime.mistakes.saveMistakes(db, scope);
  console.log(`✓ Removed mistake ${id}: ${removed.summary}`);
}

module.exports = { run };
