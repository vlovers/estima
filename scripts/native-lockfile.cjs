const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const nativeParents = [
  '@swc/core',
  'rollup',
  'nx',
  'esbuild',
  'unrs-resolver',
  '@parcel/watcher',
  '@rspack/binding',
  'sass-embedded',
];

function readLockfile(file) {
  const result = ts.parseConfigFileTextToJson(
    file,
    fs.readFileSync(file, 'utf8')
  );
  if (result.error) throw new Error(`Invalid lockfile: ${file}`);
  return result.config;
}

function missingNativePackages(lock) {
  const missing = new Map();
  for (const parent of nativeParents) {
    const entry = lock.packages[parent];
    if (!entry) throw new Error(`Missing native parent: ${parent}`);
    const metadata = entry.find((value) => value && typeof value === 'object');
    for (const [name, version] of Object.entries(
      metadata.optionalDependencies || {}
    )) {
      if (!lock.packages[name]) missing.set(name, version);
    }
  }
  return missing;
}

module.exports = { readLockfile, missingNativePackages };

if (require.main === module) {
  const missing = missingNativePackages(
    readLockfile(path.join(__dirname, '../bun.lock'))
  );
  if (missing.size) {
    throw new Error(
      `Unresolved native optional dependencies: ${[...missing.keys()].join(
        ', '
      )}`
    );
  }
  console.log(
    'Native lockfile records are complete for all eight native package families'
  );
}
