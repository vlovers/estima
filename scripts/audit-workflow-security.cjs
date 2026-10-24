'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PINNED_ACTION = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[a-f0-9]{40}$/;

function auditWorkflow(content, filename = '<workflow>') {
  const lines = content.split(/\r?\n/);
  const errors = [];
  let hasTopLevelPermissions = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)permissions:\s*(.*?)\s*(?:#.*)?$/);
    if (!match) continue;
    const indent = match[1].length;
    if (indent === 0) hasTopLevelPermissions = true;
    if (match[2] !== '') {
      errors.push(filename + ':' + (i + 1) + ': permissions must use an explicit mapping');
      continue;
    }
    let hasContentsRead = false;
    for (let j = i + 1; j < lines.length; j++) {
      const entry = lines[j];
      if (!entry.trim() || entry.trim().startsWith('#')) continue;
      const entryIndent = entry.match(/^\s*/)[0].length;
      if (entryIndent <= indent) break;
      const parsed = entry.trim().match(/^([a-z-]+):\s*(read|write|none)\s*(?:#.*)?$/);
      if (!parsed) {
        errors.push(filename + ':' + (j + 1) + ': invalid or dynamic permissions entry');
        continue;
      }
      if (parsed[2] === 'write') {
        errors.push(filename + ':' + (j + 1) + ': write permissions require explicit security review');
      }
      if (indent === 0 && parsed[1] === 'contents' && parsed[2] === 'read') {
        hasContentsRead = true;
      }
    }
    if (indent === 0 && !hasContentsRead) {
      errors.push(filename + ':' + (i + 1) + ': require contents: read at workflow level');
    }
  }
  if (!hasTopLevelPermissions) {
    errors.push(filename + ': missing top-level permissions: contents: read');
  }
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!match) continue;
    const action = match[1];
    if (action.startsWith('./')) {
      if (!/^\\.\\/[A-Za-z0-9_.\/-]+$/.test(action) || action.includes('..')) {
        errors.push(filename + ':' + (i + 1) + ': local action path must be static and stay inside repository');
      }
      continue;
    }
    if (!PINNED_ACTION.test(action)) {
      errors.push(filename + ':' + (i + 1) + ': action must use a full immutable 40-character SHA: ' + action);
    }
    if (!action.startsWith('actions/checkout@')) continue;
    const usesIndent = lines[i].match(/^\s*/)[0].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const step = lines[j].match(/^(\s*)-\s*(?:name|uses|id|run|if|with|env|shell):/);
      if (step && step[1].length <= usesIndent) {
        end = j;
        break;
      }
    }
    let credentialsDisabled = false;
    for (let j = i + 1; j < end; j++) {
      const withMatch = lines[j].match(/^(\s*)with:\s*(?:#.*)?$/);
      if (!withMatch) continue;
      const withIndent = withMatch[1].length;
      for (let k = j + 1; k < end; k++) {
        if (!lines[k].trim() || lines[k].trim().startsWith('#')) continue;
        const keyIndent = lines[k].match(/^\s*/)[0].length;
        if (keyIndent <= withIndent) break;
        if (/^\s*persist-credentials:\s*false\s*(?:#.*)?$/.test(lines[k])) {
          credentialsDisabled = true;
        }
      }
    }
    if (!credentialsDisabled) {
      errors.push(filename + ':' + (i + 1) + ': checkout must set with.persist-credentials: false');
    }
  }
  return errors;
}

function auditDirectory(directory) {
  const workflows = fs.readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name)).sort();
  if (workflows.length === 0) return ['No workflow YAML files found in ' + directory];
  return workflows.flatMap((name) => auditWorkflow(
    fs.readFileSync(path.join(directory, name), 'utf8'), name
  ));
}
if (require.main === module) {
  const directory = path.resolve(__dirname, '..', '.github', 'workflows');
  const errors = auditDirectory(directory);
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('CI security audit passed: pinned actions, read-only tokens, checkout credentials disabled.');
  }
}
module.exports = { auditWorkflow, auditDirectory };
