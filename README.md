# AIM — AI Implementation Manager

AIM makes AI coding tools actually follow your project's rules. Instead of hoping Claude/Cursor/Windsurf remembers your architecture after 30 turns, AIM actively injects the right rule at the right time — and blocks edits when something's wrong.

## The Problem

AI coding tools share 3 common failure modes:

1. **Context decay** — Rules loaded at session start get compressed away after 20-30 turns. The AI "forgets" your conventions mid-task.
2. **No checkpoints** — After approving a plan, the AI runs 50 tool calls straight. One mistake at step 5 cascades through steps 6-50.
3. **Same mistakes, different day** — The AI makes the same architectural violation across sessions because there's no memory between them.

## How AIM Fixes This

**Just-in-time rules** — Instead of loading everything upfront, AIM injects only the relevant rules right before each edit. Editing a migration file? You get database safety rules. Touching a domain entity? You get layer dependency rules.

**Mandatory checkpoints** — Large tasks get decomposed into chunks. After each chunk, AIM blocks further edits until you run build + tests. No more cascade failures.

**Mistake memory** — When a pattern violation is detected, AIM records it. Next time the AI touches a similar file, it sees "you've made this mistake 3 times before — here's how to avoid it."

## Install

```bash
npm install -g @solrum/aim
aim install
```

`npm install -g` installs the CLI. `aim install` downloads aim-core to `~/.aim/core/` (git clone). Requires Node.js 18+ and git.

## Quick Start

```bash
# 1. Install aim-core (one-time setup)
aim install

# 2. Initialize in your project (auto-detects stack, installs knowledge packs)
cd your-project
aim init

# That's it. AIM is now active.
# Open your AI tool and use the /aim-* commands:
```

| Command | What it does |
|---------|-------------|
| `/aim-kickstart` | Bootstrap a new project — brainstorm features, design architecture, create roadmap |
| `/aim-plan` | Break a feature into verified chunks before coding |
| `/aim-implement` | Execute a plan with checkpoints and context refresh per chunk |
| `/aim-review` | Code review against your architecture rules |
| `/aim-debug` | Systematic debugging with root cause analysis |
| `/aim-refactor` | Safe refactoring with before/after verification |
| `/aim-analyze` | Post-implementation analysis — what went well, what didn't |
| `/aim-index` | Update the codebase map after changes |

## Supported Tools

| Tool | Mode | What you get |
|------|------|-------------|
| **Claude Code** | Full | Runtime hooks (active enforcement) + all 12 skills |
| **Cursor** | Lite | `.cursorrules` with baked-in conventions + skills as prompts |
| **Windsurf** | Lite | `.windsurfrules` with baked-in conventions + skills as prompts |
| **Other** | Generic | Skills as reference prompts in `.aim/prompts/` |

```bash
# Default is claude-code. Switch with:
aim adapt cursor
aim adapt windsurf
```

## Knowledge Packs

AIM ships with 6 knowledge packs that get auto-installed based on your stack:

- **PostgreSQL** — Migration safety, indexing rules, connection pooling patterns
- **API Design** — REST conventions, error handling, versioning strategies
- **Testing** — Unit/integration/e2e patterns, test architecture
- **Docker** — Dockerfile optimization, compose patterns
- **Security** — Input validation, auth patterns, dependency safety
- **CI/CD** — GitHub Actions, deployment strategies, quality gates

Install community packs:
```bash
aim pack install @aim-community/pack-redis
aim pack list
```

## What Gets Created

After `aim init`, your project has:

```
your-project/
  aim.json                    # Project config (stack, rules, workflow)
  .aim/
    runtime/                  # Hook scripts (auto-managed)
    packs/                    # Installed knowledge packs
    context-index.json        # Codebase architecture map (after /aim-index)
    mistakes.json             # Mistake database (grows over time)
    violations.json           # Current violations (self-heals)
    metrics.json              # Usage metrics
  .claude/
    hooks.json                # Claude Code hooks (auto-managed)
    commands/aim-*.md         # Skill files
```

Files in `.aim/runtime/` and `.claude/commands/aim-*` are auto-managed. Don't edit them manually — they get overwritten on `aim adapt --update`.

## Configuration

`aim.json` controls AIM's behavior:

```json
{
  "stack": "typescript",
  "framework": "nestjs",
  "database": "postgresql",
  "enforcement": {
    "default": "nudge",
    "overrides": {
      "domain/|entity/": "gate"
    }
  },
  "workflow": {
    "buildCommand": "npm run build",
    "testCommand": "npm test"
  },
  "mistakes": {
    "autoRecord": true
  }
}
```

**Enforcement levels:**
- `nudge` (default) — Shows rules as suggestions
- `gate` — AI must acknowledge rules before editing
- `block` — Edit blocked until conditions met (e.g., plan required)

## CLI Reference

```
AIM — AI Implementation Manager

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
```

Run `aim` or `aim help` to see this help text.

## Troubleshooting

```bash
# Something not working?
aim doctor

# Hooks not firing in Claude Code?
aim adapt claude-code --update

# Want to start fresh?
aim adapt claude-code --remove
rm -rf .aim/
aim init
```

## License

MIT
