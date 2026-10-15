const swc = require('@swc/core');

module.exports = {
  process(sourceText, sourcePath) {
    const result = swc.transformSync(sourceText, {
      filename: sourcePath,
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'commonjs' },
    });
    return { code: result.code };
  },
};
