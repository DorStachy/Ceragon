/**
 * Docker plumbing for the local gate runner.
 *
 * Three things here are not obvious and are the reason this file exists rather
 * than a handful of inline `docker run` strings:
 *
 * 1. SERVICE CONTAINERS AND `localhost`.
 *    GitHub publishes a job's `services:` on the RUNNER's loopback, so job
 *    steps reach Postgres at `localhost:5432`. Compose-style networking would
 *    give us `postgres:5432` instead, and every `DATABASE_HOST: localhost` in
 *    the workflows would have to be rewritten -- which is exactly the kind of
 *    local-only edit that makes a mirror lie. Instead each repo gets a "pod"
 *    container that owns a network namespace; the services AND the gate
 *    container all join it with `--network container:<pod>`, so they genuinely
 *    share one loopback and the workflow's own env values are correct as
 *    written. Where a service maps a host port that differs from the container
 *    port (Backend runs three Postgres instances on 5432/55432/55433), the
 *    server is told to listen on the host port instead of remapping.
 *
 * 2. THE SOURCE TREE IS MOUNTED READ-ONLY.
 *    Concurrent sessions work in these checkouts, gates run `npm ci` (and a few
 *    still `npm install`), and a container writing a Linux-resolved
 *    `package-lock.json` or a Linux `node_modules` into a Windows working tree
 *    would corrupt it.
 *    `/src` is read-only; the container rsyncs it into `/w`, a named volume.
 *
 * 3. SERVICES ARE RECREATED PER GATE, THE WORKSPACE VOLUME IS NOT.
 *    A fresh database per job is a correctness requirement, not a nicety --
 *    Backend's `migration_chain_from_empty` gate asserts the database is EMPTY
 *    before it starts. The workspace volume is deliberately the opposite: it
 *    persists so the second run does not reinstall node_modules from scratch.
 *    `--fresh` throws it away when you want a true cold checkout.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOCKER = process.env.DEVOID_CI_DOCKER || 'docker';

export function docker(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(DOCKER, args, { windowsHide: true, ...opts });
    if (opts.input !== undefined) {
      child.stdin.end(opts.input);
    }
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => {
      out += d;
      opts.onStdout?.(d.toString());
    });
    child.stderr?.on('data', (d) => {
      err += d;
      opts.onStderr?.(d.toString());
    });
    child.on('error', (e) => resolve({ code: 127, out, err: err + String(e) }));
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

export async function dockerOk(args) {
  const r = await docker(args);
  if (r.code !== 0) throw new Error(`docker ${args.join(' ')} failed:\n${r.err || r.out}`);
  return r.out.trim();
}

export async function daemonUp() {
  const r = await docker(['info', '--format', '{{.OSType}}']);
  return r.code === 0 && r.out.trim() === 'linux';
}

export async function imageExists(tag) {
  const r = await docker(['image', 'inspect', tag]);
  return r.code === 0;
}

export async function buildImage(tag, dockerfile, contextDir, { noCache = false, log } = {}) {
  const args = ['build', '-t', tag, '-f', dockerfile];
  if (noCache) args.push('--no-cache');
  args.push(contextDir);
  const r = await docker(args, { onStdout: log, onStderr: log });
  if (r.code !== 0) throw new Error(`building ${tag} failed:\n${r.err || r.out}`);
}

export async function ensureVolume(name) {
  const r = await docker(['volume', 'inspect', name]);
  if (r.code !== 0) await dockerOk(['volume', 'create', name]);
}

export async function removeVolume(name) {
  await docker(['volume', 'rm', '-f', name]);
}

export async function rmContainer(name) {
  await docker(['rm', '-f', name]);
}

/**
 * The network-namespace holder. Everything for one repo's gate joins this, so
 * `localhost` inside a step means the same loopback the services listen on.
 * `busybox` is used because it is already present on this machine and is the
 * smallest thing that can hold a namespace open.
 */
export async function ensurePod(name) {
  const r = await docker(['inspect', '-f', '{{.State.Running}}', name]);
  if (r.code === 0 && r.out.trim() === 'true') return;
  await rmContainer(name);
  await dockerOk(['run', '-d', '--name', name, 'busybox:latest', 'sleep', 'infinity']);
}

/**
 * Starts one `services:` entry from a workflow job inside the pod's namespace.
 *
 * `ports: ["55432:5432"]` means "the job reaches it on 55432". Since there is
 * no port mapping inside a shared namespace, the SERVER is moved to 55432
 * instead. That is only expressible for images that take a listen-port
 * argument; for anything else we fail loudly rather than start a service the
 * steps cannot reach.
 */
