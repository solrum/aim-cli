#!/usr/bin/env node
const command = process.argv[2];

if (command === '-v' || command === '--version') {
  const { version } = require('../package.json');
  console.log(`aim v${version}`);
  process.exit(0);
}

const commands = {
  install:   () => require('../cli/install').run(),
  update:    () => require('../cli/update').run(),
  init:      () => require('../cli/init').run(),
  index:     () => require('../cli/index').run(),
  mistake:   () => require('../cli/mistake').run(),
  knowledge: () => require('../cli/knowledge').run(),
  adapt:     () => require('../cli/adapt').run(),
  stats:     () => require('../cli/stats').run(),
  doctor:    () => require('../cli/doctor').run(),
  pack:      () => require('../cli/pack').run(),
};

if (!command || command === 'help' || command === '-h' || command === '--help' || !commands[command]) {
  console.log(`AIM — AI Implementation Manager

Usage:
  aim install                     Download aim-core to ~/.aim/core/
  aim update                      Update aim-core to latest version
  aim init [tool]                 Scan project, generate aim.json + .aim/ + runtime
  aim init [tool] --refresh       Re-scan without overwriting aim.json
  aim index [--refresh]           Build or refresh context index
  aim mistake <add|list|stats>    Manage mistake database
  aim knowledge <add|list>        Manage custom knowledge fragments
  aim adapt <tool>                Generate hooks + skills + runtime
  aim adapt <tool> --update       Update runtime scripts to latest version
  aim adapt <tool> --remove       Remove AIM hooks (keeps user hooks)
  aim stats                       Show effectiveness metrics
  aim doctor                      Validate setup and diagnose issues
  aim pack <command>              Manage community knowledge packs

Tools: claude-code, cursor, windsurf, generic
`);
  process.exit(0);
}

commands[command]();
