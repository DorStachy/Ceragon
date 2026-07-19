'use strict';

const path = require('node:path');
const { compareGeneratedDirectory } = require('./lib/ai-security-artifact.cjs');

function parseGeneratedRoot(args, packageRoot) {
  if (args.length === 0) {
    return path.join(packageRoot, 'generated', 'ai-security', '0.4.0');
  }
  if (args.length !== 2 || args[0] !== '--generated-root' || !args[1]) {
    throw new Error('usage: check-ai-security-generated.cjs [--generated-root <directory>]');
  }
  return path.resolve(args[1]);
}

try {
  const packageRoot = path.resolve(__dirname, '..');
  const generatedRoot = parseGeneratedRoot(process.argv.slice(2), packageRoot);
  const result = compareGeneratedDirectory(packageRoot, generatedRoot);
  process.stdout.write(`${result.artifactDigest}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