export async function startService(podName, key, spec, { log } = {}) {
  const name = `${podName}-svc-${key}`;
  await rmContainer(name);

  const image = spec.image;
  if (!image) throw new Error(`service ${key} has no image`);

  const args = ['run', '-d', '--name', name, '--network', `container:${podName}`];
  for (const [k, v] of Object.entries(spec.env || {})) args.push('-e', `${k}=${v}`);
  args.push(image);

  let listenPort = null;
  for (const p of spec.ports || []) {
    const [host, container] = String(p).split(':');
    if (container && host !== container) listenPort = host;
  }
  if (listenPort) {
    if (/^postgres/.test(image)) {
      args.push('-p', listenPort);
    } else {
      throw new Error(
        `service ${key} (${image}) remaps ${listenPort}; only postgres images can be moved to a ` +
          `different listen port inside a shared network namespace. Add support or mirror this job manually.`,
      );
    }
  }

  await dockerOk(args);
  log?.(`      service ${key}: ${image}${listenPort ? ` listening on ${listenPort}` : ''}\n`);
  return { name, image, spec, listenPort };
}

/** Polls a started service until it answers, or gives up. */
export async function waitForService(svc, { timeoutMs = 90_000, log } = {}) {
  const started = Date.now();
  const user = svc.spec.env?.POSTGRES_USER;
  const probe = /^postgres/.test(svc.image)
    ? ['exec', svc.name, 'pg_isready', ...(user ? ['-U', user] : []), ...(svc.listenPort ? ['-p', svc.listenPort] : [])]
    : null;
  if (!probe) return;

  for (;;) {
    const r = await docker(probe);
    if (r.code === 0) return;
    if (Date.now() - started > timeoutMs) {
      const logs = await docker(['logs', '--tail', '30', svc.name]);
      throw new Error(`service ${svc.name} never became ready:\n${logs.out}${logs.err}`);
    }
    await new Promise((res) => setTimeout(res, 700));
  }
}

export async function stopServices(services) {
  for (const s of services) await rmContainer(s.name);
}

/**
 * Copies a working tree into a running container -- what `actions/checkout`
 * does, minus the network.
 *
 * Streamed from git, not from the filesystem, and both halves of that matter.
 *
 * NOT A BIND MOUNT: a bind mount makes the container stat every file through
 * Docker Desktop's filesystem-sharing layer, and copying the Frontend tree that
 * way took over four minutes and had not finished.
 *
 * NOT A DIRECTORY TAR EITHER: `tar -C <repo> .` with excludes sweeps up
 * everything a real checkout would never contain. Ceragon-Intelligence came to
 * 1.4 GB and was still copying, because `dist/` and friends are gitignored --
 * present on this disk, absent from every GitHub runner. `git archive` gives
 * exactly the tracked content, so the copy is both faster AND closer to what CI
 * sees. Uncommitted work is layered back on top from `git status --porcelain`,
 * which respects .gitignore for free.
 *
 * `-c core.autocrlf=false -c core.eol=lf` is what makes the archive match the
 * blobs it came from. Without it, git on this Windows host writes CRLF into the
 * tar, git inside the Linux container compares that against LF blobs, and
 * Static-Worker's `git diff --exit-code pnpm-lock.yaml` guard reports all 5,188
 * lines changed -- a red gate caused entirely by the copy.
 *
 * The workspace is cleared first so a file deleted on the branch is deleted in
 * the container too; a stale leftover could make a gate pass on code that no
 * longer exists. `node_modules` at any depth is the one thing kept, because
 * reinstalling it every run is the whole cost this volume exists to avoid.
 */
export const PRISTINE = '/w/.pristine';
export const WORKDIR = '/w/src';

/**
 * Is the transferred copy already the tree we are about to send?
 *
 * The transfer is the expensive part -- 93 MB of Ceragon-Intelligence takes
 * about 90 seconds through Docker's stdin pipe on Windows, which is roughly
 * 1 MB/s -- and running seven gates for one repo would pay it seven times for
 * byte-identical content. A stamp makes it once per invocation. The stamp is
 * the tree identity plus a fingerprint of every uncommitted file, so editing a
 * file between runs invalidates it, which is the case that must never be missed.
 */
export async function pristineStamp(container) {
  const r = await docker(['exec', container, 'cat', `${PRISTINE}/.devoidci-stamp`]);
  return r.code === 0 ? r.out.trim() : null;
}

