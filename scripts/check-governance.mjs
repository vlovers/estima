#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const required = [
  'AGENTS.md', 'CLAUDE.md', '.github/PULL_REQUEST_TEMPLATE.md',
  'docs/engineering/MULTI_AGENT_WORKFLOW.md',
  'docs/engineering/DEFINITION_OF_DONE.md',
  'docs/engineering/REVIEW_POLICY.md',
  'docs/engineering/RELEASE_CHECKLIST.md',
];

const markers = {
  'AGENTS.md': ['MULTI_AGENT_WORKFLOW.md', 'worktree', 'review'],
  'CLAUDE.md': ['AGENTS.md'],
  '.github/PULL_REQUEST_TEMPLATE.md': ['MULTI_AGENT_WORKFLOW.md', 'head SHA', 'review'],
  'docs/engineering/MULTI_AGENT_WORKFLOW.md': ['worktree', 'Issue', 'review'],
};

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

export function checkGovernance(directory) {
  const errors = [];
  const root = realpathSync(resolve(directory));
  for (const name of required) {
    const file = resolve(root, name);
    let contents;
    try {
      if (!inside(root, realpathSync(file)) || !statSync(file).isFile()) throw Error('not a safe file');
      contents = readFileSync(file, 'utf8');
    } catch {
      errors.push(name + ': missing, unreadable or escapes repository');
      continue;
    }
    if (contents.trim().length < 20) errors.push(name + ': empty');
    for (const marker of markers[name] ?? []) {
      if (!contents.toLowerCase().includes(marker.toLowerCase())) {
        errors.push(name + ': missing marker ' + marker);
      }
    }
    for (const match of contents.matchAll(/(?<!!)\[[^\]\n]+\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][\da-z+.-]*:|\/|#|\{|<)/i.test(link)) continue;
      let target;
      try {
        const decoded = decodeURIComponent(link.split('#')[0].split('?')[0]);
        if (!decoded) continue;
        target = resolve(root, dirname(name), decoded);
        if (!inside(root, target) || !inside(root, realpathSync(target))) {
          errors.push(name + ': link escapes repository: ' + link);
          continue;
        }
        const st = statSync(target);
        if (!st.isFile() && !st.isDirectory()) throw Error('not file/dir');
      } catch {
        errors.push(name + ': broken or unsafe local link: ' + link);
      }
    }
  }
  return errors.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkGovernance(process.argv[2] ?? process.cwd());
  if (errors.length) {
    console.error('Agent contract FAILED:\n' + errors.map(x => '- ' + x).join('\n'));
    process.exitCode = 1;
  } else console.log('Agent contract: PASS');
}
