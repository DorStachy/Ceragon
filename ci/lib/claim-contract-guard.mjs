// @workspace-check claim-contract-guard
import { readFileSync } from 'node:fs';

const plan = readFileSync(process.argv[2] ?? '.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md', 'utf8');
const required = 'None of the five risk lanes can reach PASS from this packet.';
if (!plan.includes(required)) throw new Error(`claim contract missing exact sentence: ${required}`);
const block = plan.match(/<!-- CLAIM-CONTRACT:FORBIDDEN:BEGIN -->([\s\S]*?)<!-- CLAIM-CONTRACT:FORBIDDEN:END -->/);
if (!block) throw new Error('claim contract forbidden block missing');
const rows = [...block[1].matchAll(/^\| FC-(\d{2}) \|[^\n]*\|\s*([^|]+)\|$/gm)];
if (rows.length !== 15) throw new Error(`claim contract has ${rows.length} forbidden rows; expected 15`);
for (const row of rows) if (!row[2].trim()) throw new Error(`FC-${row[1]} has no named authority`);
console.log('claim-contract-guard: PASS (15 forbidden claims)');
