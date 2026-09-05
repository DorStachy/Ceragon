// @workspace-check standards-schema-declaration
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? '.plans/m47a-20260822/v2-waves/standards-schema-declaration.json';
const schema = JSON.parse(readFileSync(path, 'utf8'));
if (!schema.system?.standardsMapping?.atlasRelease?.trim()) throw new Error('standards mapping has no pinned ATLAS release');
for (const name of ['atlasTechniques', 'owaspLlm2026', 'owaspAsi2026', 'aiuc1Controls']) {
  const column = schema.classColumns?.[name];
  if (!column?.required || !column?.allowNotApplicableWithReason) throw new Error(`standards schema missing required class column ${name}`);
}
for (const edition of ['v2026.07', 'OWASP Top 10 for LLM Applications 2026', 'OWASP Top 10 for Agentic Applications 2026', 'AIUC-1 Q3-2026']) {
  if (!JSON.stringify(schema.documentation).includes(edition)) throw new Error(`standards schema does not name edition ${edition}`);
}
console.log('standards-schema-declaration: PASS');
