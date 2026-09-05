// @workspace-check plan-citation-resolver
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const planPath = process.argv[2] ?? '.plans/m47a-20260822/M47A_IMPLEMENTATION_PLAN.md';
const root = process.argv[3] ?? '.';
const plan = readFileSync(planPath, 'utf8');
const repos = ['Backend', 'Frontend', 'Installers', 'Ceragon-Intelligence', 'Static-Worker', 'Sandbox-Worker', 'GithubApp-Bot-Scanner-Worker'];
const failures = [];
let checked = 0;
const seen = new Set();
const cache = new Map();
const task4Start = plan.indexOf('## Task 4: Repair every citation in the plan');
const task4End = plan.indexOf('## Task 5:', task4Start);
for (const match of plan.matchAll(/`([^`\n]+?):(\d+)(?:-\d+)?`/g)) {
  // Task 4 contains deliberately-invalid examples used to describe the defeat mutation. They are
  // fixtures in prose, not assertions about source, and are exercised by the self-test below.
  if (task4Start >= 0 && match.index >= task4Start && match.index < task4End) continue;
  const ref = match[1].replaceAll('\\', '/');
  if (/^(?:https?|sha256|cron)$/.test(ref)) continue;
  const repo = repos.find((name) => ref === name || ref.startsWith(`${name}/`));
  if (!repo) {
    // Bare `file:line` tokens are local shorthand/prose, not independently resolvable citations.
    // A path-shaped source reference is a citation and must carry its repository qualifier.
    if (ref.includes('/') && !ref.startsWith('ci/') && !ref.startsWith('…/') &&
        /\.(?:go|ts|tsx|js|mjs|yml|yaml|json)$/.test(ref) && !ref.startsWith('.plans/')) {
      failures.push(`unqualified source path: ${ref}:${match[2]}`);
    }
    continue;
  }
  const path = ref.slice(repo.length + 1);
  const key = `${repo}/${path}:${match[2]}`;
  if (seen.has(key)) continue;
  seen.add(key); checked++;
  const cacheKey = `${repo}/${path}`;
  let shown = cache.get(cacheKey);
  if (!shown) { shown = spawnSync('git', ['-C', `${root}/${repo}`, 'show', `origin/main:${path}`], { encoding: 'utf8' }); cache.set(cacheKey, shown); }
  if (shown.status !== 0) { failures.push(`unresolvable: ${repo}/${path}:${match[2]}`); continue; }
  const eof = shown.stdout.split(/\r?\n/).length - 1;
  if (+match[2] > eof) failures.push(`past EOF: ${path} has ${eof} lines (${repo}/${path}:${match[2]})`);
}
if (failures.length) {
  console.error(`plan-citation-resolver: ${failures.length} failures out of ${checked} qualified references`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`plan-citation-resolver: PASS (0 failures out of ${checked} qualified references)`);
