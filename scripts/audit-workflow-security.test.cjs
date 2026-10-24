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

test('rejects dynamic action expression', () => {
  assert.match(auditWorkflow(workflow('actions/checkout@\u0024{{ inputs.ref }}')).join(' '), /immutable/);
});
test('rejects checkout credentials configured outside checkout step', () => {
  const content = workflow().replace('        with:\n          persist-credentials: false', '') +
    '\n      - name: unrelated\n        with:\n          persist-credentials: false';
  assert.match(auditWorkflow(content).join(' '), /credentials/);
});
test('rejects top-level read-all shorthand', () => {
  assert.match(auditWorkflow(workflow().replace('permissions:\n  contents: read', 'permissions: read-all')).join(' '), /explicit mapping/);
});

test('rejects dynamic local action reference', () => {
  assert.match(auditWorkflow(workflow('./.github/actions/${{ inputs.action }}')).join(' '), /local action path/);
});
test('rejects traversing local action reference', () => {
  assert.match(auditWorkflow(workflow('./../external/action')).join(' '), /local action path/);
});
test('accepts static local action reference', () => {
  assert.deepEqual(auditWorkflow(workflow('./.github/actions/local-check')), []);
});

test('rejects checkout credentials setting nested under another with option', () => {
  const content = workflow().replace(
    '          persist-credentials: false',
    '          unrelated:\n            persist-credentials: false'
  );
  assert.match(auditWorkflow(content).join(' '), /credentials/);
});
test('accepts checkout credentials setting as a direct with child', () => {
  assert.deepEqual(auditWorkflow(workflow()), []);
});

test('accepts valid YAML keys with whitespace before colon', () => {
  const spaced = workflow()
    .replace('permissions:', 'permissions :')
    .replace('contents:', 'contents :')
    .replace('uses:', 'uses :')
    .replace('with:', 'with :')
    .replace('persist-credentials:', 'persist-credentials :');
  assert.deepEqual(auditWorkflow(spaced), []);
});
test('rejects empty uses value', () => {
  assert.match(auditWorkflow(workflow().replace('uses: ' + checkout, 'uses:')).join(' '), /uses must specify/);
});
test('rejects uses containing only a comment', () => {
  assert.match(auditWorkflow(workflow().replace('uses: ' + checkout, 'uses: # empty')).join(' '), /uses must specify/);
});
test('rejects floating action tag when uses key has whitespace', () => {
  assert.match(auditWorkflow(workflow('actions/checkout@v4').replace('uses:', 'uses :')).join(' '), /immutable/);
});
test('rejects job-level write permission with spaced YAML keys', () => {
  const content = workflow() + '\n    permissions :\n      id-token : write';
  assert.match(auditWorkflow(content).join(' '), /write permissions/);
});
test('does not accept credentials from next step with spaced uses key', () => {
  const content = workflow().replace('        with:\n          persist-credentials: false', '') +
    '\n      - uses : ' + node + '\n        with:\n          persist-credentials: false';
  assert.match(auditWorkflow(content).join(' '), /credentials/);
});
