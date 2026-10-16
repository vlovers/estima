// Resolve missing exact optional edges in isolation; never update existing records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  readLockfile,
  missingNativePackages,
} = require('./native-lockfile.cjs');

const root = path.join(__dirname, '..');
const before = readLockfile(path.join(root, 'bun.lock'));
const missing = missingNativePackages(before);
const bun = process.versions.bun
  ? process.execPath
  : process.env.BUN_BINARY || 'bun';
assert.equal(
  execFileSync(bun, ['--version'], { encoding: 'utf8' }).trim(),
  '1.3.2'
);
if (!missing.size) {
  console.log('Native lockfile already complete; no changes');
} else {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'estima-native-lock-')
  );
  try {
    const originalManifest = fs.readFileSync(
      path.join(root, 'package.json'),
      'utf8'
    );
    const manifest = JSON.parse(originalManifest);
    manifest.optionalDependencies = {
      ...manifest.optionalDependencies,
      ...Object.fromEntries(missing),
    };
    for (const version of missing.values())
      assert.match(version, /^\d+\.\d+\.\d+$/);
    fs.writeFileSync(
      path.join(temporary, 'package.json'),
      JSON.stringify(manifest, null, 2)
    );
    fs.copyFileSync(
      path.join(root, 'bun.lock'),
      path.join(temporary, 'bun.lock')
    );
    const install = () =>
      execFileSync(
        bun,
        [
          'install',
          '--lockfile-only',
          '--ignore-scripts',
          '--cpu',
          '*',
          '--os',
          '*',
        ],
        { cwd: temporary, stdio: 'inherit' }
      );
    install();
    fs.writeFileSync(path.join(temporary, 'package.json'), originalManifest);
    install();
    const after = readLockfile(path.join(temporary, 'bun.lock'));
    assert.deepEqual(after.workspaces, before.workspaces);
    for (const [name, entry] of Object.entries(before.packages)) {
      assert.deepEqual(
        after.packages[name],
        entry,
        `Existing resolution changed: ${name}`
      );
    }
    assert.equal(missingNativePackages(after).size, 0);
    fs.copyFileSync(
      path.join(temporary, 'bun.lock'),
      path.join(root, 'bun.lock')
    );
    console.log(
      `Added ${
        Object.keys(after.packages).length - Object.keys(before.packages).length
      } records; existing resolutions and manifest unchanged`
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
