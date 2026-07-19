'use strict';

const path = require('node:path');
const {
  compareGeneratedDirectory,
  writeVerifiedArtifactFiles,
} = require('./lib/ai-security-artifact.cjs');

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!value || (key !== '--output' && key !== '--expect-digest')) {
      throw new Error('usage: export-ai-security-artifact.cjs --output <directory> --expect-digest <sha256:digest>');
    }
    const field = key === '--output' ? 'output' : 'expectedDigest';
    if (Object.hasOwn(parsed, field)) throw new Error(`duplicate argument: ${key}`);
    parsed[field] = value;
  }
  if (!parsed.output || !parsed.expectedDigest) {
    throw new Error('both --output and --expect-digest are required');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(parsed.expectedDigest)) {
    throw new Error('--expect-digest must be sha256 followed by 64 lowercase hexadecimal characters');
  }
  return parsed;
}

try {
  const packageRoot = path.resolve(__dirname, '..');
  const generatedRoot = path.join(packageRoot, 'generated', 'ai-security', '0.4.0');
  const { output, expectedDigest } = parseArgs(process.argv.slice(2));
  const built = compareGeneratedDirectory(packageRoot, generatedRoot);
  if (built.artifactDigest !== expectedDigest) {
    throw new Error(`artifact digest mismatch: expected ${expectedDigest}, got ${built.artifactDigest}`);
  }

  const outputRoot = path.resolve(output);
  writeVerifiedArtifactFiles(outputRoot, built.files, {
    requireAbsentOrEmpty: true,
  });
  compareGeneratedDirectory(packageRoot, outputRoot);
  process.stdout.write(`${built.artifactDigest}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
