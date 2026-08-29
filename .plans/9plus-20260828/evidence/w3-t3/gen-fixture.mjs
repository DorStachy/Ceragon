import fs from 'node:fs';
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ID = { process: 'process-env', machine: 'machine', user: 'user', project: 'project', projectlocal: 'project-local' };
const cells = src.cells.map(c => {
  const present = c.present.map(k => ID[k]);
  const machinePresent = c.present.includes('machine');
  return {
    cell: c.cell,
    present,
    winner: machinePresent ? 'unverified' : (c.winner === 'none' ? 'none' : ID[c.winner]),
    verified: !machinePresent,
    ...(machinePresent ? {
      observedWithoutMachine: c.winner === 'none' ? 'none' : ID[c.winner],
      unverifiedReason: 'machine-managed-root-is-a-hard-coded-platform-constant-on-this-binary',
    } : {}),
  };
});
const out = {
  schema: 'devoid.claude-route-precedence.v1',
  note: 'GENERATED from a measurement. Do not hand-edit and do not re-derive from vendor documentation. See .plans/9plus-20260828/evidence/claude-route-precedence-2.1.226.md',
  bitOrder: ['process-env', 'machine', 'user', 'project', 'project-local'],
  measurements: [{
    binary: { product: src.binary.product, version: src.binary.version, sha256: src.binary.sha256 },
    host: 'windows/amd64',
    measuredAt: src.measuredAt,
    stage: 'pre-w4t4',
    evidence: '.plans/9plus-20260828/evidence/claude-route-precedence-2.1.226.md',
    cells,
  }],
};
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2) + '\n');
console.log('cells', cells.length, 'verified', cells.filter(c => c.verified).length);
