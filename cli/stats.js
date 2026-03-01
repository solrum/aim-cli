const { checkInit } = require('./utils');

function run() {
  const core = require('./core-resolver').resolveCore();

  const projectRoot = process.cwd();
  checkInit(projectRoot);
  const stats = core.runtime.metrics.getStats(projectRoot);

  if (!stats) {
    console.log('No metrics collected yet. Use AIM on a project to start tracking.');
    return;
  }

  console.log(`
AIM Metrics
${'═'.repeat(50)}

Last 7 days:
  Edits tracked:          ${stats.last7days.totalEdits}
  Mistakes caught:        ${stats.last7days.mistakesCaught} (${stats.last7days.mistakeCatchRate})
  Chunks completed:       ${stats.last7days.chunksCompleted}
  Chunk fail rate:        ${stats.last7days.chunkFailRate}
  Checkpoint honor rate:  ${stats.last7days.checkpointHonorRate}
  Guard triggers:         ${stats.last7days.guardTriggers}
  Build failures:         ${stats.last7days.buildFailures}

Last 30 days:
  Edits tracked:          ${stats.last30days.totalEdits}
  Mistakes caught:        ${stats.last30days.mistakesCaught} (${stats.last30days.mistakeCatchRate})
  Chunks completed:       ${stats.last30days.chunksCompleted}
  Chunk fail rate:        ${stats.last30days.chunkFailRate}
  Checkpoint honor rate:  ${stats.last30days.checkpointHonorRate}
  Knowledge injections:   ${stats.last30days.knowledgeInjections}
`);
}

module.exports = { run };
