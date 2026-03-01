const fs = require('fs');
const path = require('path');
const { checkInit } = require('./utils');

async function run() {
  const args = process.argv.slice(3);
  const subcommand = args[0];
  const projectRoot = process.cwd();
  checkInit(projectRoot);

  switch (subcommand) {
    case 'add':
      addKnowledge(projectRoot, args[1]);
      break;
    case 'list':
      listKnowledge(projectRoot);
      break;
    default:
      console.log(`Usage: aim knowledge <command>

Commands:
  add <topic>    Create a knowledge fragment file for a topic
  list           List all knowledge fragments

Knowledge files live in .aim/knowledge/ and contain tagged fragments
that are injected per-chunk during implementation.

Example:
  aim knowledge add postgresql
  aim knowledge add testing
  aim knowledge add cqrs
`);
      process.exit(1);
  }
}

function addKnowledge(projectRoot, topic) {
  if (!topic) {
    console.error('Error: provide a topic name. Usage: aim knowledge add <topic>');
    process.exit(1);
  }

  const knowledgeDir = path.join(projectRoot, '.aim', 'knowledge');
  if (!fs.existsSync(knowledgeDir)) fs.mkdirSync(knowledgeDir, { recursive: true });

  const filePath = path.join(knowledgeDir, `${topic}.md`);
  if (fs.existsSync(filePath)) {
    console.log(`Knowledge file already exists: ${filePath}`);
    console.log('Edit it directly to add more fragments.');
    return;
  }

  const template = `# ${topic} Practices

## fragment: example
tags: [${topic}]
when: working with ${topic}
---
1. [Add your best practice here]
2. [Add another practice]
3. [Add another practice]
---
`;

  fs.writeFileSync(filePath, template);
  console.log(`✓ Created ${filePath}`);
  console.log('Edit this file to add your project-specific practices.');
  console.log('');
  console.log('Fragment format:');
  console.log('  ## fragment: <name>');
  console.log('  tags: [tag1, tag2]');
  console.log('  when: <condition>');
  console.log('  ---');
  console.log('  <your practices>');
  console.log('  ---');
}

function listKnowledge(projectRoot) {
  const knowledgeDir = path.join(projectRoot, '.aim', 'knowledge');

  if (!fs.existsSync(knowledgeDir)) {
    console.log('No knowledge directory found. Run `aim knowledge add <topic>` to create one.');
    return;
  }

  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.md'));

  if (files.length === 0) {
    console.log('No knowledge fragments found. Run `aim knowledge add <topic>` to create one.');
    return;
  }

  console.log(`\nKnowledge Fragments (.aim/knowledge/):\n`);

  for (const file of files) {
    const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf8');
    const fragmentCount = (content.match(/^## fragment: /gm) || []).length;
    const tags = new Set();
    const tagMatches = content.matchAll(/tags: \[([^\]]+)\]/g);
    for (const match of tagMatches) {
      match[1].split(',').map(t => t.trim()).forEach(t => tags.add(t));
    }

    const topic = file.replace('.md', '');
    console.log(`  ${topic}`);
    console.log(`    Fragments: ${fragmentCount}`);
    console.log(`    Tags: ${[...tags].join(', ') || 'none'}`);
    console.log('');
  }
}

module.exports = { run };