export async function copyTreeIntoContainer(container, repoPath, { log, tree, overlay, stamp } = {}) {
  const clear = [
    'set -euo pipefail',
    `rm -rf ${PRISTINE}`,
    `mkdir -p ${PRISTINE}`,
  ].join('\n');
  const cleared = await docker(['exec', container, 'bash', '-c', clear]);
  if (cleared.code !== 0) throw new Error(`could not clear the transfer area:\n${cleared.err}`);

  // `tree` is a git tree-ish: HEAD normally, or the merge of origin/main and
  // HEAD under --merged.
  const archiveArgs = [
    '-C', repoPath,
    '-c', 'core.autocrlf=false',
    '-c', 'core.eol=lf',
    'archive', '--format=tar', tree || 'HEAD',
  ];

  await pipeIntoContainer(container, 'git', archiveArgs, log);

  // Uncommitted work, layered on top. `overlay` is {add: [...], remove: [...]}
  // derived from `git status --porcelain`; empty under --merged, because a
  // merge cannot see edits that were never committed.
  if (overlay?.remove?.length) {
    const rm = await docker([
      'exec', '-i', container, 'bash', '-c',
      `cd ${PRISTINE} && xargs -0 -r rm -f`,
    ], { input: overlay.remove.join('\0') });
    if (rm.code !== 0) throw new Error(`could not apply working-tree deletions:\n${rm.err}`);
  }
  if (overlay?.add?.length) {
    const listFile = join(tmpdir(), `devoidci-overlay-${process.pid}-${overlay.add.length}.txt`);
    writeFileSync(listFile, overlay.add.join('\n') + '\n', 'utf8');
    try {
      await pipeIntoContainer(container, 'tar', ['-cf', '-', '-C', repoPath, '-T', listFile], log);
    } finally {
      try {
        unlinkSync(listFile);
      } catch {
        /* the temp file is disposable */
      }
    }
  }

  if (stamp) {
    const w = await docker(['exec', '-i', container, 'bash', '-c', `cat > ${PRISTINE}/.devoidci-stamp`], {
      input: stamp,
    });
    if (w.code !== 0) throw new Error(`could not stamp the transfer area:\n${w.err}`);
  }
}

/**
 * Gives this gate its own checkout, from the copy already inside the volume.
 *
 * GitHub hands every JOB a fresh checkout, so gates must not inherit each
 * other's build output -- a gate that passes only because the previous one
 * built something is a gate that is not testing what it claims. Restoring from
 * `/w/.pristine` is a local ext4 copy, seconds rather than the ~90s a re-
 * transfer costs, so per-gate freshness stays affordable.
 *
 * `node_modules` at any depth is the exception, kept across gates deliberately;
 * reinstalling it every time is the whole cost this volume exists to avoid, and
 * every workflow here installs dependencies as an explicit step anyway.
 */
export async function materializeWorkspace(container) {
  const script = [
    'set -euo pipefail',
    `mkdir -p ${WORKDIR}`,
    `cd ${WORKDIR}`,
    'find . -mindepth 1 -name node_modules -prune -o -type f -print0 | xargs -0 -r rm -f',
    'find . -mindepth 1 -name node_modules -prune -o -depth -type d -print0 | xargs -0 -r rmdir --ignore-fail-on-non-empty',
    `cp -a ${PRISTINE}/. ${WORKDIR}/`,
    `rm -f ${WORKDIR}/.devoidci-stamp`,
  ].join('\n');
  const r = await docker(['exec', container, 'bash', '-c', script]);
  if (r.code !== 0) throw new Error(`could not lay down the workspace:\n${r.err}`);
}

function pipeIntoContainer(container, cmd, args, log) {
  return new Promise((resolve, reject) => {
    const src = spawn(cmd, args, { windowsHide: true });
    const dst = spawn(DOCKER, ['exec', '-i', container, 'tar', '-xf', '-', '-C', PRISTINE], {
      windowsHide: true,
    });
    let srcErr = '';
    let dstErr = '';
    src.stderr.on('data', (d) => {
      srcErr += d;
    });
    dst.stderr.on('data', (d) => {
      dstErr += d;
    });
    src.on('error', reject);
    dst.on('error', reject);
    src.stdout.pipe(dst.stdin);
    dst.on('close', (code) => {
      log?.(srcErr + dstErr);
      if (code !== 0) reject(new Error(`checkout (${cmd} -> /w) failed:\n${srcErr}${dstErr}`));
      else resolve();
    });
  });
}

/**
 * Adds the repository's `.git` to a container that was populated from a git
 * tree. `git archive` emits a tree, and a tree has no `.git` -- but
 * Static-Worker's gate runs `git diff --exit-code pnpm-lock.yaml`, so for that
 * repo the directory has to arrive by a second route. The caller then points
 * the index at the same tree, or every file reads as modified.
 */
export async function copyGitDirIntoContainer(container, repoPath, { log } = {}) {
  return new Promise((resolve, reject) => {
    const src = spawn('tar', ['-cf', '-', '-C', repoPath, '.git'], { windowsHide: true });
    const dst = spawn(DOCKER, ['exec', '-i', container, 'tar', '-xf', '-', '-C', PRISTINE], {
      windowsHide: true,
    });
    let err = '';
    src.stderr.on('data', (d) => {
      err += d;
    });
    dst.stderr.on('data', (d) => {
      err += d;
    });
    src.on('error', reject);
    dst.on('error', reject);
    src.stdout.pipe(dst.stdin);
    dst.on('close', (code) => {
      log?.(err);
      if (code !== 0) reject(new Error(`copying .git failed:\n${err}`));
      else resolve();
    });
  });
}
