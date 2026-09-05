'use strict';

const path = require('node:path');
const { writePortableArtifact } = require('./lib/ai-security-artifact.cjs');

function parseOutput(args) {
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
    throw new Error('usage: generate-ai-security-artifact.cjs --output <directory>');
  }
  return path.resolve(args[1]);
}

try {
  const packageRoot = path.resolve(__dirname, '..');
  const outputRoot = parseOutput(process.argv.slice(2));
  const result = writePortableArtifact(packageRoot, outputRoot);
  process.stdout.write(`${result.artifactDigest}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
