'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildF01Catalog,
  buildO01Catalog,
} = require('./lib/ai-security-o01-f01-catalogs.cjs');

function bytesFor(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function closedSchemaBytes(absolute, catalog) {
  const schema = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  schema.const = catalog;
  return bytesFor(schema);
}


function writeOrCheck(absolute, bytes, mode) {
  if (mode === '--write') {
    fs.writeFileSync(absolute, bytes);
    return;
  }
  const existing = fs.readFileSync(absolute);
  if (!existing.equals(bytes)) {
    throw new Error(`stale generated contract fixture: ${path.basename(absolute)}`);
  }
}

function main(args) {
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) {
    throw new Error('usage: generate-ai-security-o01-f01-fixtures.cjs --write|--check');
  }
  const packageRoot = path.resolve(__dirname, '..');
  const contracts = require(path.join(packageRoot, 'dist', 'index.js'));
  const { canonicalizeJcs } = require(path.join(packageRoot, 'dist', 'sqs-signer.js'));
  const obligationCatalog = buildO01Catalog(contracts, canonicalizeJcs);
  const failureCatalog = buildF01Catalog(contracts);
  const obligationSchemaPath = path.join(
    packageRoot,
    'schemas',
    'ai-security-obligation-contract-v1.schema.json',
  );
  const failureSchemaPath = path.join(
    packageRoot,
    'schemas',
    'ai-security-failure-oracle-v1.schema.json',
  );
  const outputs = [
    [
      path.join(packageRoot, 'fixtures', 'ai-security-obligation-contract.v1.json'),
      bytesFor(obligationCatalog),
    ],
    [
      path.join(packageRoot, 'fixtures', 'ai-security-failure-oracle.v1.json'),
      bytesFor(failureCatalog),
    ],
    [obligationSchemaPath, closedSchemaBytes(obligationSchemaPath, obligationCatalog)],
    [failureSchemaPath, closedSchemaBytes(failureSchemaPath, failureCatalog)],
  ];
  for (const [absolute, bytes] of outputs) {
    writeOrCheck(absolute, bytes, args[0]);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
