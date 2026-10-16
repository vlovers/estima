const assert = require('node:assert/strict');
const path = require('node:path');
const {
  readLockfile,
  missingNativePackages,
} = require('./native-lockfile.cjs');

async function verify() {
  assert.equal(
    missingNativePackages(readLockfile(path.join(__dirname, '../bun.lock')))
      .size,
    0
  );
  const swc = require('@swc/core');
  assert.match(
    swc.transformSync('const value: number = 42;', {
      jsc: { parser: { syntax: 'typescript' } },
    }).code,
    /42/
  );
  assert.equal(
    require('rollup/parseAst').parseAst('const value = 42;').type,
    'Program'
  );
  const nx = require('nx/src/native');
  assert.equal(typeof nx.hashArray(['native-smoke']), 'string');
  assert.match(
    require('esbuild').transformSync('const value: number = 42;', {
      loader: 'ts',
    }).code,
    /42/
  );
  assert.equal(typeof require('unrs-resolver').ResolverFactory, 'function');
  const bcrypt = require('bcrypt');
  assert.ok(
    bcrypt.compareSync('native-smoke', bcrypt.hashSync('native-smoke', 4))
  );

  if (process.platform === 'linux' && ['arm64', 'x64'].includes(process.arch)) {
    assert.ok(
      process.report.getReport().header.glibcVersionRuntime,
      'Docker builders require glibc'
    );
    // Require actual platform bindings explicitly so a WASM fallback cannot hide missing records.
    for (const [parent, native] of [
      ['@swc/core', `@swc/core-linux-${process.arch}-gnu`],
      ['rollup', `@rollup/rollup-linux-${process.arch}-gnu`],
      ['nx', `@nx/nx-linux-${process.arch}-gnu`],
      ['esbuild', `@esbuild/linux-${process.arch}`],
      ['unrs-resolver', `@unrs/resolver-binding-linux-${process.arch}-gnu`],
    ]) {
      const fromParent = require.resolve(
        parent === 'esbuild' ? `${native}/bin/esbuild` : native,
        {
          paths: [path.dirname(require.resolve(parent))],
        }
      );
      if (parent !== 'esbuild') require(fromParent);
      console.log(`Native binding present: ${native}`);
    }
  }
  console.log(
    `Native operations passed on ${process.platform}/${process.arch}: SWC, Rollup, Nx, esbuild, resolver, bcrypt`
  );
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
