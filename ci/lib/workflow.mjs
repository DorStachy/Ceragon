/**
 * Reads a real GitHub Actions workflow file and turns one job into a list of
 * shell steps that can run in a container.
 *
 * The point of parsing the workflow instead of transcribing its commands into a
 * config file is drift. A hand-copied command list is correct on the day it is
 * written and silently wrong afterwards -- someone adds a gate to pr-checks.yml,
 * the local mirror keeps passing, and the mirror now certifies less than it
 * claims. Reading `.github/workflows/*.yml` directly means the local run can
 * only be wrong if the workflow itself changed shape, and `drift.mjs` fails when
 * it does.
 *
 * What is deliberately NOT emulated: `uses:` steps. Container images stand in
 * for `actions/checkout` (the runner rsyncs the source in), `setup-node`,
 * `setup-python`, `setup-go` and `pnpm/action-setup` (the toolchain is baked
 * into the image at the version the workflow pins). Everything else that is a
 * `uses:` is either inert locally (artifact upload) or CANNOT run locally at
 * all (cloud credentials) -- see CLOUD_FENCED_USES.
 */
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * A `uses:` that mints credentials or talks to a cloud/registry/GitHub API.
 * Hitting one of these does not just skip that step: every step AFTER it in the
 * same job is assumed to depend on what it produced, so the runner stops
 * executing and reports the gate PARTIAL. That is the honest reading -- a job
 * that assumes an OIDC role halfway through is two jobs, and only the first
 * half is reproducible on a laptop.
 */
const CLOUD_FENCED_USES = [
  /^aws-actions\//i,
  /^google-github-actions\//i,
  /^azure\//i,
  /^docker\/login-action/i,
  /^softprops\/action-gh-release/i,
  /^peter-evans\//i,
  /^actions\/github-script/i,
  /^actions\/create-github-app-token/i,
  /^tibdex\/github-app-token/i,
];

/**
 * A `uses:` the container image already satisfies, or that produces nothing a
 * gate's pass/fail depends on. Skipped, but recorded in the report.
 */
const SATISFIED_USES = [
  /^actions\/checkout/i,
  /^actions\/setup-node/i,
  /^actions\/setup-python/i,
  /^actions\/setup-go/i,
  /^actions\/setup-dotnet/i,
  /^pnpm\/action-setup/i,
  /^actions\/cache/i,
  /^actions\/upload-artifact/i,
  /^actions\/download-artifact/i,
  /^docker\/setup-buildx-action/i,
  /^docker\/setup-qemu-action/i,
];

export function classifyUses(uses) {
  const u = String(uses).trim();
  if (CLOUD_FENCED_USES.some((re) => re.test(u))) return 'cloud-fenced';
  if (SATISFIED_USES.some((re) => re.test(u))) return 'satisfied-by-image';
  return 'unknown';
}

export function loadWorkflow(file) {
  const doc = parseYaml(readFileSync(file, 'utf8'));
  if (!doc || typeof doc !== 'object') throw new Error(`not a workflow: ${file}`);
  return doc;
}

/** Cartesian product of `strategy.matrix`, honouring `include` and `exclude`. */
export function expandMatrix(strategy) {
  const matrix = strategy?.matrix;
  if (!matrix) return [{}];
  const { include, exclude, ...axes } = matrix;
  let combos = [{}];
  for (const [key, values] of Object.entries(axes)) {
    const list = Array.isArray(values) ? values : [values];
    combos = combos.flatMap((base) => list.map((v) => ({ ...base, [key]: v })));
  }
  if (Array.isArray(exclude)) {
    combos = combos.filter(
      (c) => !exclude.some((ex) => Object.entries(ex).every(([k, v]) => deepEq(c[k], v))),
    );
  }
  if (Array.isArray(include)) {
    // GitHub's `include` semantics are richer than this (it can extend an
    // existing combination as well as add a new one). We implement the two
    // shapes that appear in these repos: a bare list of standalone
    // combinations, and extensions that match on every key they share.
    const extended = combos.map((c) => {
      let out = c;
      for (const inc of include) {
        const shared = Object.keys(inc).filter((k) => k in c);
        if (shared.length && shared.every((k) => deepEq(c[k], inc[k]))) out = { ...out, ...inc };
      }
      return out;
    });
    const standalone = include.filter(
      (inc) => !combos.some((c) => Object.keys(inc).some((k) => k in c)),
    );
    combos = [...extended, ...standalone];
  }
  return combos.length ? combos : [{}];
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Substitutes the `${{ ... }}` expressions we can resolve offline and reports
 * the ones we cannot, rather than shipping a half-substituted command line to a
 * shell. An unresolved expression is a REASON TO SKIP THE STEP, never something
 * to paper over: `npx jest --shard=${{ matrix.shard }}/4` with the braces still
 * in it is not the command CI ran.
 */
export function substitute(text, ctx) {
  if (typeof text !== 'string') return { text, unresolved: [] };
  const unresolved = [];
  const out = text.replace(/\$\{\{([^}]*)\}\}/g, (whole, exprRaw) => {
    const v = resolveExpr(exprRaw.trim(), ctx);
    if (v === undefined) {
      unresolved.push(exprRaw.trim());
      return whole;
    }
    return String(v);
  });
  return { text: out, unresolved };
}

