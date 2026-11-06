import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkGovernance, required } from '../scripts/check-governance.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'agent-policy-'));
  const outside = mkdtempSync(join(tmpdir(), 'agent-policy-outside-'));
  try {
    for (const name of required) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), '# Policy\n\nRelevant checks and reviews are mandatory.\n');
    }
    writeFileSync(join(root, 'AGENTS.md'), '# Agents\n\nUse a worktree and review [workflow](docs/engineering/MULTI_AGENT_WORKFLOW.md)\n');
    writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n\nFollow [AGENTS.md](AGENTS.md) for review.\n');
    writeFileSync(join(root, '.github/PULL_REQUEST_TEMPLATE.md'), '# PR\n\nRecord head SHA for review [workflow](../docs/engineering/MULTI_AGENT_WORKFLOW.md)\n');
    writeFileSync(join(root, 'docs/engineering/MULTI_AGENT_WORKFLOW.md'), '# Protocol\n\nIssue worktree review and validation.\n');
    run(root, outside);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

test('complete baseline passes', () => fixture(root => assert.deepEqual(checkGovernance(root), [])));
test('absent review policy blocks', () => fixture(root => {
  rmSync(join(root, 'docs/engineering/REVIEW_POLICY.md'));
  assert.match(checkGovernance(root).join('\n'), /REVIEW_POLICY.md/);
}));
test('missing reference blocks', () => fixture(root => {
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n\n[AGENTS.md](AGENTS.md) [missing](nowhere.md)\n');
  assert.match(checkGovernance(root).join('\n'), /nowhere.md/);
}));
test('deleted required marker blocks', () => fixture(root => {
  writeFileSync(join(root, '.github/PULL_REQUEST_TEMPLATE.md'), '# PR\n\nReview [workflow](../docs/engineering/MULTI_AGENT_WORKFLOW.md)\n');
  assert.match(checkGovernance(root).join('\n'), /head SHA/);
}));
test('traversal links block', () => fixture(root => {
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n\n[AGENTS.md](AGENTS.md) [unsafe](../../outside.md)\n');
  assert.match(checkGovernance(root).join('\n'), /escapes repository/);
}));
test('symlink into outside repository blocks', () => fixture((root, outside) => {
  writeFileSync(join(outside, 'outside.md'), 'external content');
  symlinkSync(join(outside, 'outside.md'), join(root, 'external.md'));
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n\n[AGENTS.md](AGENTS.md) [unsafe](external.md)\n');
  assert.match(checkGovernance(root).join('\n'), /escapes repository/);
}));
