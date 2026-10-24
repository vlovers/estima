'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditWorkflow } = require('./audit-workflow-security.cjs');
const checkout = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
const node = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
function workflow(action = checkout) {
  return [
    'name: CI', 'on: [push]', 'permissions:', '  contents: read',
    'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:',
    '      - uses: ' + action, '        with:',
    '          persist-credentials: false'
  ].join('\n');
}
test('accepts pinned checkout with read-only token', () => {
  assert.deepEqual(auditWorkflow(workflow()), []);
});
test('rejects floating action tag', () => {
  assert.match(auditWorkflow(workflow('actions/checkout@v4')).join(' '), /immutable/);
});
test('rejects abbreviated SHA', () => {
  assert.match(auditWorkflow(workflow('actions/checkout@11d5960')).join(' '), /immutable/);
});
test('rejects checkout credentials enabled', () => {
  assert.match(auditWorkflow(workflow().replace('persist-credentials: false', 'persist-credentials: true')).join(' '), /credentials/);
});
test('rejects checkout without credential setting', () => {
  assert.match(auditWorkflow(workflow().replace('          persist-credentials: false', '')).join(' '), /credentials/);
});
test('rejects missing top-level token permissions', () => {
  assert.match(auditWorkflow(workflow().replace('permissions:\n  contents: read\n', '')).join(' '), /missing top-level/);
});
test('rejects workflow write permissions', () => {
  assert.match(auditWorkflow(workflow().replace('contents: read', 'contents: write')).join(' '), /write permissions/);
});
test('rejects job-level write escalation', () => {
  assert.match(auditWorkflow(workflow() + '\n    permissions:\n      issues: write').join(' '), /write permissions/);
});
test('accepts pinned setup-node and local reusable workflow', () => {
  assert.deepEqual(auditWorkflow(workflow(node) + '\n      - uses: ./.github/workflows/local.yml'), []);
});
test('rejects branch-based action references', () => {
  assert.match(auditWorkflow(workflow('example/action@refs/heads/main')).join(' '), /immutable/);
});
test('rejects shorthand permissions', () => {
  assert.match(auditWorkflow(workflow().replace('permissions:\n  contents: read', 'permissions: write-all')).join(' '), /explicit mapping/);
});