function resolveExpr(expr, ctx) {
  // `a || b` fallback chains -- the only operator that appears in a value
  // position in these workflows (`inputs.x || 'default'`).
  if (expr.includes('||')) {
    for (const part of expr.split('||').map((s) => s.trim())) {
      const v = resolveExpr(part, ctx);
      if (v !== undefined && v !== '' && v !== false) return v;
    }
    return undefined;
  }
  const lit = expr.match(/^'([^']*)'$/);
  if (lit) return lit[1];
  if (/^[0-9]+$/.test(expr)) return expr;

  const path = expr.split('.');
  let cur = ctx;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object' || !(seg in cur)) return undefined;
    cur = cur[seg];
  }
  return typeof cur === 'object' ? undefined : cur;
}

/**
 * Evaluates a step-level `if:` against the offline context.
 *
 * Strictly allowlisted. Anything with a shape this does not understand returns
 * `undefined`, which the runner turns into a SKIPPED step with the expression
 * printed -- an unreadable condition must never be silently treated as true.
 */
export function evaluateIf(cond, ctx) {
  if (cond === undefined || cond === null) return true;
  if (typeof cond === 'boolean') return cond;
  let s = String(cond).trim();
  const wrapped = s.match(/^\$\{\{(.*)\}\}$/s);
  if (wrapped) s = wrapped[1].trim();
  if (s === 'always()' || s === 'true') return true;
  if (s === 'success()') return true;
  if (s === 'false' || s === 'cancelled()' || s === 'failure()') return false;

  if (s.includes('&&')) {
    const parts = s.split('&&').map((p) => evaluateIf(p.trim(), ctx));
    return parts.some((p) => p === undefined) ? undefined : parts.every(Boolean);
  }
  if (s.includes('||')) {
    const parts = s.split('||').map((p) => evaluateIf(p.trim(), ctx));
    return parts.some((p) => p === undefined) ? undefined : parts.some(Boolean);
  }

  const cmp = s.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
  if (cmp) {
    const left = resolveExpr(cmp[1].trim(), ctx);
    const right = resolveExpr(cmp[3].trim(), ctx);
    if (left === undefined || right === undefined) return undefined;
    const eq = String(left) === String(right);
    return cmp[2] === '==' ? eq : !eq;
  }

  const bare = resolveExpr(s, ctx);
  if (bare === undefined) return undefined;
  return Boolean(bare) && bare !== 'false';
}

/**
 * Flattens one job (for one matrix combination) into ordered, runnable steps.
 * Returns every step INCLUDING the ones that will not run, each carrying why,
 * so the report can distinguish "this gate passed" from "this gate passed the
 * three steps it was able to attempt".
 */
export function planJob(workflow, jobId, combo, ctx) {
  const job = workflow.jobs?.[jobId];
  if (!job) throw new Error(`no job "${jobId}" in workflow`);

  const fullCtx = { ...ctx, matrix: combo, env: { ...(workflow.env || {}), ...(job.env || {}) } };
  const steps = [];
  let cloudFenced = null;

  for (const raw of job.steps || []) {
    const name = raw.name ? substitute(raw.name, fullCtx).text : raw.uses || '(unnamed)';

    if (cloudFenced) {
      steps.push({ name, kind: 'skipped', reason: `after a cloud-credential step (${cloudFenced})` });
      continue;
    }
    if (raw.uses) {
      const cls = classifyUses(raw.uses);
      if (cls === 'cloud-fenced') {
        cloudFenced = raw.uses;
        steps.push({ name, kind: 'cloud-fence', reason: `${raw.uses} mints cloud credentials` });
      } else {
        steps.push({ name, kind: 'provided', reason: `${raw.uses} (${cls})` });
      }
      continue;
    }
    if (!raw.run) {
      steps.push({ name, kind: 'skipped', reason: 'step has neither run nor uses' });
      continue;
    }

    const gate = evaluateIf(raw.if, fullCtx);
    if (gate === undefined) {
      steps.push({ name, kind: 'skipped', reason: `unreadable if: ${String(raw.if).trim()}` });
      continue;
    }
    if (gate === false) {
      steps.push({ name, kind: 'skipped', reason: `if: ${String(raw.if).trim()} is false locally` });
      continue;
    }

    const cmd = substitute(raw.run, fullCtx);
    const wd = raw['working-directory']
      ? substitute(raw['working-directory'], fullCtx)
      : { text: null, unresolved: [] };
    const unresolved = [...cmd.unresolved, ...wd.unresolved];
    if (unresolved.length) {
      steps.push({ name, kind: 'skipped', reason: `unresolved expression(s): ${unresolved.join(', ')}` });
      continue;
    }

    const env = {};
    for (const [k, v] of Object.entries({
      ...(workflow.env || {}),
      ...(job.env || {}),
      ...(raw.env || {}),
    })) {
      const sv = substitute(String(v), fullCtx);
      if (sv.unresolved.length) continue;
      env[k] = sv.text;
    }

    steps.push({ name, kind: 'run', run: cmd.text, cwd: wd.text, env });
  }

  return { job, steps, services: job.services || {} };
}
