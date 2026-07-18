'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { parseStrictJsonBytes } = require('./strict-json.cjs');
const {
  DRIVER_IDS,
  SEMANTIC_COMPATIBILITY_REQUIREMENTS,
  semanticProofFor,
  stableJson: stableSemanticJson,
  validateSemanticReceiptBytes,
} = require('./ai-security-semantic-receipts.cjs');

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function comparablePath(value) {
  let normalized = path.resolve(value);
  if (process.platform === 'win32') {
    normalized = normalized.replace(/^\\\\\?\\/, '').toLowerCase();
  }
  const root = path.parse(normalized).root;
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realpath(value) {
  return fs.realpathSync.native ? fs.realpathSync.native(value) : fs.realpathSync(value);
}

function assertDirectRoot(root) {
  const resolved = path.resolve(root);
  const stat = fs.lstatSync(resolved, { bigint: true });
  assert.equal(
    stat.isSymbolicLink(),
    false,
    'protected root must not be a symlink, junction, or reparse point',
  );
  assert.equal(stat.isDirectory(), true, 'protected root must be a directory');
  const direct = realpath(resolved);
  assert.equal(
    samePath(direct, resolved),
    true,
    'protected root and every ancestor must have a direct non-reparse real path',
  );
  return Object.freeze({ resolved, real: direct });
}

function validateDescriptor(descriptor, label) {
  assert.ok(descriptor && typeof descriptor === 'object', `${label} descriptor missing`);
  assert.equal(typeof descriptor.path, 'string', `${label} path missing`);
  assert.equal(descriptor.path.includes('\\'), false, `${label} path must use forward slashes`);
  assert.equal(path.posix.isAbsolute(descriptor.path), false, `${label} path must be relative`);
  assert.equal(path.posix.normalize(descriptor.path), descriptor.path, `${label} path is not canonical`);
  assert.equal(descriptor.path.startsWith('../'), false, `${label} path escapes protected root`);
  assert.equal(Number.isSafeInteger(descriptor.bytes), true, `${label} byte count invalid`);
  assert.equal(descriptor.bytes >= 0, true, `${label} byte count invalid`);
  assert.match(descriptor.sha256, /^sha256:[0-9a-f]{64}$/, `${label} SHA-256 invalid`);
}

function assertStableFile(left, right, label) {
  for (const field of ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']) {
    assert.equal(right[field], left[field], `${label} changed while read (${field})`);
  }
}

function readExact(descriptor, size, label) {
  assert.equal(size <= BigInt(Number.MAX_SAFE_INTEGER), true, `${label} is too large`);
  const length = Number(size);
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const count = fs.readSync(descriptor, bytes, offset, length - offset, offset);
    assert.notEqual(count, 0, `${label} ended while read`);
    offset += count;
  }
  const extra = Buffer.allocUnsafe(1);
  assert.equal(fs.readSync(descriptor, extra, 0, 1, offset), 0, `${label} grew while read`);
  return bytes;
}

function createProtectedSnapshotter(root) {
  const protectedRoot = assertDirectRoot(root);
  const seen = new Set();

  function snapshot(descriptor, label) {
    validateDescriptor(descriptor, label);
    assert.equal(seen.has(descriptor.path), false, `${label} must not be read more than once`);
    seen.add(descriptor.path);

    const absolute = path.resolve(protectedRoot.resolved, ...descriptor.path.split('/'));
    assert.equal(
      isWithin(protectedRoot.resolved, absolute) && !samePath(protectedRoot.resolved, absolute),
      true,
      `${label} escapes protected root`,
    );

    const segments = path.relative(protectedRoot.resolved, absolute).split(path.sep).filter(Boolean);
    let current = protectedRoot.resolved;
    let leafStat;
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      const stat = fs.lstatSync(current, { bigint: true });
      assert.equal(
        stat.isSymbolicLink(),
        false,
        `${label} path must not contain a symlink, junction, or reparse point`,
      );
      const leaf = index === segments.length - 1;
      if (leaf) {
        assert.equal(stat.isFile(), true, `${label} must be a regular file`);
        assert.equal(stat.nlink, 1n, `${label} must not be hard-linked`);
        leafStat = stat;
      } else {
        assert.equal(stat.isDirectory(), true, `${label} ancestor must be a directory`);
      }
      const direct = realpath(current);
      assert.equal(samePath(direct, current), true, `${label} path contains reparse indirection`);
      assert.equal(isWithin(protectedRoot.real, direct), true, `${label} real path escapes root`);
    }

    const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const handle = fs.openSync(absolute, fs.constants.O_RDONLY | noFollow);
    try {
      const before = fs.fstatSync(handle, { bigint: true });
      assert.equal(before.isFile(), true, `${label} opened object must be a regular file`);
      assert.equal(before.nlink, 1n, `${label} opened object must not be hard-linked`);
      assert.equal(before.dev, leafStat.dev, `${label} identity changed before open (dev)`);
      assert.equal(before.ino, leafStat.ino, `${label} identity changed before open (ino)`);
      const bytes = readExact(handle, before.size, label);
      const after = fs.fstatSync(handle, { bigint: true });
      assertStableFile(before, after, label);
      const afterPath = fs.lstatSync(absolute, { bigint: true });
      assert.equal(afterPath.dev, after.dev, `${label} path identity changed after read (dev)`);
      assert.equal(afterPath.ino, after.ino, `${label} path identity changed after read (ino)`);
      assert.equal(bytes.length, descriptor.bytes, `${label} byte count mismatch`);
      assert.equal(sha256(bytes), descriptor.sha256, `${label} SHA-256 mismatch`);
      return Object.freeze({
        path: descriptor.path,
        bytes,
        sha256: descriptor.sha256,
      });
    } finally {
      fs.closeSync(handle);
    }
  }

  return Object.freeze({ root: protectedRoot.resolved, snapshot });
}

const FIXED_SYSTEM_TOOL_CANDIDATES = deepFreeze({
  git: process.platform === 'win32'
    ? ['C:/Program Files/Git/bin/git.exe']
    : ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'],
  go: process.platform === 'win32'
    ? ['C:/Program Files/Go/bin/go.exe']
    : ['/usr/local/go/bin/go', '/usr/bin/go', '/opt/homebrew/bin/go'],
  node: [process.execPath],
  docker: process.platform === 'win32'
    ? ['C:/Program Files/Docker/Docker/resources/bin/docker.exe']
    : ['/usr/bin/docker', '/usr/local/bin/docker'],
  dockerBuildx: process.platform === 'win32'
    ? ['C:/Program Files/Docker/cli-plugins/docker-buildx.exe']
    : ['/usr/libexec/docker/cli-plugins/docker-buildx', '/usr/lib/docker/cli-plugins/docker-buildx'],
});

const FIXED_CONTAINER_IMAGES = deepFreeze({
  node: {
    id: 'sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5',
    repositoryDigest: 'node@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5',
    os: 'linux',
    architecture: 'amd64',
    entrypoint: '/usr/local/bin/node',
    tmpfs: 'rw,nosuid,nodev,noexec,size=536870912,mode=1777',
    configSha256: 'sha256:c83f9a41eed4601f600c5d887b1554b9ce383b11c59fd3611337dc4b3548ddd6',
  },
  go: {
    id: 'sha256:79390b5e5af9ee6e7b1173ee3eac7fadf6751a545297672916b59bfa0ecf6f71',
    repositoryDigest: 'golang@sha256:79390b5e5af9ee6e7b1173ee3eac7fadf6751a545297672916b59bfa0ecf6f71',
    os: 'linux',
    architecture: 'amd64',
    entrypoint: '/usr/local/go/bin/go',
    tmpfs: 'rw,nosuid,nodev,size=536870912,mode=1777',
    configSha256: 'sha256:525fe9847fb48b18cf6cd079d40fd66ea5cf81dcbbbe31fe050a663a8e446568',
  },
  backend: {
    id: 'sha256:3a25d3d0bb0fac97354fbae9d9941a06621dc41fab3e49b0be5bdfed642ad89f',
    repositoryDigest: 'ceragon-m47-backend-c03@sha256:3a25d3d0bb0fac97354fbae9d9941a06621dc41fab3e49b0be5bdfed642ad89f',
    buildReference: 'ceragon-m47-backend-c03:c41c248',
    os: 'linux',
    architecture: 'amd64',
    entrypoint: '/usr/local/bin/node',
    tmpfs: 'rw,nosuid,nodev,noexec,size=536870912,mode=1777',
    configSha256: 'sha256:c295af6e493734d4a3c8f7cd1c3880f990ed685ddbe077ca66c2ae350edd989d',
  },
});
const runtimeContainerImages = new Map(Object.entries(FIXED_CONTAINER_IMAGES));

function registerFrontendDependencyImage(input) {
  assertExactKeys(input, ['id', 'configSha256'], 'Frontend dependency image');
  assert.match(input.id, /^sha256:[0-9a-f]{64}$/, 'Frontend dependency image ID invalid');
  assert.match(
    input.configSha256,
    /^sha256:[0-9a-f]{64}$/,
    'Frontend dependency image Config digest invalid',
  );
  const descriptor = deepFreeze({
    id: input.id,
    repositoryDigest: 'ceragon-c07-frontend-deps@' + input.id,
    os: 'linux',
    architecture: 'amd64',
    entrypoint: '/usr/local/bin/node',
    tmpfs: 'rw,nosuid,nodev,noexec,size=536870912,mode=1777',
    configSha256: input.configSha256,
  });
  const prior = runtimeContainerImages.get('frontend');
  if (prior) {
    assert.deepStrictEqual(prior, descriptor, 'Frontend dependency image changed during C07');
    return prior;
  }
  runtimeContainerImages.set('frontend', descriptor);
  return descriptor;
}

function containerImage(key) {
  const image = runtimeContainerImages.get(key);
  assert.ok(image, 'unknown fixed Docker image ' + key);
  return image;
}

function containerImageValues() {
  return [...runtimeContainerImages.values()];
}
const fixedSystemToolCache = new Map();

function inspectExecutableAlias(absolute, name, expectedLinkCount) {
  const candidate = path.resolve(absolute);
  const candidateStat = fs.lstatSync(candidate, { bigint: true });
  assert.equal(candidateStat.isSymbolicLink(), false, `${name} executable candidate must not be a link/reparse point`);
  assert.equal(samePath(realpath(candidate), candidate), true, `${name} executable candidate path is indirect`);
  let ancestor = path.dirname(candidate);
  while (true) {
    const stat = fs.lstatSync(ancestor, { bigint: true });
    assert.equal(stat.isSymbolicLink(), false, `${name} executable ancestor must not be a link/reparse point`);
    assert.equal(samePath(realpath(ancestor), ancestor), true, `${name} executable ancestor path is indirect`);
    const parent = path.dirname(ancestor);
    if (samePath(parent, ancestor)) break;
    ancestor = parent;
  }
  const resolved = realpath(candidate);
  assert.equal(process.platform !== 'win32' || resolved === candidate, true, `${name} executable canonical case/path changed`);
  const stat = fs.lstatSync(resolved, { bigint: true });
  assert.equal(stat.isSymbolicLink(), false, `${name} resolved executable must not be a link`);
  assert.equal(stat.isFile(), true, `${name} resolved executable must be a regular file`);
  assert.equal(stat.nlink, expectedLinkCount, `${name} executable link count differs from review`);
  assert.equal(stat.size >= 1n && stat.size <= 268_435_456n, true, `${name} executable size is outside bounds`);
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const handle = fs.openSync(resolved, fs.constants.O_RDONLY | noFollow);
  try {
    const before = fs.fstatSync(handle, { bigint: true });
    assert.equal(before.isFile(), true, `${name} opened executable must be a regular file`);
    assert.equal(before.nlink, expectedLinkCount, `${name} opened executable link count differs from review`);
    assert.equal(before.dev, stat.dev, `${name} executable identity changed before open (dev)`);
    assert.equal(before.ino, stat.ino, `${name} executable identity changed before open (ino)`);
    const bytes = readExact(handle, before.size, `${name} executable`);
    const after = fs.fstatSync(handle, { bigint: true });
    assertStableFile(before, after, `${name} executable`);
    const afterPath = fs.lstatSync(resolved, { bigint: true });
    assert.equal(afterPath.dev, after.dev, `${name} executable path changed after read (dev)`);
    assert.equal(afterPath.ino, after.ino, `${name} executable path changed after read (ino)`);
    assert.equal(afterPath.nlink, expectedLinkCount, `${name} executable link count changed after read`);
    return Object.freeze({
      path: resolved,
      dev: before.dev.toString(),
      ino: before.ino.toString(),
      bytes: bytes.length,
      sha256: sha256(bytes),
      linkCount: Number(before.nlink),
    });
  } finally {
    fs.closeSync(handle);
  }
}

function inspectFixedExecutable(absolute, name) {
  const buildxAliases = process.platform === 'win32' && name === 'dockerBuildx'
    ? [
        path.resolve('C:/Program Files/Docker/cli-plugins/docker-buildx.exe'),
        path.resolve('C:/Program Files/Docker/Docker/resources/cli-plugins/docker-buildx.exe'),
      ]
    : null;
  const aliases = buildxAliases || [path.resolve(absolute)];
  if (buildxAliases) {
    assert.equal(path.resolve(absolute), buildxAliases[0], 'dockerBuildx candidate path differs from review');
  }
  const expectedLinkCount = BigInt(aliases.length);
  const inspected = aliases.map((alias) => inspectExecutableAlias(alias, name, expectedLinkCount));
  const first = inspected[0];
  for (const alias of inspected.slice(1)) {
    assert.equal(alias.dev, first.dev, `${name} reviewed aliases differ by volume/device`);
    assert.equal(alias.ino, first.ino, `${name} reviewed aliases differ by inode/file ID`);
    assert.equal(alias.bytes, first.bytes, `${name} reviewed aliases differ by byte count`);
    assert.equal(alias.sha256, first.sha256, `${name} reviewed aliases differ by SHA-256`);
  }
  return Object.freeze({
    path: first.path,
    proof: Object.freeze({
      name,
      bytes: first.bytes,
      sha256: first.sha256,
      linkCount: first.linkCount,
      reviewedProtectedAliases: Object.freeze(inspected.map((alias) => Object.freeze({
        path: alias.path,
        dev: alias.dev,
        ino: alias.ino,
      }))),
    }),
  });
}
function fixedSystemTool(name) {
  const cached = fixedSystemToolCache.get(name);
  if (cached) return cached;
  const candidates = FIXED_SYSTEM_TOOL_CANDIDATES[name];
  assert.ok(candidates, `unsupported system tool ${name}`);
  let lastError;
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const inspected = inspectFixedExecutable(candidate, name);
      fixedSystemToolCache.set(name, inspected);
      return inspected;
    } catch (error) {
      lastError = error;
    }
  }
  throw new IntegrationGateError(
    'TRUSTED_TOOL_MISSING',
    `no fixed reviewed operating-system location is available for ${name}`,
    { causeCode: lastError?.code },
  );
}

function verifyFixedSystemTool(name) {
  const selected = fixedSystemTool(name);
  const current = inspectFixedExecutable(selected.path, name);
  assert.deepStrictEqual(current.proof, selected.proof, `${name} tool bytes changed during C07`);
  return selected.proof;
}
function trustedGitFileModeSetting(platform = process.platform) {
  assert.equal(typeof platform === 'string' && platform.length >= 1, true, 'Git platform is invalid');
  return platform === 'win32' ? 'false' : 'true';
}

function runGitBytes(root, args, label, options = {}) {
  const {
    input = null,
    maxStdoutBytes = 65_536,
    maxStderrBytes = 65_536,
    timeoutMs = 30_000,
  } = options;
  assert.equal(Number.isSafeInteger(maxStdoutBytes) && maxStdoutBytes >= 0, true);
  assert.equal(Number.isSafeInteger(maxStderrBytes) && maxStderrBytes >= 0, true);
  assert.equal(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 300_000, true);
  assert.equal(input === null || Buffer.isBuffer(input), true, `${label} git input must be bytes`);
  const git = fixedSystemTool('git');
  const environment = createHermeticCommandEnvironment(trustedTemporaryBase());
  assert.equal(environment.GIT_NO_REPLACE_OBJECTS, '1');
  const result = spawnSync(git.path, [
    '--no-replace-objects',
    '-c', 'core.fsmonitor=false',
    '-c', 'core.untrackedCache=false',
    '-c', `core.fileMode=${trustedGitFileModeSetting()}`,
    '-c', 'core.hooksPath=',
    ...args,
  ], {
    cwd: root,
    encoding: 'buffer',
    env: environment,
    input,
    maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes) + 1,
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) {
    throw new IntegrationGateError(
      result.error.code === 'ENOBUFS' ? 'GIT_OUTPUT_LIMIT' : 'GIT_SPAWN_ERROR',
      `${label} trusted Git operation failed to start or exceeded its bound`,
      { operation: args[0], causeCode: result.error.code },
    );
  }
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  assert.equal(stdout.length <= maxStdoutBytes, true, `${label} git stdout exceeded its bound`);
  assert.equal(stderr.length <= maxStderrBytes, true, `${label} git stderr exceeded its bound`);
  assert.equal(result.signal, null, `${label} git command terminated by ${result.signal}`);
  if (result.status !== 0) {
    throw new IntegrationGateError('GIT_OPERATION_FAILED', `${label} trusted Git operation failed`, {
      operation: args[0],
      exitCode: result.status,
      stderrBytes: stderr.length,
      stderrSha256: sha256(stderr),
    });
  }
  return stdout;
}

function runGit(root, args, label) {
  return runGitBytes(root, args, label).toString('utf8').trim();
}

function indexFlagFailure(tag) {
  if (tag.toLowerCase() === tag && tag.toUpperCase() !== tag) return 'assume-unchanged';
  if (tag.toUpperCase() === 'S') return 'skip-worktree';
  return `unsupported index flag ${JSON.stringify(tag)}`;
}

function assertNoGitObjectOverrides(root, label) {
  const replaceRefs = runGitBytes(
    root,
    ['for-each-ref', '--format=%(refname)', 'refs/replace/'],
    `${label} replace-ref proof`,
    { maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 30_000 },
  );
  assert.equal(replaceRefs.length, 0, `${label} rejects refs/replace object overrides`);

  const candidatePaths = [
    runGit(root, ['rev-parse', '--path-format=absolute', '--git-path', 'info/grafts'], `${label} graft path`),
    path.join(
      runGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'], `${label} common Git directory`),
      'info',
      'grafts',
    ),
  ];
  for (const candidate of new Set(candidatePaths)) {
    assert.equal(candidate.length >= 1 && candidate.length <= 4096, true, `${label} graft path length invalid`);
    assert.equal(path.isAbsolute(candidate), true, `${label} graft path is not absolute`);
    assert.doesNotMatch(candidate, /[\u0000-\u001f\u007f]/, `${label} graft path contains controls`);
    let present = false;
    try {
      fs.lstatSync(candidate);
      present = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    assert.equal(present, false, `${label} rejects legacy info/grafts object overrides`);
  }
  return true;
}

async function assertRepositoryAtPin(root, pin, label) {
  assert.match(pin?.commit, /^[0-9a-f]{40}$/, `${label} approved commit is invalid`);
  assert.match(pin?.tree, /^[0-9a-f]{40}$/, `${label} approved tree is invalid`);
  const direct = assertDirectRoot(root);
  const topLevel = runGit(direct.resolved, ['rev-parse', '--show-toplevel'], label);
  assert.equal(samePath(topLevel, direct.resolved), true, `${label} root is not the repository top level`);
  assert.equal(assertNoGitObjectOverrides(direct.resolved, label), true);
  const commit = runGit(direct.resolved, ['rev-parse', '--verify', 'HEAD^{commit}'], label);
  assert.equal(commit, pin.commit, `${label} commit mismatch`);
  const tree = runGit(direct.resolved, ['rev-parse', 'HEAD^{tree}'], label);
  assert.equal(tree, pin.tree, `${label} tree mismatch`);
  const indexRecords = runGitBytes(
    direct.resolved,
    ['ls-files', '-v', '-z'],
    label,
    { maxStdoutBytes: 16_777_216 },
  ).toString('utf8').split('\0').filter(Boolean);
  for (const record of indexRecords) {
    assert.equal(record.length >= 3 && record[1] === ' ', true, `${label} index record is malformed`);
    const tag = record[0];
    assert.equal(tag, 'H', `${label} rejects ${indexFlagFailure(tag)} index flag`);
  }
  const statusBytes = runGitBytes(
    direct.resolved,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'],
    label,
    { maxStdoutBytes: 16_777_216 },
  );
  assert.equal(statusBytes.length, 0, `${label} must be clean`);
  assert.equal(assertNoGitObjectOverrides(direct.resolved, label), true);
  return Object.freeze({ commit, tree });
}

let trustedTemporaryBaseCache;
function trustedTemporaryBase() {
  if (trustedTemporaryBaseCache) return trustedTemporaryBaseCache;
  trustedTemporaryBaseCache = assertDirectRoot(os.tmpdir()).resolved;
  return trustedTemporaryBaseCache;
}

function parseTreeEntries(bytes, label) {
  const records = bytes.toString('utf8').split('\0').filter(Boolean);
  assert.equal(records.length >= 1 && records.length <= 100_000, true, `${label} tree file count is outside bounds`);
  const entries = [];
  const pathKeys = new Set();
  let totalBytes = 0;
  for (const record of records) {
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40})\s+([0-9-]+)\t([\s\S]+)$/.exec(record);
    assert.ok(match, `${label} tree entry is malformed`);
    const [, mode, type, oid, sizeText, relative] = match;
    assert.equal(type, 'blob', `${label} rejects tracked gitlinks/submodules`);
    assert.equal(['100644', '100755'].includes(mode), true, `${label} rejects tracked links or unsupported modes`);
    assert.equal(sizeText === '-' || /^\d+$/.test(sizeText), true, `${label} tree size is malformed`);
    assert.equal(sizeText === '-', false, `${label} blob size is missing`);
    const size = Number(sizeText);
    assert.equal(Number.isSafeInteger(size) && size >= 0 && size <= 67_108_864, true, `${label} blob size is outside bounds`);
    assert.equal(relative.length >= 1 && relative.length <= 1024, true, `${label} tree path length is invalid`);
    assert.equal(relative.includes('\\'), false, `${label} tree path contains a backslash`);
    assert.equal(path.posix.isAbsolute(relative), false, `${label} tree path is absolute`);
    assert.equal(path.posix.normalize(relative), relative, `${label} tree path is not canonical`);
    assert.equal(relative.startsWith('../'), false, `${label} tree path escapes the snapshot`);
    assert.doesNotMatch(relative, /[\u0000-\u001f\u007f]/, `${label} tree path contains controls`);
    const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
    assert.equal(pathKeys.has(key), false, `${label} tree contains a platform path collision`);
    pathKeys.add(key);
    totalBytes += size;
    assert.equal(totalBytes <= 536_870_912, true, `${label} committed tree exceeds its byte bound`);
    entries.push(Object.freeze({ mode, oid, path: relative, size }));
  }
  return Object.freeze({ entries: Object.freeze(entries), totalBytes });
}

function readCommittedBlobs(root, entries, totalBytes, label) {
  const input = Buffer.from(`${entries.map((entry) => entry.oid).join('\n')}\n`, 'ascii');
  const output = runGitBytes(root, ['cat-file', '--batch'], label, {
    input,
    maxStdoutBytes: totalBytes + (entries.length * 128) + 1,
    maxStderrBytes: 65_536,
    timeoutMs: 300_000,
  });
  const blobs = [];
  let offset = 0;
  for (const expected of entries) {
    const newline = output.indexOf(0x0a, offset);
    assert.notEqual(newline, -1, `${label} cat-file header is truncated`);
    const header = output.subarray(offset, newline).toString('ascii');
    const match = /^([0-9a-f]{40}) blob (\d+)$/.exec(header);
    assert.ok(match, `${label} cat-file header is malformed`);
    const [, oid, sizeText] = match;
    const size = Number(sizeText);
    assert.equal(oid, expected.oid, `${label} cat-file object order changed`);
    assert.equal(size, expected.size, `${label} cat-file size differs from tree`);
    const start = newline + 1;
    const end = start + size;
    assert.equal(end < output.length, true, `${label} cat-file body is truncated`);
    const body = output.subarray(start, end);
    assert.equal(output[end], 0x0a, `${label} cat-file separator is missing`);
    const objectHash = crypto.createHash('sha1')
      .update(Buffer.from(`blob ${size}\0`, 'ascii'))
      .update(body)
      .digest('hex');
    assert.equal(objectHash, expected.oid, `${label} committed blob object ID mismatch`);
    blobs.push(Buffer.from(body));
    offset = end + 1;
  }
  assert.equal(offset, output.length, `${label} cat-file emitted unexpected trailing bytes`);
  return blobs;
}

function compareUtf8Paths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function listSnapshotFiles(root) {
  const files = [];
  const walk = (directory, prefix) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute, { bigint: true });
      assert.equal(stat.isSymbolicLink(), false, 'commit snapshot must not contain links/reparse points');
      if (stat.isDirectory()) walk(absolute, relative);
      else {
        assert.equal(stat.isFile(), true, 'commit snapshot may contain only directories and regular files');
        files.push(relative);
      }
    }
  };
  walk(root, '');
  return files.sort(compareUtf8Paths);
}

function writeTarText(header, offset, width, value, label) {
  const bytes = Buffer.from(value, 'utf8');
  assert.equal(bytes.length <= width, true, `${label} exceeds canonical tar field`);
  bytes.copy(header, offset);
}

function writeTarOctal(header, offset, width, value, label) {
  assert.equal(Number.isSafeInteger(value) && value >= 0, true, `${label} tar number invalid`);
  const octal = value.toString(8);
  assert.equal(octal.length <= width - 1, true, `${label} exceeds canonical tar number`);
  writeTarText(header, offset, width, `${octal.padStart(width - 1, '0')}\0`, label);
}

function splitTarPath(relative) {
  const bytes = Buffer.byteLength(relative, 'utf8');
  if (bytes <= 100) return { name: relative, prefix: '' };
  const slashes = [];
  for (let index = 0; index < relative.length; index += 1) {
    if (relative[index] === '/') slashes.push(index);
  }
  for (const index of slashes.reverse()) {
    const prefix = relative.slice(0, index);
    const name = relative.slice(index + 1);
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { name, prefix };
    }
  }
  throw new IntegrationGateError('CANONICAL_TAR_PATH_UNSUPPORTED', 'committed path exceeds canonical ustar bounds');
}

function canonicalTarEntry(relative, bytes, mode) {
  assert.equal(Buffer.isBuffer(bytes), true, 'canonical tar entry must be bytes');
  assert.match(relative, /^(?:Dockerfile|snapshot\/[\s\S]+|c07\/[a-z][a-z0-9.-]{0,95})$/, 'canonical tar path is outside the fixed context');
  const { name, prefix } = splitTarPath(relative);
  const header = Buffer.alloc(512, 0);
  writeTarText(header, 0, 100, name, 'tar name');
  writeTarOctal(header, 100, 8, mode, 'tar mode');
  writeTarOctal(header, 108, 8, 0, 'tar uid');
  writeTarOctal(header, 116, 8, 0, 'tar gid');
  writeTarOctal(header, 124, 12, bytes.length, 'tar size');
  writeTarOctal(header, 136, 12, 0, 'tar mtime');
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeTarText(header, 257, 6, 'ustar\0', 'tar magic');
  writeTarText(header, 263, 2, '00', 'tar version');
  writeTarText(header, 265, 32, 'root', 'tar uname');
  writeTarText(header, 297, 32, 'root', 'tar gname');
  writeTarOctal(header, 329, 8, 0, 'tar devmajor');
  writeTarOctal(header, 337, 8, 0, 'tar devminor');
  writeTarText(header, 345, 155, prefix, 'tar prefix');
  let checksum = 0;
  for (const value of header) checksum += value;
  const checksumText = checksum.toString(8);
  assert.equal(checksumText.length <= 6, true, 'tar checksum exceeds field');
  writeTarText(header, 148, 8, `${checksumText.padStart(6, '0')}\0 `, 'tar checksum');
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512, 0);
  return [header, bytes, padding];
}

function buildCanonicalDockerContext(
  entries,
  blobs,
  snapshotProof,
  baseImage,
  driver = null,
  buildRunId = null,
) {
  assert.equal(entries.length, blobs.length, 'canonical Docker context entries mismatch');
  const reviewedBaseImage = containerImageValues()
    .find((candidate) => candidate === baseImage);
  assert.ok(reviewedBaseImage, 'canonical Docker context base image is not reviewed');
  assert.match(
    baseImage.repositoryDigest,
    /^[a-z0-9]+(?:[._/-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/,
    'canonical Docker base repository digest is invalid',
  );
  assert.equal(
    baseImage.repositoryDigest.endsWith(`@${baseImage.id}`),
    true,
    'canonical Docker base repository digest does not bind the reviewed image ID',
  );
  if (buildRunId !== null) {
    assert.match(
      buildRunId,
      /^[0-9a-f]{32}$/,
      'canonical Docker build run ID is invalid',
    );
  }
  let driverBinding = null;
  if (driver !== null) {
    assertExactKeys(driver, ['artifact', 'witness'], 'canonical driver context');
    assertExactKeys(
      driver.artifact,
      ['consumer', 'driverId', 'bytes', 'sha256'],
      'canonical driver artifact',
    );
    assertExactKeys(
      driver.witness,
      ['exactBytes', 'containerPath'],
      'canonical driver witness',
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(APPROVED_INPUTS.consumers, driver.artifact.consumer),
      true,
      'canonical driver consumer is not approved',
    );
    assert.match(
      driver.artifact.driverId,
      /^[A-Z][A-Z0-9_]{2,95}$/,
      'canonical driver ID is not a safe token',
    );
    assert.equal(
      driver.artifact.driverId,
      DRIVER_IDS[driver.artifact.consumer],
      'canonical driver ID changed',
    );
    assert.equal(
      Number.isSafeInteger(driver.artifact.bytes)
        && driver.artifact.bytes >= 1
        && driver.artifact.bytes <= 1_048_576,
      true,
      'canonical driver byte count invalid',
    );
    assert.match(driver.artifact.sha256, /^sha256:[0-9a-f]{64}$/, 'canonical driver digest invalid');
    const reviewedDescriptor = REVIEWED_SEMANTIC_DRIVER_DESCRIPTORS[driver.artifact.consumer];
    assert.ok(reviewedDescriptor, 'canonical driver has no reviewed descriptor');
    assert.equal(driver.artifact.driverId, reviewedDescriptor.driverId, 'canonical driver descriptor ID changed');
    assert.equal(driver.artifact.bytes, reviewedDescriptor.bytes, 'canonical driver descriptor byte count changed');
    assert.equal(driver.artifact.sha256, reviewedDescriptor.sha256, 'canonical driver descriptor digest changed');
    assert.equal(Buffer.isBuffer(driver.witness.exactBytes), true, 'canonical driver bytes missing');
    assert.equal(driver.witness.exactBytes.length, driver.artifact.bytes, 'canonical driver byte count changed');
    assert.equal(sha256(driver.witness.exactBytes), driver.artifact.sha256, 'canonical driver digest changed');
    assert.equal(
      /^\/c07\/[a-z][a-z0-9.-]{0,95}$/.test(driver.witness.containerPath)
        || driver.witness.containerPath === '/workspace/cmd/c07semanticdriver/main.go',
      true,
      'canonical driver container path changed',
    );
    assert.equal(
      driver.witness.containerPath,
      reviewedDescriptor.containerPath,
      'canonical driver descriptor container path changed',
    );
    driverBinding = Object.freeze({
      id: driver.artifact.driverId,
      bytes: driver.artifact.bytes,
      sha256: driver.artifact.sha256,
      containerPath: driver.witness.containerPath,
      contextPath: reviewedDescriptor.contextPath || driver.witness.containerPath.slice(1),
      exactBytes: driver.witness.exactBytes,
    });
  }
  const instructions = [
    `FROM ${baseImage.repositoryDigest}`,
    `LABEL ceragon.c07.snapshot.commit=${snapshotProof.commit}`,
    `LABEL ceragon.c07.snapshot.tree=${snapshotProof.tree}`,
    `LABEL ceragon.c07.snapshot.manifest=${snapshotProof.manifestSha256}`,
    `LABEL ceragon.c07.base.image=${baseImage.id}`,
  ];
  if (buildRunId !== null) {
    instructions.push(`LABEL ceragon.c07.build.run=${buildRunId}`);
  }
  if (driverBinding) {
    instructions.push(
      `LABEL ceragon.c07.driver.id=${driverBinding.id}`,
      `LABEL ceragon.c07.driver.sha256=${driverBinding.sha256}`,
      `LABEL ceragon.c07.driver.bytes=${driverBinding.bytes}`,
      `LABEL ceragon.c07.driver.path=${driverBinding.containerPath}`,
    );
  }
  instructions.push('COPY --chown=65534:65534 snapshot/ /workspace/');
  if (driverBinding) {
    instructions.push(
      `COPY --chown=65534:65534 ${driverBinding.contextPath} ${driverBinding.containerPath}`,
    );
  }
  instructions.push('');
  const dockerfile = Buffer.from(instructions.join('\n'), 'utf8');
  const parts = [
    ...canonicalTarEntry('Dockerfile', dockerfile, 0o644),
  ];
  const ordered = entries.map((entry, index) => ({ entry, bytes: blobs[index] }))
    .sort((left, right) => compareUtf8Paths(left.entry.path, right.entry.path));
  for (let index = 1; index < ordered.length; index += 1) {
    assert.notEqual(compareUtf8Paths(ordered[index - 1].entry.path, ordered[index].entry.path), 0, 'canonical Docker context contains duplicate UTF-8 paths');
  }
  for (const { entry, bytes } of ordered) {
    parts.push(...canonicalTarEntry(
      `snapshot/${entry.path}`,
      bytes,
      entry.mode === '100755' ? 0o755 : 0o644,
    ));
  }
  if (driverBinding) {
    parts.push(...canonicalTarEntry(driverBinding.contextPath, driverBinding.exactBytes, 0o444));
  }
  parts.push(Buffer.alloc(1024, 0));
  const context = Buffer.concat(parts);
  assert.equal(context.length <= 603_979_776, true, 'canonical Docker context exceeds its bound');
  return Object.freeze({
    bytes: context,
    sha256: sha256(context),
    dockerfileSha256: sha256(dockerfile),
    entryCount: entries.length + 1 + (driverBinding ? 1 : 0),
    format: 'CANONICAL_USTAR',
    ...(driverBinding ? {
      driver: Object.freeze({
        id: driverBinding.id,
        bytes: driverBinding.bytes,
        sha256: driverBinding.sha256,
        containerPath: driverBinding.containerPath,
        tarMode: '0444',
      }),
    } : {}),
  });
}

const repositorySnapshots = new WeakSet();
async function materializeRepositorySnapshot(repositoryRoot, pin, label) {
  const repository = await assertRepositoryAtPin(repositoryRoot, pin, label);
  const treeBytes = runGitBytes(
    repositoryRoot,
    ['ls-tree', '-r', '-l', '-z', '--full-tree', pin.commit],
    label,
    { maxStdoutBytes: 33_554_432, timeoutMs: 120_000 },
  );
  const parsed = parseTreeEntries(treeBytes, label);
  const blobs = readCommittedBlobs(repositoryRoot, parsed.entries, parsed.totalBytes, label);
  const temporaryBase = trustedTemporaryBase();
  const snapshotRoot = fs.mkdtempSync(path.join(temporaryBase, 'ceragon-c07-commit-'));
  const descriptors = [];
  const manifestHash = crypto.createHash('sha256');
  let disposed = false;
  try {
    parsed.entries.forEach((entry, index) => {
      const absolute = path.resolve(snapshotRoot, ...entry.path.split('/'));
      assert.equal(isWithin(snapshotRoot, absolute), true, `${label} materialized path escapes snapshot`);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
      const handle = fs.openSync(
        absolute,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollow,
        entry.mode === '100755' ? 0o755 : 0o644,
      );
      try {
        fs.writeFileSync(handle, blobs[index]);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      const descriptor = Object.freeze({
        path: entry.path,
        bytes: entry.size,
        sha256: sha256(blobs[index]),
      });
      descriptors.push(descriptor);
      manifestHash.update(Buffer.from(`${entry.mode}\0${entry.oid}\0${entry.path}\0${entry.size}\0`, 'utf8'));
    });
    const expectedPaths = parsed.entries.map((entry) => entry.path).sort(compareUtf8Paths);
    const verify = () => {
      assert.equal(disposed, false, `${label} snapshot is already disposed`);
      assert.deepStrictEqual(listSnapshotFiles(snapshotRoot), expectedPaths, `${label} snapshot file set changed`);
      const snapshotter = createProtectedSnapshotter(snapshotRoot);
      for (const descriptor of descriptors) snapshotter.snapshot(descriptor, `${label} committed file`);
      return true;
    };
    assert.equal(verify(), true);
    const proof = Object.freeze({
      commit: repository.commit,
      tree: repository.tree,
      fileCount: parsed.entries.length,
      totalBytes: parsed.totalBytes,
      manifestSha256: `sha256:${manifestHash.digest('hex')}`,
      source: 'TRUSTED_GIT_COMMIT_OBJECTS',
    });
    const snapshot = Object.freeze({
      root: snapshotRoot,
      proof,
      verify,
      buildDockerContext(baseImageKey, driver = null, buildRunId = null) {
        assert.equal(disposed, false, `${label} snapshot is already disposed`);
        const baseImage = containerImage(baseImageKey);
        assert.ok(baseImage, `unknown fixed Docker base image ${baseImageKey}`);
        return buildCanonicalDockerContext(
          parsed.entries,
          blobs,
          proof,
          baseImage,
          driver,
          buildRunId,
        );
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        assert.equal(isWithin(temporaryBase, snapshotRoot), true, 'snapshot cleanup escaped temporary base');
        assert.match(path.basename(snapshotRoot), /^ceragon-c07-commit-/);
        fs.rmSync(snapshotRoot, { recursive: true, force: true });
        for (const bytes of blobs) bytes.fill(0);
      },
    });
    repositorySnapshots.add(snapshot);
    return snapshot;
  } catch (error) {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

const AUTHORITY = deepFreeze({
  decisionId: 'G-CONTRACT-AUTHORITY',
  decisionSha256: 'sha256:0667406e1ccc23439e2fb48d0bb2faee1abe4f5d5e0ad9c4e82fabd3b73c415a',
  approvalEventSha256: 'sha256:2762f5819ed206d24abf435f4218cba4d05cfe8d458236598606a4d480c44eab',
  selection: 'OPTION_A_AS_WRITTEN',
  representedAuthorities: ['Product/Architecture'],
  approvalRecordedAt: '2026-07-16T10:20:06Z',
  conditions: [],
  amendments: [],
});

const CANONICAL_FILES = deepFreeze({
  artifact: {
    path: 'packages/shared-contracts/generated/ai-security/0.3.0/portable-contract.v1.jcs.json',
    bytes: 768_554,
    sha256: 'sha256:bb172d0d535530fba9ade9648c2a5f9784ccd4fb9b1a08535f0172188aadca67',
  },
  releaseManifest: {
    path: 'packages/shared-contracts/generated/ai-security/0.3.0/portable-contract-release.v1.jcs.json',
    bytes: 537,
    sha256: 'sha256:ddc485a8f057855ce56d3cf3828393718661d2405060cfd693b14b4361f6d932',
  },
  digestSidecar: {
    path: 'packages/shared-contracts/generated/ai-security/0.3.0/portable-contract.v1.jcs.json.sha256',
    bytes: 72,
    sha256: 'sha256:d82272a06fb5918fcd6423fadd5bc14fb59a9ce7f96f9dbebe006ba6c5a3bfda',
  },
});

const APPROVED_INPUTS = deepFreeze({
  canonical: {
    repository: 'Workspace',
    commit: '781685f69bc7760df732612030b7e25af6223ff3',
    tree: '106cab4a9a35dab5b9f2a1230aff86de2980bfc6',
  },
  priorCanonical: {
    repository: 'Workspace',
    commit: '288da9535cca5e60394334e35674d33a930351a4',
    tree: '49a68113a4625c6dfa9d518949604088195673f1',
  },
  consumers: {
    backend: {
      repository: 'Backend',
      commit: '911202ec24f13bfa30200504e02dfc6898197001',
      tree: 'c509a87cd190883bf7e6aa6fb811d5c148abc30d',
      profile: 'BACKEND_C03_V1',
      pin: {
        path: 'packages/shared-contracts/ai-security-consumer-pin.v1.json',
        bytes: 3_199,
        sha256: 'sha256:e039a06284096608e8642a540aa21f47f2cedb950e9f86286f64b81e7449614c',
      },
    },
    installer: {
      repository: 'Installers',
      commit: 'd971db653e62ed111941912f73d7f6db59b5d3d9',
      tree: '3a09ac7567b3ad222b174e6a689e4e3334d12494',
      profile: 'INSTALLER_C04_V1',
      pin: {
        path: 'internal/aipolicycontract/consumer-pin.v1.json',
        bytes: 1_077,
        sha256: 'sha256:a6973676c551e7b09b1ebebd06e4b5370970ae8baa3f8eb54ed81d3a9fc28c13',
      },
    },
    browser: {
      repository: 'Installers/browser-extension',
      commit: 'd971db653e62ed111941912f73d7f6db59b5d3d9',
      tree: '3a09ac7567b3ad222b174e6a689e4e3334d12494',
      profile: 'BROWSER_C05_V1',
      pin: {
        path: 'browser-extension/ai-security-browser-consumer-pin.v1.json',
        bytes: 2_123,
        sha256: 'sha256:909fc218efdf7c3431bcae206f78f779d74ccf2e83574e9675e2794f6bdac52a',
      },
    },
    frontend: {
      repository: 'Frontend',
      commit: 'a6ae5dcd4ead53c22f8b1e2a103a89ff54ceb844',
      tree: '819c6029b0f6a8d023eec14393048dbbbf8dc036',
      profile: 'FRONTEND_C06_V1',
      pin: {
        path: 'ai-security-frontend-consumer-pin.v1.json',
        bytes: 1_674,
        sha256: 'sha256:81a0c2124a90ae1fc8236c6fa545506a0395e0874c63cebf1910a1e0fa9d4696',
      },
    },
  },
});

function assertRecord(value, label) {
  assert.equal(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    true,
    `${label} must be an object`,
  );
}

function assertExactKeys(value, expected, label) {
  assertRecord(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  for (const key of actual) {
    assert.equal(wanted.includes(key), true, `${label} has unexpected field ${key}`);
  }
  for (const key of wanted) {
    assert.equal(actual.includes(key), true, `${label} is missing required field ${key}`);
  }
}

function validateStringList(value, label) {
  assert.equal(Array.isArray(value), true, `${label} must be an array`);
  assert.equal(value.length <= 64, true, `${label} exceeds 64 entries`);
  for (const entry of value) {
    assert.equal(typeof entry, 'string', `${label} entries must be strings`);
    assert.equal(entry.length >= 1 && entry.length <= 128, true, `${label} entry length invalid`);
  }
}

function validateFileDescriptorShape(value, label) {
  assertExactKeys(value, ['path', 'bytes', 'sha256'], label);
  validateDescriptor(value, label);
}

function validateRepositoryPin(value, expected, label) {
  assertExactKeys(value, ['repository', 'commit', 'tree'], label);
  assert.deepStrictEqual(value, expected, `${label} differs from the approved repository pin`);
}

function validateConsumer(value, expected, label) {
  assertExactKeys(value, ['repository', 'commit', 'tree', 'profile', 'pin'], label);
  validateFileDescriptorShape(value.pin, `${label} pin`);
  assert.deepStrictEqual(value, expected, `${label} differs from the approved consumer input`);
}

function validateIntegrationManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      'format',
      'formatVersion',
      'packetId',
      'acceptance',
      'authority',
      'canonical',
      'consumers',
      'rollback',
      'databaseMigrationIds',
      'unsupportedSurfaces',
      'activeWaivers',
    ],
    'integration manifest',
  );
  assert.equal(manifest.format, 'ceragon.ai-security.integration-input');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.packetId, 'P0-C07');
  assert.equal(
    manifest.acceptance,
    'ACCEPTED',
    'integration manifest is an explicit pending non-acceptance input',
  );
  assertExactKeys(
    manifest.authority,
    [
      'decisionId',
      'decisionSha256',
      'approvalEventSha256',
      'selection',
      'representedAuthorities',
      'approvalRecordedAt',
      'conditions',
      'amendments',
    ],
    'integration manifest authority',
  );
  assert.deepStrictEqual(manifest.authority, AUTHORITY, 'authority approval binding mismatch');

  assertExactKeys(
    manifest.canonical,
    ['source', 'priorSource', 'package', 'artifact', 'releaseManifest', 'digestSidecar', 'protocol'],
    'canonical input',
  );
  validateRepositoryPin(manifest.canonical.source, APPROVED_INPUTS.canonical, 'canonical source');
  validateRepositoryPin(
    manifest.canonical.priorSource,
    APPROVED_INPUTS.priorCanonical,
    'prior canonical source',
  );
  assert.deepStrictEqual(manifest.canonical.package, {
    name: '@ceragon/shared-contracts',
    version: '0.3.0',
    generatorName: 'ceragon-ai-security-artifact',
    generatorVersion: '1.2.0',
    policySchemaVersion: 1,
  });
  for (const key of ['artifact', 'releaseManifest', 'digestSidecar']) {
    validateFileDescriptorShape(manifest.canonical[key], `canonical ${key}`);
    assert.deepStrictEqual(manifest.canonical[key], CANONICAL_FILES[key]);
  }
  assert.deepStrictEqual(manifest.canonical.protocol, {
    minimumReadable: '1',
    maximumReadable: '2',
    readableVersions: ['1', '2'],
    writableVersions: ['1'],
    nMinusOneShape: 'V1_LEGACY_ORG',
    runtimeActivatable: false,
    signedRuntimePolicyBundle: false,
    v2WriterEnabled: false,
  });

  assertExactKeys(manifest.consumers, ['backend', 'installer', 'browser', 'frontend'], 'consumers');
  validateConsumer(manifest.consumers.backend, APPROVED_INPUTS.consumers.backend, 'Backend C03');
  validateConsumer(manifest.consumers.installer, APPROVED_INPUTS.consumers.installer, 'Installer C04');
  assert.notEqual(
    APPROVED_INPUTS.consumers.browser,
    null,
    'browser C05 has no approved commit/tree/pin; final C07 execution is forbidden',
  );
  validateConsumer(manifest.consumers.browser, APPROVED_INPUTS.consumers.browser, 'Browser C05');
  validateConsumer(manifest.consumers.frontend, APPROVED_INPUTS.consumers.frontend, 'Frontend C06');

  assert.deepStrictEqual(manifest.rollback, {
    sourceCommit: APPROVED_INPUTS.priorCanonical.commit,
    sourceTree: APPROVED_INPUTS.priorCanonical.tree,
    canonicalArtifactAbsentAtTarget: true,
    consumerStrategy: 'VENDORED_IMMUTABLE_STANDALONE',
    runtimeActivationChanged: false,
  });
  assert.deepStrictEqual(manifest.databaseMigrationIds, []);
  validateStringList(manifest.unsupportedSurfaces, 'unsupported surfaces');
  validateStringList(manifest.activeWaivers, 'active waivers');
  return deepFreeze(structuredClone(manifest));
}
class IntegrationGateError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IntegrationGateError';
    this.code = code;
    Object.assign(this, details);
  }
}

function createHermeticCommandEnvironment(temporaryRoot) {
  const temporary = assertDirectRoot(temporaryRoot).resolved;
  const environment = Object.create(null);
  const candidateDirectories = Object.values(FIXED_SYSTEM_TOOL_CANDIDATES)
    .flat()
    .map((candidate) => path.dirname(candidate));
  if (process.platform === 'win32') {
    const windowsRoot = path.join(path.parse(process.execPath).root, 'Windows');
    const system32 = path.join(windowsRoot, 'System32');
    assert.equal(fs.statSync(windowsRoot).isDirectory(), true, 'fixed Windows root is unavailable');
    assert.equal(fs.statSync(system32).isDirectory(), true, 'fixed Windows system directory is unavailable');
    environment.SystemRoot = windowsRoot;
    environment.WINDIR = windowsRoot;
    environment.ComSpec = path.join(system32, 'cmd.exe');
    environment.PATHEXT = '.COM;.EXE;.BAT;.CMD';
    environment.Path = [...new Set([
      path.dirname(process.execPath),
      ...candidateDirectories,
      system32,
      windowsRoot,
    ])].join(path.delimiter);
    environment.TEMP = temporary;
    environment.TMP = temporary;
    environment.USERPROFILE = temporary;
    environment.LOCALAPPDATA = temporary;
    environment.APPDATA = temporary;
  } else {
    environment.PATH = [...new Set([
      path.dirname(process.execPath),
      ...candidateDirectories,
      '/usr/local/sbin',
      '/usr/local/bin',
      '/usr/sbin',
      '/usr/bin',
      '/sbin',
      '/bin',
    ])].join(path.delimiter);
    environment.TMPDIR = temporary;
    environment.HOME = temporary;
    environment.XDG_CONFIG_HOME = temporary;
    environment.XDG_CACHE_HOME = temporary;
  }
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = nullDevice;
  environment.GIT_CONFIG_SYSTEM = nullDevice;
  environment.GIT_NO_REPLACE_OBJECTS = '1';
  environment.GIT_ATTR_NOSYSTEM = '1';
  environment.GIT_TERMINAL_PROMPT = '0';
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.GOENV = 'off';
  environment.GOWORK = 'off';
  environment.GOTOOLCHAIN = 'local';
  environment.GOPROXY = 'off';
  environment.GOFLAGS = '';
  environment.CGO_ENABLED = '0';
  environment.GOCACHE = path.join(temporary, 'go-build-cache');
  environment.GOMODCACHE = path.join(temporary, 'go-module-cache');
  environment.GOPATH = path.join(temporary, 'go-path');
  environment.CI = 'true';
  environment.TZ = 'UTC';
  environment.LANG = 'C.UTF-8';
  environment.LC_ALL = 'C.UTF-8';
  environment.NO_COLOR = '1';
  environment.FORCE_COLOR = '0';
  environment.DOCKER_BUILDKIT = '1';
  environment.DOCKER_CLI_PLUGIN_EXTRA_DIRS = path.dirname(FIXED_SYSTEM_TOOL_CANDIDATES.dockerBuildx[0]);
  environment.BUILDKIT_PROGRESS = 'plain';
  environment.SOURCE_DATE_EPOCH = '0';
  environment.CERAGON_AI_SECURITY_RUNTIME_ACTIVATABLE = 'false';
  environment.CERAGON_AI_SECURITY_V2_WRITER_ENABLED = 'false';
  return environment;
}

function commandEnvironment() {
  return createHermeticCommandEnvironment(trustedTemporaryBase());
}
function validateProcessLimits(limits) {
  assertExactKeys(limits, ['timeoutMs', 'maxStdoutBytes', 'maxStderrBytes'], 'process limits');
  for (const [key, ceiling] of [
    ['timeoutMs', 600_000],
    ['maxStdoutBytes', 1_048_576],
    ['maxStderrBytes', 1_048_576],
  ]) {
    assert.equal(Number.isSafeInteger(limits[key]), true, `${key} must be a safe integer`);
    assert.equal(limits[key] >= 1 && limits[key] <= ceiling, true, `${key} exceeds its hard bound`);
  }
}

function validateProcessSpec(spec) {
  assertExactKeys(spec, ['id', 'command', 'args', 'cwd'], 'process specification');
  assert.match(spec.id, /^[a-z][a-z0-9.-]{0,95}$/, 'process id is invalid');
  assert.equal(typeof spec.command, 'string', 'process command must be a string');
  assert.equal(spec.command.length >= 1 && spec.command.length <= 1024, true, 'process command length invalid');
  assert.equal(Array.isArray(spec.args), true, 'process args must be an array');
  assert.equal(spec.args.length <= 64, true, 'process arg count exceeds 64');
  for (const argument of spec.args) {
    assert.equal(typeof argument, 'string', 'process arguments must be strings');
    assert.equal(argument.length <= 2048, true, 'process argument exceeds 2048 characters');
  }
  assert.equal(typeof spec.cwd, 'string', 'process cwd must be a string');
  assertDirectRoot(spec.cwd);
}

function runBoundedProcess(spec, limits) {
  validateProcessSpec(spec);
  validateProcessLimits(limits);

  return new Promise((resolve, reject) => {
    const stdoutHash = crypto.createHash('sha256');
    const stderrHash = crypto.createHash('sha256');
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failureCode = null;
    let settled = false;
    let child;
    let timeout;

    const safeReject = (code, message, details = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new IntegrationGateError(code, message, { id: spec.id, ...details }));
    };

    const terminate = (code) => {
      if (failureCode === null) failureCode = code;
      if (child && !child.killed) child.kill('SIGKILL');
    };

    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: commandEnvironment(),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      return safeReject('COMMAND_SPAWN_ERROR', `profile command ${spec.id} failed to start`);
    }

    timeout = setTimeout(() => terminate('COMMAND_TIMEOUT'), limits.timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      stdoutHash.update(chunk);
      if (stdoutBytes > limits.maxStdoutBytes) terminate('COMMAND_OUTPUT_LIMIT');
    });
    child.stderr.on('data', (chunk) => {
      if (settled) return;
      stderrBytes += chunk.length;
      stderrHash.update(chunk);
      if (stderrBytes > limits.maxStderrBytes) terminate('COMMAND_OUTPUT_LIMIT');
    });
    child.once('error', () => {
      safeReject('COMMAND_SPAWN_ERROR', `profile command ${spec.id} failed to start`);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      clearTimeout(timeout);
      if (failureCode === 'COMMAND_TIMEOUT') {
        return safeReject('COMMAND_TIMEOUT', `profile command ${spec.id} exceeded its time bound`, {
          stdoutBytes,
          stderrBytes,
        });
      }
      if (failureCode === 'COMMAND_OUTPUT_LIMIT') {
        return safeReject('COMMAND_OUTPUT_LIMIT', `profile command ${spec.id} exceeded its output bound`, {
          stdoutBytes,
          stderrBytes,
        });
      }
      if (signal !== null || exitCode !== 0) {
        return safeReject('COMMAND_FAILED', `profile command ${spec.id} failed`, {
          exitCode,
          signal,
          stdoutBytes,
          stderrBytes,
        });
      }
      settled = true;
      resolve(deepFreeze({
        id: spec.id,
        status: 'PASS',
        exitCode: 0,
        stdoutBytes,
        stdoutSha256: `sha256:${stdoutHash.digest('hex')}`,
        stderrBytes,
        stderrSha256: `sha256:${stderrHash.digest('hex')}`,
      }));
    });
    return undefined;
  });
}
const dockerEnvironmentState = { proof: null };

function runDockerSync(args, label, options = {}) {
  const {
    allowFailure = false,
    input = null,
    maxStdoutBytes = 1_048_576,
    maxStderrBytes = 1_048_576,
    timeoutMs = 120_000,
  } = options;
  assert.equal(Array.isArray(args) && args.length >= 1 && args.length <= 128, true, `${label} Docker args invalid`);
  assert.equal(input === null || Buffer.isBuffer(input), true, `${label} Docker input must be bytes`);
  const docker = fixedSystemTool('docker');
  verifyFixedSystemTool('docker');
  const result = spawnSync(docker.path, args, {
    encoding: 'buffer',
    env: createHermeticCommandEnvironment(trustedTemporaryBase()),
    input,
    maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes) + 1,
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  verifyFixedSystemTool('docker');
  if (result.error) {
    throw new IntegrationGateError(
      result.error.code === 'ENOBUFS' ? 'DOCKER_OUTPUT_LIMIT' : 'DOCKER_UNAVAILABLE',
      `${label} Docker operation failed to start or exceeded its bound`,
      { operation: args[0], causeCode: result.error.code },
    );
  }
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  assert.equal(stdout.length <= maxStdoutBytes, true, `${label} Docker stdout exceeded its bound`);
  assert.equal(stderr.length <= maxStderrBytes, true, `${label} Docker stderr exceeded its bound`);
  assert.equal(result.signal, null, `${label} Docker operation was signaled`);
  if (!allowFailure && result.status !== 0) {
    throw new IntegrationGateError('DOCKER_OPERATION_FAILED', `${label} Docker operation failed`, {
      operation: args[0],
      exitCode: result.status,
      stderrBytes: stderr.length,
      stderrSha256: sha256(stderr),
    });
  }
  return Object.freeze({ status: result.status, stdout, stderr });
}

function runBuildxSync(args, label, options = {}) {
  const {
    input = null,
    maxStdoutBytes = 1_048_576,
    maxStderrBytes = 1_048_576,
    timeoutMs = 300_000,
  } = options;
  assert.equal(Array.isArray(args) && args.length >= 1 && args.length <= 128, true, `${label} Buildx args invalid`);
  assert.equal(input === null || Buffer.isBuffer(input), true, `${label} Buildx input must be bytes`);
  const buildx = fixedSystemTool('dockerBuildx');
  verifyFixedSystemTool('dockerBuildx');
  const result = spawnSync(buildx.path, args, {
    encoding: 'buffer',
    env: createHermeticCommandEnvironment(trustedTemporaryBase()),
    input,
    maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes) + 1,
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
  verifyFixedSystemTool('dockerBuildx');
  if (result.error) {
    throw new IntegrationGateError(
      result.error.code === 'ENOBUFS' ? 'BUILDX_OUTPUT_LIMIT' : 'BUILDX_UNAVAILABLE',
      `${label} Buildx operation failed to start or exceeded its bound`,
      { operation: args[0], causeCode: result.error.code },
    );
  }
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  assert.equal(stdout.length <= maxStdoutBytes, true, `${label} Buildx stdout exceeded its bound`);
  assert.equal(stderr.length <= maxStderrBytes, true, `${label} Buildx stderr exceeded its bound`);
  assert.equal(result.signal, null, `${label} Buildx operation was signaled`);
  if (result.status !== 0) {
    throw new IntegrationGateError('BUILDX_OPERATION_FAILED', `${label} Buildx operation failed`, {
      operation: args[0],
      exitCode: result.status,
      stderrBytes: stderr.length,
      stderrSha256: sha256(stderr),
    });
  }
  return Object.freeze({ status: result.status, stdout, stderr });
}
function parseDockerJson(bytes, label) {
  const trimmed = Buffer.from(bytes.toString('utf8').trim(), 'utf8');
  assert.equal(trimmed.length >= 2 && trimmed.length <= 1_048_576, true, `${label} JSON size invalid`);
  return parseStrictJsonBytes(trimmed, { maxBytes: 1_048_576, maxDepth: 16, maxNodes: 65_536 });
}

function buildxVersionProof() {
  const result = runBuildxSync(
    ['version'],
    'Buildx version proof',
    { maxStdoutBytes: 1024, maxStderrBytes: 1024, timeoutMs: 10_000 },
  );
  const text = result.stdout.toString('utf8');
  assert.deepStrictEqual(Buffer.from(text, 'utf8'), result.stdout, 'Buildx version must be valid UTF-8');
  const match = /^github\.com\/docker\/buildx (v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?) ([0-9a-f]{40})\r?\n$/.exec(text);
  assert.ok(match, 'Buildx version output has an unexpected format');
  return Object.freeze({
    version: match[1],
    revision: match[2],
    outputBytes: result.stdout.length,
    outputSha256: sha256(result.stdout),
  });
}

function parseDockerHistory(bytes, label) {
  assert.equal(Buffer.isBuffer(bytes), true, `${label} must be bytes`);
  assert.equal(bytes.length >= 1 && bytes.length <= 1_048_576, true, `${label} byte bound invalid`);
  const text = bytes.toString('utf8');
  assert.deepStrictEqual(Buffer.from(text, 'utf8'), bytes, `${label} must be valid UTF-8`);
  assert.match(text, /\r?\n$/, `${label} must have a terminal newline`);
  const lines = text.split(/\r?\n/);
  lines.pop();
  assert.equal(lines.length >= 1 && lines.length <= 256, true, `${label} entry count invalid`);
  return Object.freeze(lines.map((line, index) => {
    const separator = line.indexOf('\t');
    assert.equal(separator > 0 && line.indexOf('\t', separator + 1) === -1, true, `${label} entry ${index} shape invalid`);
    const createdBy = JSON.parse(line.slice(0, separator));
    const comment = JSON.parse(line.slice(separator + 1));
    assert.equal(typeof createdBy, 'string', `${label} entry ${index} CreatedBy invalid`);
    assert.equal(typeof comment, 'string', `${label} entry ${index} Comment invalid`);
    assert.equal(createdBy.length <= 32_768 && comment.length <= 1024, true, `${label} entry ${index} exceeds its bound`);
    return Object.freeze({ createdBy, comment });
  }));
}

function readDockerImageHistory(imageId, label) {
  assert.match(imageId, /^sha256:[0-9a-f]{64}$/, `${label} image ID invalid`);
  return parseDockerHistory(
    runDockerSync(
      ['image', 'history', '--no-trunc', '--format', '{{json .CreatedBy}}\t{{json .Comment}}', imageId],
      label,
      { maxStdoutBytes: 1_048_576, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
    label,
  );
}

function dockerHistoryDigest(history) {
  return sha256(Buffer.from(JSON.stringify(history), 'utf8'));
}

const dockerImageHistoryState = new Map();
const dockerBaseImageConfigState = new Map();
function verifyDockerExecutionEnvironment(imageKeys = [...runtimeContainerImages.keys()]) {
  assert.equal(Array.isArray(imageKeys) && imageKeys.length >= 1, true, 'Docker image keys must be non-empty');
  const uniqueKeys = [...new Set(imageKeys)];
  const buildxVersion = buildxVersionProof();
  assert.equal(uniqueKeys.length, imageKeys.length, 'Docker image keys must not repeat');
  for (const key of uniqueKeys) containerImage(key);

  const infoTemplate = '{"serverId":"{{.ID}}","serverVersion":"{{.ServerVersion}}","os":"{{.OSType}}","architecture":"{{.Architecture}}"}';
  const engine = parseDockerJson(
    runDockerSync(['info', '--format', infoTemplate], 'Docker server proof').stdout,
    'Docker server proof',
  );
  assert.match(engine.serverId, /^[A-Z0-9:.-]{8,128}$/i, 'Docker server ID is invalid');
  assert.match(engine.serverVersion, /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/, 'Docker server version is invalid');
  assert.equal(engine.os, 'linux', 'C07 requires a Linux Docker engine');
  assert.equal(engine.architecture, 'x86_64', 'C07 requires an amd64 Docker engine');
  const imageEntries = uniqueKeys.sort().map((key) => {
    const expected = containerImage(key);
    const template = '{"id":"{{.Id}}","repoDigests":{{json .RepoDigests}},"os":"{{.Os}}","architecture":"{{.Architecture}}","config":{{json .Config}},"layers":{{json .RootFS.Layers}}}';
    const inspected = parseDockerJson(
      runDockerSync(
        ['image', 'inspect', expected.id, '--format', template],
        `${key} Docker image proof`,
      ).stdout,
      `${key} Docker image proof`,
    );
    assert.equal(inspected.id, expected.id, `${key} Docker image ID mismatch`);
    assert.equal(inspected.os, expected.os, `${key} Docker image OS mismatch`);
    assert.equal(inspected.architecture, expected.architecture, `${key} Docker image architecture mismatch`);
    assert.equal(Array.isArray(inspected.repoDigests), true, `${key} Docker image RepoDigests missing`);
    assert.equal(inspected.repoDigests.includes(expected.repositoryDigest), true, `${key} Docker repository digest missing`);
    assert.equal(Array.isArray(inspected.layers) && inspected.layers.length >= 1, true, `${key} Docker layer proof missing`);
    for (const layer of inspected.layers) assert.match(layer, /^sha256:[0-9a-f]{64}$/, `${key} Docker layer digest invalid`);
    assertRecord(inspected.config, `${key} Docker image Config`);
    const configSha256 = sha256(Buffer.from(stableJson(inspected.config), 'utf8'));
    assert.equal(configSha256, expected.configSha256, `${key} Docker image Config changed`);
    const priorConfig = dockerBaseImageConfigState.get(key);
    if (priorConfig) {
      assert.deepStrictEqual(inspected.config, priorConfig, `${key} Docker image Config changed during C07`);
    }
    dockerBaseImageConfigState.set(key, deepFreeze(inspected.config));
    const history = readDockerImageHistory(inspected.id, `${key} Docker history proof`);
    const priorHistory = dockerImageHistoryState.get(key);
    if (priorHistory) assert.deepStrictEqual(history, priorHistory, `${key} Docker history changed during C07`);
    dockerImageHistoryState.set(key, history);
    return [key, Object.freeze({
      id: inspected.id,
      repositoryDigest: expected.repositoryDigest,
      os: inspected.os,
      architecture: inspected.architecture,
      configSha256,
      layerCount: inspected.layers.length,
      layers: [...inspected.layers],
      layersSha256: sha256(Buffer.from(`${inspected.layers.join('\n')}\n`, 'ascii')),
      historyEntryCount: history.length,
      historySha256: dockerHistoryDigest(history),
    })];
  });
  const proof = deepFreeze({
    dockerCli: verifyFixedSystemTool('docker'),
    dockerBuildx: { ...verifyFixedSystemTool('dockerBuildx'), ...buildxVersion },
    engine: {
      serverId: engine.serverId,
      version: engine.serverVersion,
      os: engine.os,
      architecture: engine.architecture === 'x86_64' ? 'amd64' : engine.architecture,
    },
    images: Object.fromEntries(imageEntries),
  });
  if (dockerEnvironmentState.proof) {
    for (const key of uniqueKeys) {
      const prior = dockerEnvironmentState.proof.images[key];
      if (prior) assert.deepStrictEqual(proof.images[key], prior, `${key} Docker image changed during C07`);
    }
    assert.deepStrictEqual(proof.engine, dockerEnvironmentState.proof.engine, 'Docker server changed during C07');
    assert.deepStrictEqual(proof.dockerCli, dockerEnvironmentState.proof.dockerCli, 'Docker CLI changed during C07');
    assert.deepStrictEqual(proof.dockerBuildx, dockerEnvironmentState.proof.dockerBuildx, 'Buildx changed during C07');
  }
  dockerEnvironmentState.proof = deepFreeze({
    ...proof,
    images: { ...(dockerEnvironmentState.proof?.images || {}), ...proof.images },
  });
  return proof;
}

const immutableInputImages = new WeakSet();
const immutableInputImageConfigWitnesses = new WeakMap();
const successfulContainedRuns = new WeakMap();
const SEMANTIC_CAPTURE_AUTHORITY = Symbol('C07_SEMANTIC_CAPTURE_AUTHORITY');

function createOneShotSemanticRunAuthority() {
  const retainedRuns = new WeakMap();
  const consumedRuns = new WeakSet();
  return Object.freeze({
    retain(execution, witness) {
      assertRecord(execution, 'semantic execution');
      assertExactKeys(
        witness,
        [
          'snapshot', 'inputImage', 'consumer', 'driverArtifact', 'driverWitness',
          'runChallenge', 'rawStdout',
        ],
        'retained semantic run',
      );
      assert.equal(Buffer.isBuffer(witness.rawStdout), true, 'semantic stdout must be owned bytes');
      assert.match(witness.runChallenge, /^[0-9a-f]{64}$/, 'semantic run challenge invalid');
      assert.equal(consumedRuns.has(execution), false, 'semantic execution was already consumed');
      assert.equal(retainedRuns.has(execution), false, 'semantic execution was already retained');
      retainedRuns.set(execution, witness);
    },
    discard(execution) {
      assertRecord(execution, 'semantic execution');
      if (consumedRuns.has(execution)) return false;
      const witness = retainedRuns.get(execution);
      if (!witness) return false;
      consumedRuns.add(execution);
      retainedRuns.delete(execution);
      witness.rawStdout.fill(0);
      return true;
    },

    consume(execution, projector) {
      assertRecord(execution, 'semantic execution');
      assert.equal(typeof projector, 'function', 'semantic run projector must be a function');
      assert.equal(consumedRuns.has(execution), false, 'semantic execution was already consumed');
      const witness = retainedRuns.get(execution);
      assert.ok(witness, 'semantic execution has no retained stdout provenance');
      consumedRuns.add(execution);
      retainedRuns.delete(execution);
      try {
        return projector(witness);
      } finally {
        witness.rawStdout.fill(0);
      }
    },
  });
}

const semanticRunAuthority = createOneShotSemanticRunAuthority();
const reviewedDriverArtifacts = new WeakSet();
const reviewedDriverArtifactWitnesses = new WeakMap();
const REVIEWED_SEMANTIC_DRIVER_DESCRIPTORS = deepFreeze({
  backend: {
    path: 'scripts/c07-drivers/backend-semantic-driver.cjs',
    bytes: 18_623,
    sha256: 'sha256:8b9c7241a0826ffb3714f35906df6fa2a8523f5ae5c6cb79cc106a0588bd63d3',
    driverId: 'C07_BACKEND_SEMANTIC_V1',
    containerPath: '/c07/backend-semantic-driver.cjs',
  },
  browser: {
    path: 'scripts/c07-drivers/browser-semantic-driver.mjs',
    bytes: 18_806,
    sha256: 'sha256:89a251f46d0cc98d4c0bd287016ee41d3d64562c445099e910af02c6747b4f9e',
    driverId: 'C07_BROWSER_SEMANTIC_V1',
    containerPath: '/c07/browser-semantic-driver.mjs',
  },
  installer: {
    path: 'scripts/c07-drivers/installer-semantic-driver/main.go',
    bytes: 21_060,
    sha256: 'sha256:2cdbf7f0199497fedbf649e7fd90b59f6ac0f0c1ffadc233c4e9948aef11ab2b',
    driverId: 'C07_INSTALLER_SEMANTIC_V1',
    contextPath: 'c07/installer-semantic-driver.go',
    containerPath: '/workspace/cmd/c07semanticdriver/main.go',
  },
  frontend: {
    path: 'scripts/c07-drivers/frontend-semantic-driver.test.cjs',
    bytes: 24_261,
    sha256: 'sha256:4501b61652f94330a0fc821c238cbf672806de51d2c55b38133a3c8eeff70bb5',
    driverId: 'C07_FRONTEND_SEMANTIC_V1',
    containerPath: '/c07/frontend-semantic-driver.test.cjs',
  },
});
const reviewedDriverArtifactCache = new Map();

function issueReviewedSemanticDriver(consumer) {
  const cached = reviewedDriverArtifactCache.get(consumer);
  if (cached) return cached;
  const descriptor = REVIEWED_SEMANTIC_DRIVER_DESCRIPTORS[consumer];
  assert.ok(descriptor, `${consumer} has no reviewed C07 semantic driver`);
  assert.equal(descriptor.driverId, DRIVER_IDS[consumer], `${consumer} reviewed driver ID changed`);
  const packageRoot = path.resolve(__dirname, '..', '..');
  const protectedDriver = createProtectedSnapshotter(packageRoot).snapshot(
    { path: descriptor.path, bytes: descriptor.bytes, sha256: descriptor.sha256 },
    `${consumer} reviewed semantic driver`,
  );
  const artifact = deepFreeze({
    consumer,
    driverId: descriptor.driverId,
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
  });
  const witness = Object.freeze({
    exactBytes: protectedDriver.bytes,
    containerPath: descriptor.containerPath,
    sourcePath: descriptor.path,
  });
  reviewedDriverArtifacts.add(artifact);
  reviewedDriverArtifactWitnesses.set(artifact, witness);
  reviewedDriverArtifactCache.set(consumer, artifact);
  return artifact;
}


function inspectImmutableInputImage(inputImage) {
  assert.equal(immutableInputImages.has(inputImage), true, 'contained input image was not built by C07');
  const template = '{"id":"{{.Id}}","os":"{{.Os}}","architecture":"{{.Architecture}}","config":{{json .Config}},"layers":{{json .RootFS.Layers}}}';
  const inspected = parseDockerJson(
    runDockerSync(
      ['image', 'inspect', inputImage.id, '--format', template],
      'immutable input image proof',
    ).stdout,
    'immutable input image proof',
  );
  assert.equal(inspected.id, inputImage.id, 'immutable input image ID changed');
  assert.equal(inspected.os, 'linux', 'immutable input image OS changed');
  assert.equal(inspected.architecture, 'amd64', 'immutable input image architecture changed');
  assertRecord(inspected.config, 'immutable input image Config');
  assert.equal(inspected.config.Labels?.['ceragon.c07.snapshot.commit'], inputImage.proof.snapshotCommit, 'input image commit label changed');
  assert.equal(inspected.config.Labels?.['ceragon.c07.snapshot.tree'], inputImage.proof.snapshotTree, 'input image tree label changed');
  assert.equal(inspected.config.Labels?.['ceragon.c07.snapshot.manifest'], inputImage.proof.snapshotManifestSha256, 'input image manifest label changed');
  assert.equal(inspected.config.Labels?.['ceragon.c07.base.image'], inputImage.proof.baseImageId, 'input image base label changed');
  assert.equal(inspected.config.Labels?.['ceragon.c07.build.run'], inputImage.proof.buildRunId, 'input image build-run label changed');
  assert.equal(
    sha256(Buffer.from(stableJson(inspected.config), 'utf8')),
    inputImage.proof.imageConfigSha256,
    'immutable input image Config changed',
  );
  assert.deepStrictEqual(inspected.layers, inputImage.proof.layers, 'immutable input image layers changed');
  return true;
}

function parseLocalImageIds(bytes, label) {
  assert.equal(Buffer.isBuffer(bytes), true, `${label} must be bytes`);
  assert.equal(bytes.length <= 1_048_576, true, `${label} exceeded its bound`);
  const text = bytes.toString('ascii');
  assert.deepStrictEqual(Buffer.from(text, 'ascii'), bytes, `${label} must be ASCII`);
  if (text.length === 0) return [];
  assert.match(text, /^(?:sha256:[0-9a-f]{64}(?:\r?\n|$))+$/, `${label} contains an invalid image ID`);
  const ids = text.split(/\r?\n/);
  if (ids.at(-1) === '') ids.pop();
  return ids;
}

function listLocalImageIds(reference, label) {
  const args = ['image', 'ls', '--all', '--no-trunc', '--quiet'];
  if (reference !== null) args.push(reference);
  return parseLocalImageIds(
    runDockerSync(
      args,
      label,
      { maxStdoutBytes: 1_048_576, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
    label,
  );
}

function listLabeledLocalImageIds(buildRunId, label) {
  assert.match(buildRunId, /^[0-9a-f]{32}$/, label + ' build-run ID invalid');
  return parseLocalImageIds(
    runDockerSync(
      [
        'image', 'ls', '--all', '--no-trunc', '--quiet',
        '--filter', 'label=ceragon.c07.build.run=' + buildRunId,
      ],
      label,
      { maxStdoutBytes: 1_048_576, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
    label,
  );
}

function cleanupImmutableBuildArtifacts(reference, buildRunId, expectedIds, label) {
  assert.match(reference, /^ceragon-c07-input:[0-9a-f]{32}$/, label + ' reference invalid');
  assert.match(buildRunId, /^[0-9a-f]{32}$/, label + ' build-run ID invalid');
  assert.equal(Array.isArray(expectedIds) && expectedIds.length <= 8, true, label + ' expected IDs invalid');
  for (const id of expectedIds) assert.match(id, /^sha256:[0-9a-f]{64}$/, label + ' expected image ID invalid');

  const controlledIds = new Set([
    ...expectedIds,
    ...listLocalImageIds(reference, label + ' pre-cleanup tag discovery'),
    ...listLabeledLocalImageIds(buildRunId, label + ' pre-cleanup label discovery'),
  ]);
  const removals = [];
  const remove = (target, kind) => {
    let status = null;
    let errorCode = null;
    try {
      const result = runDockerSync(
        ['image', 'rm', '--force', target],
        label + ' ' + kind + ' removal',
        { allowFailure: true, maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
      );
      status = result.status;
    } catch (error) {
      errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    }
    removals.push(Object.freeze({ kind, status, errorCode }));
  };
  remove(reference, 'temporary tag');
  for (const id of controlledIds) remove(id, 'controlled image ID');

  const survivingTagIds = listLocalImageIds(reference, label + ' post-cleanup tag proof');
  const survivingLabelIds = listLabeledLocalImageIds(buildRunId, label + ' post-cleanup label proof');
  const allIds = listLocalImageIds(null, label + ' post-cleanup exact ID proof');
  const survivingControlledIds = [...controlledIds].filter((id) => allIds.includes(id));
  if (
    survivingTagIds.length !== 0
    || survivingLabelIds.length !== 0
    || survivingControlledIds.length !== 0
  ) {
    throw new IntegrationGateError(
      'IMMUTABLE_IMAGE_SURVIVOR',
      'immutable build artifact survived exact tag, label, and image-ID cleanup',
      {
        controlledIdCount: controlledIds.size,
        survivingTagCount: survivingTagIds.length,
        survivingLabelCount: survivingLabelIds.length,
        survivingControlledIdCount: survivingControlledIds.length,
      },
    );
  }
  return deepFreeze({
    temporaryTagAbsent: true,
    buildRunLabelAbsent: true,
    exactImageIdsAbsent: true,
    controlledImageIdCount: controlledIds.size,
    removals,
  });
}

function performVerifiedImageCleanup(reference, expectedId, operations) {
  assert.match(reference, /^ceragon-c07-input:[0-9a-f]{32}$/, 'image cleanup reference invalid');
  assert.equal(expectedId === null || /^sha256:[0-9a-f]{64}$/.test(expectedId), true, 'image cleanup expected ID invalid');
  assertExactKeys(
    operations,
    ['removeTag', 'removeId', 'listTagIds', 'listAllIds'],
    'image cleanup operations',
  );
  for (const key of Object.keys(operations)) assert.equal(typeof operations[key], 'function', `${key} must be a function`);
  let tagRemovalStatus = null;
  let tagRemovalErrorCode = null;
  let idRemovalStatus = null;
  let idRemovalErrorCode = null;
  try {
    const removal = operations.removeTag();
    assertRecord(removal, 'image cleanup tag removal result');
    assert.equal(Number.isSafeInteger(removal.status), true, 'image cleanup tag removal status invalid');
    tagRemovalStatus = removal.status;
  } catch (error) {
    tagRemovalErrorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  }
  if (expectedId !== null) {
    try {
      const removal = operations.removeId();
      assertRecord(removal, 'image cleanup ID removal result');
      assert.equal(Number.isSafeInteger(removal.status), true, 'image cleanup ID removal status invalid');
      idRemovalStatus = removal.status;
    } catch (error) {
      idRemovalErrorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    }
  }
  const tagIds = parseLocalImageIds(operations.listTagIds(), 'image cleanup temporary tag proof');
  if (tagIds.length !== 0) {
    throw new IntegrationGateError(
      'IMMUTABLE_IMAGE_SURVIVOR',
      'temporary immutable input image tag survived cleanup',
      { tagRemovalStatus, tagRemovalErrorCode, idRemovalStatus, idRemovalErrorCode },
    );
  }
  let imageIdAbsent = null;
  if (expectedId !== null) {
    const allIds = parseLocalImageIds(operations.listAllIds(), 'image cleanup exact ID proof');
    imageIdAbsent = !allIds.includes(expectedId);
    if (!imageIdAbsent) {
      throw new IntegrationGateError(
        'IMMUTABLE_IMAGE_SURVIVOR',
        'exact immutable input image ID survived cleanup',
        { tagRemovalStatus, tagRemovalErrorCode, idRemovalStatus, idRemovalErrorCode },
      );
    }
  }
  return Object.freeze({
    imageIdAbsent,
    temporaryTagAbsent: true,
    tagRemovalStatus,
    tagRemovalErrorCode,
    idRemovalStatus,
    idRemovalErrorCode,
  });
}

function verifiedImageCleanupOperations(reference, expectedId, label) {
  return Object.freeze({
    removeTag: () => runDockerSync(
      ['image', 'rm', reference],
      `${label} temporary tag removal`,
      { allowFailure: true, maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ),
    removeId: () => expectedId === null
      ? Object.freeze({ status: 0 })
      : runDockerSync(
        ['image', 'rm', '--force', expectedId],
        `${label} exact ID removal`,
        { allowFailure: true, maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
      ),
    listTagIds: () => runDockerSync(
      ['image', 'ls', '--all', '--no-trunc', '--quiet', reference],
      `${label} temporary tag proof`,
      { maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
    listAllIds: () => runDockerSync(
      ['image', 'ls', '--all', '--no-trunc', '--quiet'],
      `${label} exact ID proof`,
      { maxStdoutBytes: 1_048_576, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
  });
}

function cleanupUnacceptedImmutableInput(reference, expectedId, label) {
  const beforeIds = listLocalImageIds(reference, `${label} pre-cleanup tag proof`);
  assert.equal(beforeIds.length <= 1, true, `${label} tag resolved to multiple images`);
  const provedId = expectedId || beforeIds[0] || null;
  return performVerifiedImageCleanup(
    reference,
    provedId,
    verifiedImageCleanupOperations(reference, provedId, label),
  );
}
function immutableInputRemovalProof() {
  return Object.freeze({
    inputImageRemoved: true,
    inputImageRemovalScope: 'ENGINE_IMAGE_IDS_TEMPORARY_TAG_AND_BUILD_RUN_LABEL',
    buildCacheRetention: 'MAY_RETAIN_NEW_LOCAL_COPY_CACHE',
    cacheInfluenceOnExecution: 'PREVENTED_BY_NO_CACHE_EXACT_CONTEXT_AND_IMAGE_ID',
  });
}

function removeImmutableInputImage(inputImage) {
  if (inputImage.removed()) return immutableInputRemovalProof();
  const cleanup = cleanupImmutableBuildArtifacts(
    inputImage.tag,
    inputImage.proof.buildRunId,
    [inputImage.id],
    'immutable input image',
  );
  assert.equal(cleanup.temporaryTagAbsent, true, 'immutable input image tag absence was not proved');
  assert.equal(cleanup.buildRunLabelAbsent, true, 'immutable input image label absence was not proved');
  assert.equal(cleanup.exactImageIdsAbsent, true, 'immutable input image ID absence was not proved');
  inputImage.markRemoved();
  return immutableInputRemovalProof();
}
function verifyLocalBuildReference(baseImage, label) {
  const reference = baseImage.repositoryDigest;
  const inspected = parseDockerJson(
    runDockerSync(
      ['image', 'inspect', reference, '--format', '{"id":"{{.Id}}"}'],
      label,
      { maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    ).stdout,
    label,
  );
  assert.equal(inspected.id, baseImage.id, `${label} resolved to an unreviewed image ID`);
  return Object.freeze({
    reference,
    id: inspected.id,
    referencePolicy: 'REPOSITORY_DIGEST_PLUS_EXACT_CHILD_BASE_PROOF',
  });
}
function readDirectBoundedFile(root, fileName, maxBytes, label) {
  const protectedRoot = assertDirectRoot(root);
  assert.match(fileName, /^[a-z][a-z0-9.-]{0,63}$/, label + ' file name invalid');
  assert.equal(Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= 1_048_576, true, label + ' byte bound invalid');
  const absolute = path.resolve(protectedRoot.resolved, fileName);
  assert.equal(path.dirname(absolute), protectedRoot.resolved, label + ' path escaped its root');
  const pathStat = fs.lstatSync(absolute, { bigint: true });
  assert.equal(pathStat.isSymbolicLink(), false, label + ' must not be a symlink or reparse point');
  assert.equal(pathStat.isFile(), true, label + ' must be a regular file');
  assert.equal(pathStat.nlink, 1n, label + ' must not be hard-linked');
  assert.equal(pathStat.size >= 1n && pathStat.size <= BigInt(maxBytes), true, label + ' size invalid');
  assert.equal(samePath(realpath(absolute), absolute), true, label + ' path is indirect');
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  const handle = fs.openSync(absolute, fs.constants.O_RDONLY | noFollow);
  try {
    const before = fs.fstatSync(handle, { bigint: true });
    assert.equal(before.isFile(), true, label + ' opened object must be a regular file');
    assert.equal(before.nlink, 1n, label + ' opened object must not be hard-linked');
    assert.equal(before.dev, pathStat.dev, label + ' identity changed before open (dev)');
    assert.equal(before.ino, pathStat.ino, label + ' identity changed before open (ino)');
    const bytes = readExact(handle, before.size, label);
    const after = fs.fstatSync(handle, { bigint: true });
    assertStableFile(before, after, label);
    const afterPath = fs.lstatSync(absolute, { bigint: true });
    assert.equal(afterPath.dev, after.dev, label + ' path identity changed after read (dev)');
    assert.equal(afterPath.ino, after.ino, label + ' path identity changed after read (ino)');
    return bytes;
  } finally {
    fs.closeSync(handle);
  }
}

function createBuildAttestationWorkspace() {
  const temporaryBase = trustedTemporaryBase();
  const root = fs.mkdtempSync(path.join(temporaryBase, 'ceragon-c07-build-attestation-'));
  assertDirectRoot(root);
  assert.deepStrictEqual(fs.readdirSync(root), [], 'build attestation workspace was not empty');
  let disposed = false;
  return Object.freeze({
    iidPath: path.join(root, 'iid'),
    metadataPath: path.join(root, 'metadata.json'),
    read() {
      assert.equal(disposed, false, 'build attestation workspace was already disposed');
      assert.deepStrictEqual(
        fs.readdirSync(root).sort(),
        ['iid', 'metadata.json'],
        'build attestation workspace contains an unexpected entry',
      );
      return Object.freeze({
        iidBytes: readDirectBoundedFile(root, 'iid', 71, 'Buildx iidfile'),
        metadataBytes: readDirectBoundedFile(root, 'metadata.json', 262_144, 'Buildx metadata file'),
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      assert.equal(isWithin(temporaryBase, root), true, 'build attestation cleanup escaped temporary base');
      assert.match(path.basename(root), /^ceragon-c07-build-attestation-[A-Za-z0-9_-]+$/);
      fs.rmSync(root, { recursive: true, force: true });
    },
  });
}

function assertBuildxDigestRecord(value, expectedHex, label) {
  assertExactKeys(value, ['sha256'], label);
  assert.match(value.sha256, /^[0-9a-f]{64}$/, label + ' SHA-256 invalid');
  if (expectedHex !== null) assert.equal(value.sha256, expectedHex, label + ' SHA-256 changed');
}

function validateBuildxAttestationBytes(iidBytes, metadataBytes, expected) {
  assert.equal(Buffer.isBuffer(iidBytes), true, 'Buildx iidfile must be bytes');
  assert.equal(iidBytes.length, 71, 'Buildx iidfile byte count changed');
  const iid = iidBytes.toString('ascii');
  assert.deepStrictEqual(Buffer.from(iid, 'ascii'), iidBytes, 'Buildx iidfile must be ASCII');
  assert.match(iid, /^sha256:[0-9a-f]{64}$/, 'Buildx iidfile must contain one exact config digest without whitespace');
  assert.equal(Buffer.isBuffer(metadataBytes), true, 'Buildx metadata must be bytes');
  assert.equal(metadataBytes.length >= 2 && metadataBytes.length <= 262_144, true, 'Buildx metadata byte count invalid');
  assertExactKeys(expected, ['baseImage', 'buildTag'], 'expected Buildx attestation');
  const baseImage = containerImageValues().find((candidate) => candidate === expected.baseImage);
  assert.ok(baseImage, 'expected Buildx base image is not reviewed');
  assert.match(expected.buildTag, /^ceragon-c07-input:[0-9a-f]{32}$/, 'expected Buildx image tag invalid');

  const metadata = parseStrictJsonBytes(
    metadataBytes,
    { maxBytes: 262_144, maxDepth: 16, maxNodes: 4096 },
  );
  assertExactKeys(
    metadata,
    [
      'buildx.build.provenance',
      'buildx.build.ref',
      'containerimage.config.digest',
      'containerimage.descriptor',
      'containerimage.digest',
      'image.name',
    ],
    'Buildx metadata',
  );
  assert.equal(metadata['containerimage.config.digest'], iid, 'Buildx config digest does not match iidfile');
  assert.match(metadata['containerimage.digest'], /^sha256:[0-9a-f]{64}$/, 'Buildx manifest digest invalid');
  const descriptor = metadata['containerimage.descriptor'];
  assertExactKeys(descriptor, ['mediaType', 'digest', 'size', 'platform'], 'Buildx image descriptor');
  assert.equal(descriptor.mediaType, 'application/vnd.docker.distribution.manifest.v2+json', 'Buildx manifest media type changed');
  assert.equal(descriptor.digest, metadata['containerimage.digest'], 'Buildx descriptor and manifest digests differ');
  assert.equal(Number.isSafeInteger(descriptor.size) && descriptor.size >= 1 && descriptor.size <= 16_777_216, true, 'Buildx descriptor size invalid');
  assertExactKeys(descriptor.platform, ['architecture', 'os'], 'Buildx descriptor platform');
  assert.deepStrictEqual(descriptor.platform, { architecture: 'amd64', os: 'linux' }, 'Buildx descriptor platform changed');
  assert.equal(metadata['image.name'], 'docker.io/library/' + expected.buildTag, 'Buildx loaded image name changed');
  assert.match(
    metadata['buildx.build.ref'],
    /^[a-z0-9][a-z0-9.-]{0,63}\/[a-z0-9][a-z0-9.-]{0,63}\/[a-z0-9]{8,128}$/,
    'Buildx build reference invalid',
  );

  const provenance = metadata['buildx.build.provenance'];
  assertExactKeys(provenance, ['builder', 'buildType', 'materials', 'invocation'], 'Buildx provenance');
  assertExactKeys(provenance.builder, ['id'], 'Buildx provenance builder');
  assert.equal(provenance.builder.id, '', 'Buildx provenance builder ID changed');
  assert.equal(provenance.buildType, 'https://mobyproject.org/buildkit@v1', 'Buildx provenance build type changed');
  assert.equal(Array.isArray(provenance.materials) && provenance.materials.length === 2, true, 'Buildx provenance materials changed');
  for (const material of provenance.materials) assertExactKeys(material, ['uri', 'digest'], 'Buildx provenance material');
  const repository = baseImage.repositoryDigest.slice(0, baseImage.repositoryDigest.indexOf('@'));
  const baseHex = baseImage.id.slice('sha256:'.length);
  assert.equal(
    provenance.materials[0].uri,
    'pkg:docker/' + repository + '?digest=' + baseImage.id + '&platform=linux%2Famd64',
    'Buildx provenance base material changed',
  );
  assertBuildxDigestRecord(provenance.materials[0].digest, baseHex, 'Buildx base material digest');
  const sessionMaterial = provenance.materials[1];
  assert.match(sessionMaterial.uri, /^http:\/\/buildkit-session\/[a-z0-9]{8,128}$/, 'Buildx session material URI invalid');
  assertBuildxDigestRecord(sessionMaterial.digest, null, 'Buildx session material digest');

  const invocation = provenance.invocation;
  assertExactKeys(invocation, ['configSource', 'parameters', 'environment'], 'Buildx provenance invocation');
  assertExactKeys(invocation.configSource, ['uri', 'digest', 'entryPoint'], 'Buildx provenance config source');
  assert.equal(invocation.configSource.uri, sessionMaterial.uri, 'Buildx config-source URI changed');
  assert.deepStrictEqual(invocation.configSource.digest, sessionMaterial.digest, 'Buildx config-source digest changed');
  assert.equal(invocation.configSource.entryPoint, 'Dockerfile', 'Buildx config-source entrypoint changed');
  const parameters = invocation.parameters;
  assertExactKeys(parameters, ['frontend', 'args', 'root', 'compatibilityVersion'], 'Buildx provenance parameters');
  assert.equal(parameters.frontend, 'dockerfile.v0', 'Buildx frontend changed');
  const requiredArgs = {
    'build-arg:SOURCE_DATE_EPOCH': '0',
    'force-network-mode': 'none',
    'no-cache': '',
  };
  assert.deepStrictEqual(parameters.args, requiredArgs, 'Buildx build parameters changed');
  assert.equal(parameters.compatibilityVersion, 20, 'Buildx compatibility version changed');
  assertExactKeys(parameters.root, ['configSource', 'request'], 'Buildx provenance root');
  assertExactKeys(parameters.root.configSource, ['uri', 'digest', 'path'], 'Buildx root config source');
  assert.equal(parameters.root.configSource.uri, sessionMaterial.uri, 'Buildx root config-source URI changed');
  assert.deepStrictEqual(parameters.root.configSource.digest, sessionMaterial.digest, 'Buildx root config-source digest changed');
  assert.equal(parameters.root.configSource.path, 'Dockerfile', 'Buildx root Dockerfile path changed');
  assertExactKeys(parameters.root.request, ['args'], 'Buildx root request');
  assert.deepStrictEqual(parameters.root.request.args, requiredArgs, 'Buildx root request arguments changed');
  assertExactKeys(invocation.environment, ['dockerfileVersion', 'platform'], 'Buildx provenance environment');
  assert.match(invocation.environment.dockerfileVersion, /^\d+\.\d+\.\d+$/, 'Buildx Dockerfile frontend version invalid');
  assert.equal(invocation.environment.platform, 'linux/amd64', 'Buildx provenance platform changed');

  return deepFreeze({
    configDigest: iid,
    manifestDigest: descriptor.digest,
    descriptorBytes: descriptor.size,
    descriptorMediaType: descriptor.mediaType,
    iidfileBytes: iidBytes.length,
    iidfileSha256: sha256(iidBytes),
    metadataBytes: metadataBytes.length,
    metadataSha256: sha256(metadataBytes),
    provenanceSha256: sha256(Buffer.from(stableJson(provenance), 'utf8')),
    buildReferenceSha256: sha256(Buffer.from(metadata['buildx.build.ref'], 'ascii')),
    contextSourceSha256: 'sha256:' + sessionMaterial.digest.sha256,
    imageNameSha256: sha256(Buffer.from(metadata['image.name'], 'ascii')),
  });
}

function buildImmutableInputImage(snapshot, baseImageKey, driver = null) {
  assert.equal(repositorySnapshots.has(snapshot), true, 'immutable input must come from a C07 commit snapshot');
  assert.equal(snapshot.verify(), true, 'commit snapshot changed before immutable image construction');
  const baseImage = containerImage(baseImageKey);
  assert.ok(baseImage, `unknown fixed Docker base image ${baseImageKey}`);
  if (!dockerEnvironmentState.proof?.images?.[baseImageKey]) {
    verifyDockerExecutionEnvironment([baseImageKey]);
  }
  const baseProof = dockerEnvironmentState.proof.images[baseImageKey];
  const buildReferenceProof = verifyLocalBuildReference(
    baseImage,
    `${baseImageKey} local build reference before build`,
  );
  const buildRunId = crypto.randomBytes(16).toString('hex');
  const buildTag = 'ceragon-c07-input:' + buildRunId;
  const context = snapshot.buildDockerContext(baseImageKey, driver, buildRunId);
  const driverDescriptor = driver === null
    ? null
    : REVIEWED_SEMANTIC_DRIVER_DESCRIPTORS[driver.artifact.consumer];
  const driverContextPath = driverDescriptor === null
    ? null
    : (driverDescriptor.contextPath || driverDescriptor.containerPath.slice(1));
  const addedCopyLayerCount = driver === null ? 1 : 2;
  const attestationWorkspace = createBuildAttestationWorkspace();
  const candidateImageIds = new Set();
  let built = null;
  let attestation = null;
  let buildFailure = null;
  try {
    built = runBuildxSync(
      [
        'build',
        '--load',
        '--network', 'none',
        '--no-cache',
        '--pull=false',
        '--provenance=false',
        '--sbom=false',
        '--platform', 'linux/amd64',
        '--build-arg', 'SOURCE_DATE_EPOCH=0',
        '--iidfile', attestationWorkspace.iidPath,
        '--metadata-file', attestationWorkspace.metadataPath,
        '--tag', buildTag,
        '-',
      ],
      'immutable input image build',
      {
        input: context.bytes,
        maxStdoutBytes: 1_048_576,
        maxStderrBytes: 1_048_576,
        timeoutMs: 300_000,
      },
    );
    const attestationFiles = attestationWorkspace.read();
    attestation = validateBuildxAttestationBytes(
      attestationFiles.iidBytes,
      attestationFiles.metadataBytes,
      { baseImage, buildTag },
    );
    candidateImageIds.add(attestation.manifestDigest);
  } catch (error) {
    buildFailure = error;
  }
  try {
    attestationWorkspace.dispose();
  } catch (error) {
    if (buildFailure === null) buildFailure = error;
  }
  if (buildFailure !== null) {
    try {
      cleanupImmutableBuildArtifacts(buildTag, buildRunId, [...candidateImageIds], 'failed immutable build');
    } catch (cleanupError) {
      throw new IntegrationGateError(
        'IMMUTABLE_IMAGE_CLEANUP_FAILED',
        'failed immutable build cleanup could not prove absence',
        { causeCode: cleanupError.code, originalCauseCode: buildFailure.code },
      );
    }
    throw buildFailure;
  }
  assert.ok(built && attestation, 'immutable build completed without an attestation');
  const validateBuiltImage = () => {
  const buildReferenceAfter = verifyLocalBuildReference(
    baseImage,
    `${baseImageKey} local build reference after build`,
  );
  assert.deepStrictEqual(
    buildReferenceAfter,
    buildReferenceProof,
    'local build reference changed during immutable build',
  );
  const template = '{"id":"{{.Id}}","os":"{{.Os}}","architecture":"{{.Architecture}}","config":{{json .Config}},"layers":{{json .RootFS.Layers}}}';
  const inspected = parseDockerJson(
    runDockerSync(
      ['image', 'inspect', attestation.manifestDigest, '--format', template],
      'immutable input image inspection by attested engine ID',
    ).stdout,
    'immutable input image inspection by attested engine ID',
  );
  const tagIdentity = parseDockerJson(
    runDockerSync(
      ['image', 'inspect', buildTag, '--format', '{"id":"{{.Id}}"}'],
      'immutable input temporary tag binding',
    ).stdout,
    'immutable input temporary tag binding',
  );
  assertExactKeys(tagIdentity, ['id'], 'immutable input temporary tag identity');
  assert.equal(tagIdentity.id, attestation.manifestDigest, 'temporary image tag does not bind the attested engine ID');
  const id = inspected.id;
  assert.match(id, /^sha256:[0-9a-f]{64}$/, 'immutable input image ID is invalid');
  assert.equal(id, attestation.manifestDigest, 'loaded engine image ID differs from Buildx manifest attestation');
  candidateImageIds.add(id);
  assert.notEqual(id, baseImage.id, 'immutable input image unexpectedly equals its base');
  let addedHistory;
  let childHistory;
  const baseConfig = dockerBaseImageConfigState.get(baseImageKey);
  assert.ok(baseConfig, 'reviewed base image Config witness is missing');
  const expectedLabels = {
    ...(baseConfig.Labels || {}),
    'ceragon.c07.snapshot.commit': snapshot.proof.commit,
    'ceragon.c07.snapshot.tree': snapshot.proof.tree,
    'ceragon.c07.snapshot.manifest': snapshot.proof.manifestSha256,
    'ceragon.c07.base.image': baseImage.id,
    'ceragon.c07.build.run': buildRunId,
    ...(context.driver ? {
      'ceragon.c07.driver.id': context.driver.id,
      'ceragon.c07.driver.sha256': context.driver.sha256,
      'ceragon.c07.driver.bytes': String(context.driver.bytes),
      'ceragon.c07.driver.path': context.driver.containerPath,
    } : {}),
  };
  const expectedImageConfig = deepFreeze({
    ...baseConfig,
    Labels: expectedLabels,
  });
  try {
    assert.equal(inspected.id, id, 'immutable input image ID mismatch');
    assert.equal(inspected.os, baseImage.os, 'immutable input image OS mismatch');
    assert.equal(inspected.architecture, baseImage.architecture, 'immutable input image architecture mismatch');
    assertRecord(inspected.config, 'immutable input image Config');
    assert.deepStrictEqual(
      inspected.config,
      expectedImageConfig,
      'immutable input image Config differs from the exact base plus approved labels',
    );
    assert.deepStrictEqual(
      inspected.layers.slice(0, baseProof.layers.length),
      baseProof.layers,
      'immutable input image does not descend from the exact reviewed base layers',
    );
    if (inspected.layers.length !== baseProof.layers.length + addedCopyLayerCount) {
      throw new IntegrationGateError(
        'IMMUTABLE_IMAGE_LAYER_COUNT',
        'immutable input image COPY layer count changed',
        {
          baseLayerCount: baseProof.layers.length,
          childLayerCount: inspected.layers.length,
          expectedAddedLayers: addedCopyLayerCount,
          addedLayers: inspected.layers.slice(baseProof.layers.length),
        },
      );
    }
    const addedLayers = inspected.layers.slice(baseProof.layers.length);
    for (const layer of addedLayers) {
      assert.match(layer, /^sha256:[0-9a-f]{64}$/, 'immutable input diff layer is invalid');
      assert.notEqual(
        layer,
        'sha256:5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef',
        'immutable input COPY diff must not be the canonical empty layer',
      );
    }
    const baseHistory = dockerImageHistoryState.get(baseImageKey);
    assert.ok(baseHistory, 'reviewed base image history proof is missing');
    childHistory = readDockerImageHistory(id, 'immutable input image history proof');
    const addedHistoryCount = childHistory.length - baseHistory.length;
    const expectedAddedHistory = [
      ...(context.driver ? [
        `COPY --chown=65534:65534 ${driverContextPath} ${context.driver.containerPath} # buildkit`,
      ] : []),
      `COPY --chown=65534:65534 snapshot/ /workspace/ # buildkit`,
      ...(context.driver ? [
        `LABEL ceragon.c07.driver.path=${context.driver.containerPath}`,
        `LABEL ceragon.c07.driver.bytes=${context.driver.bytes}`,
        `LABEL ceragon.c07.driver.sha256=${context.driver.sha256}`,
        `LABEL ceragon.c07.driver.id=${context.driver.id}`,
      ] : []),
      `LABEL ceragon.c07.build.run=${buildRunId}`,
      `LABEL ceragon.c07.base.image=${baseImage.id}`,
      `LABEL ceragon.c07.snapshot.manifest=${snapshot.proof.manifestSha256}`,
      `LABEL ceragon.c07.snapshot.tree=${snapshot.proof.tree}`,
      `LABEL ceragon.c07.snapshot.commit=${snapshot.proof.commit}`,
    ];
    assert.equal(
      addedHistoryCount,
      expectedAddedHistory.length,
      'immutable input history entry count changed',
    );
    assert.deepStrictEqual(
      childHistory.slice(addedHistoryCount),
      baseHistory,
      'immutable input history does not end with the exact reviewed base history',
    );
    addedHistory = childHistory.slice(0, addedHistoryCount);
    assert.deepStrictEqual(
      addedHistory.map(({ createdBy }) => createdBy),
      expectedAddedHistory,
      'immutable input history contains an instruction outside the fixed LABEL/COPY policy',
    );
    assert.deepStrictEqual(
      addedHistory.map(({ comment }) => comment),
      Array(expectedAddedHistory.length).fill('buildkit.dockerfile.v0'),
      'immutable input history builder comments changed',
    );
  } catch (error) {
    try {
      cleanupImmutableBuildArtifacts(buildTag, buildRunId, [...candidateImageIds], 'invalid immutable input image');
    } catch (cleanupError) {
      throw new IntegrationGateError(
        'IMMUTABLE_IMAGE_CLEANUP_FAILED',
        'invalid immutable input image cleanup could not prove absence',
        { causeCode: cleanupError.code, originalCauseCode: error.code },
      );
    }
    throw error;
  }
  let removed = false;
  const proof = deepFreeze({
    baseImageKey,
    baseImageId: baseImage.id,
    baseBuildReference: buildReferenceProof.reference,
    baseBuildReferencePolicy: buildReferenceProof.referencePolicy,
    inputImageId: id,
    buildRunId,
    buildConfigDigest: attestation.configDigest,
    buildManifestDigest: attestation.manifestDigest,
    buildDescriptorBytes: attestation.descriptorBytes,
    buildDescriptorMediaType: attestation.descriptorMediaType,
    buildIidfileBytes: attestation.iidfileBytes,
    buildIidfileSha256: attestation.iidfileSha256,
    buildMetadataBytes: attestation.metadataBytes,
    buildMetadataSha256: attestation.metadataSha256,
    buildProvenanceSha256: attestation.provenanceSha256,
    buildReferenceSha256: attestation.buildReferenceSha256,
    buildContextSourceSha256: attestation.contextSourceSha256,
    buildImageNameSha256: attestation.imageNameSha256,
    buildStdoutBytes: built.stdout.length,
    buildStdoutSha256: sha256(built.stdout),
    buildStderrBytes: built.stderr.length,
    buildStderrSha256: sha256(built.stderr),
    baseImageConfigSha256: baseProof.configSha256,
    imageConfigSha256: sha256(Buffer.from(stableJson(inspected.config), 'utf8')),
    snapshotCommit: snapshot.proof.commit,
    snapshotTree: snapshot.proof.tree,
    snapshotManifestSha256: snapshot.proof.manifestSha256,
    contextSha256: context.sha256,
    dockerfileSha256: context.dockerfileSha256,
    contextFormat: context.format,
    contextEntryCount: context.entryCount,
    layerCount: inspected.layers.length,
    layers: [...inspected.layers],
    layersSha256: sha256(Buffer.from(`${inspected.layers.join('\n')}\n`, 'ascii')),
    diffLayerSha256: inspected.layers.at(-1),
    diffLayerEmpty: false,
    nonEmptyAddedLayers: addedCopyLayerCount,
    historyEntryCount: childHistory.length,
    historySha256: dockerHistoryDigest(childHistory),
    addedHistoryEntries: addedHistory.length,
    addedHistorySha256: dockerHistoryDigest(addedHistory),
    historyPolicy: context.driver
      ? 'EXACT_BASE_SUFFIX_NINE_FIXED_LABELS_TWO_COPIES'
      : 'EXACT_BASE_SUFFIX_FIVE_FIXED_LABELS_ONE_COPY',
    dockerfilePolicy: 'FROM_EXACT_DIGEST_FIXED_LABELS_COPY_ONLY_NO_RUN_NO_ADD',
    buildNetwork: 'NONE',
    buildPull: false,
    buildCache: false,
    buildCacheReuse: false,
    buildCacheRetentionLimitation: 'MAY_RETAIN_NEW_LOCAL_COPY_CACHE',
    cacheInfluenceOnExecution: 'PREVENTED_BY_NO_CACHE_EXACT_CONTEXT_AND_IMAGE_ID',
  });
  const inputImage = Object.freeze({
    id,
    tag: buildTag,
    baseImageKey,
    proof,
    removed: () => removed,
    markRemoved: () => { removed = true; },
  });
  immutableInputImages.add(inputImage);
  immutableInputImageConfigWitnesses.set(inputImage, expectedImageConfig);
  assert.equal(inspectImmutableInputImage(inputImage), true);
  return inputImage;
  };
  try {
    return validateBuiltImage();
  } catch (error) {
    try {
      cleanupImmutableBuildArtifacts(buildTag, buildRunId, [...candidateImageIds], 'post-build immutable image validation');
    } catch (cleanupError) {
      throw new IntegrationGateError(
        'IMMUTABLE_IMAGE_CLEANUP_FAILED',
        'post-build immutable image validation cleanup could not prove absence',
        { causeCode: cleanupError.code, originalCauseCode: error.code },
      );
    }
    throw error;
  }
}
function validateContainedProcessSpec(spec) {
  assertExactKeys(spec, ['id', 'image', 'snapshot', 'cwd', 'args'], 'contained process specification');
  assert.match(spec.id, /^[a-z][a-z0-9.-]{0,95}$/, 'contained process id is invalid');
  containerImage(spec.image);
  assert.equal(repositorySnapshots.has(spec.snapshot), true, 'contained process requires a C07 commit snapshot');
  assert.equal(typeof spec.cwd === 'string' && spec.cwd.length >= 1 && spec.cwd.length <= 512, true, 'contained cwd is invalid');
  assert.equal(spec.cwd.includes('\\'), false, 'contained cwd must use forward slashes');
  assert.equal(path.posix.isAbsolute(spec.cwd), false, 'contained cwd must be relative');
  assert.equal(path.posix.normalize(spec.cwd), spec.cwd, 'contained cwd must be canonical');
  assert.equal(spec.cwd.startsWith('../'), false, 'contained cwd escapes the snapshot');
  const cwd = path.resolve(spec.snapshot.root, ...spec.cwd.split('/'));
  assert.equal(isWithin(spec.snapshot.root, cwd), true, 'contained cwd escapes snapshot root');
  assert.equal(fs.statSync(cwd).isDirectory(), true, 'contained cwd is missing');
  assert.equal(Array.isArray(spec.args) && spec.args.length >= 1 && spec.args.length <= 64, true, 'contained args invalid');
  for (const argument of spec.args) {
    assert.equal(typeof argument, 'string', 'contained argument must be a string');
    assert.equal(argument.length <= 16_384, true, 'contained argument exceeds its bound');
    assert.doesNotMatch(argument, /[\u0000]/, 'contained argument contains NUL');
  }
}
function parseCreatedContainerId(bytes, label) {
  assert.equal(Buffer.isBuffer(bytes), true, `${label} must be bytes`);
  assert.equal(bytes.length <= 128, true, `${label} exceeded its byte bound`);
  const text = bytes.toString('ascii');
  assert.deepStrictEqual(Buffer.from(text, 'ascii'), bytes, `${label} must be ASCII`);
  assert.match(text, /^[0-9a-f]{64}\r?\n$/, `${label} must contain exactly one full container ID`);
  return text.trim();
}

function parseContainerIds(bytes, label) {
  assert.equal(Buffer.isBuffer(bytes), true, `${label} must be bytes`);
  assert.equal(bytes.length <= 1_048_576, true, `${label} exceeded its byte bound`);
  const text = bytes.toString('ascii');
  assert.deepStrictEqual(Buffer.from(text, 'ascii'), bytes, `${label} must be ASCII`);
  if (text.length === 0) return [];
  assert.match(text, /^(?:[0-9a-f]{64}(?:\r?\n|$))+$/, `${label} contains an invalid container ID`);
  const ids = text.split(/\r?\n/);
  if (ids.at(-1) === '') ids.pop();
  assert.equal(new Set(ids).size, ids.length, `${label} repeated a container ID`);
  return ids;
}

function parseContainerIdentityRows(bytes, label) {
  assert.equal(Buffer.isBuffer(bytes), true, `${label} must be bytes`);
  assert.equal(bytes.length <= 65_536, true, `${label} exceeded its byte bound`);
  const text = bytes.toString('utf8');
  assert.deepStrictEqual(Buffer.from(text, 'utf8'), bytes, `${label} must be valid UTF-8`);
  if (text.length === 0) return [];
  assert.match(text, /\r?\n$/, `${label} must have a terminal newline`);
  const lines = text.split(/\r?\n/);
  lines.pop();
  assert.equal(lines.length <= 16, true, `${label} returned too many rows`);
  const rows = lines.map((line, index) => {
    const separator = line.indexOf('\t');
    assert.equal(separator === 64 && line.indexOf('\t', separator + 1) === -1, true, `${label} row ${index} is malformed`);
    const id = line.slice(0, separator);
    const name = line.slice(separator + 1);
    assert.match(id, /^[0-9a-f]{64}$/, `${label} row ${index} ID is invalid`);
    assert.match(name, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, `${label} row ${index} name is invalid`);
    return Object.freeze({ id, name });
  });
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length, `${label} repeated an ID`);
  return rows;
}

function containerControlArgs(operation, containerId) {
  assert.match(containerId, /^[0-9a-f]{64}$/, 'container control ID is invalid');
  if (operation === 'start') return ['container', 'start', '--attach', containerId];
  if (operation === 'kill') return ['container', 'kill', '--signal', 'KILL', containerId];
  if (operation === 'remove') return ['container', 'rm', '--force', containerId];
  throw new IntegrationGateError('CONTAINER_OPERATION_INVALID', 'unknown contained-container operation');
}
function validateNoContainerNetworkEndpoints(networkSettings, label) {
  assertExactKeys(
    networkSettings,
    ['sandboxId', 'sandboxKey', 'ports', 'networks'],
    label + ' NetworkSettings',
  );
  assert.equal(typeof networkSettings.sandboxId === 'string' && networkSettings.sandboxId.length <= 128, true, label + ' sandbox ID invalid');
  assert.equal(typeof networkSettings.sandboxKey === 'string' && networkSettings.sandboxKey.length <= 1024, true, label + ' sandbox key invalid');
  assert.equal(
    networkSettings.ports === null
      || (typeof networkSettings.ports === 'object' && Object.keys(networkSettings.ports).length === 0),
    true,
    label + ' network ports must be empty',
  );
  assertExactKeys(networkSettings.networks, ['none'], label + ' networks');
  const none = networkSettings.networks.none;
  assertRecord(none, label + ' none network');
  for (const field of [
    'NetworkID',
    'EndpointID',
    'Gateway',
    'IPAddress',
    'MacAddress',
    'IPv6Gateway',
    'GlobalIPv6Address',
  ]) {
    assert.equal(none[field], '', label + ' none network field ' + field + ' must be empty');
  }
  assert.equal(none.IPPrefixLen, 0, label + ' IPv4 prefix must be zero');
  assert.equal(none.GlobalIPv6PrefixLen, 0, label + ' IPv6 prefix must be zero');
  assert.equal(none.Links === null || none.Links?.length === 0, true, label + ' network links must be empty');
  assert.equal(none.Aliases === null || none.Aliases?.length === 0, true, label + ' network aliases must be empty');
  assert.equal(none.DNSNames === null || none.DNSNames?.length === 0, true, label + ' DNS names must be empty');
  assert.equal(none.DriverOpts === null || Object.keys(none.DriverOpts).length === 0, true, label + ' driver options must be empty');
  return true;
}


function validateContainedContainerInspection(inspected, expected, label, options = {}) {
  const { requireExpectedName = true } = options;
  assertExactKeys(
    inspected,
    ['id', 'name', 'path', 'args', 'config', 'hostConfig', 'mounts', 'networkSettings', 'state'],
    `${label} inspection`,
  );
  assert.equal(inspected.id, expected.id, `${label} exact container ID changed`);
  assert.match(inspected.name, /^\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/, `${label} name is invalid`);
  if (requireExpectedName) assert.equal(inspected.name, `/${expected.name}`, `${label} name metadata changed`);
  assert.equal(inspected.path, expected.entrypoint, `${label} executable changed`);
  assert.deepStrictEqual(inspected.args, expected.args, `${label} process arguments changed`);
  assertRecord(inspected.config, `${label} Config`);
  assertRecord(inspected.hostConfig, `${label} HostConfig`);
  assert.equal(Array.isArray(inspected.mounts), true, `${label} Mounts must be an array`);
  assert.deepStrictEqual(inspected.mounts, [], `${label} must not have any mounts`);
  const config = inspected.config;
  assertExactKeys(
    config,
    [
      'Hostname',
      'Domainname',
      'User',
      'AttachStdin',
      'AttachStdout',
      'AttachStderr',
      'Tty',
      'OpenStdin',
      'StdinOnce',
      'Env',
      'Cmd',
      'Healthcheck',
      'Image',
      'Volumes',
      'WorkingDir',
      'Entrypoint',
      'Labels',
      'StopTimeout',
    ],
    label + ' Config',
  );
  assert.equal(config.Hostname, expected.id.slice(0, 12), label + ' hostname changed');
  assert.equal(config.Domainname, '', label + ' domain name changed');
  assert.equal(config.AttachStdin, false, label + ' stdin attachment must remain disabled');
  assert.equal(config.AttachStdout, true, label + ' stdout attachment must remain enabled');
  assert.equal(config.AttachStderr, true, label + ' stderr attachment must remain enabled');
  assert.deepStrictEqual(config.Healthcheck?.Test, ['NONE'], label + ' healthcheck must remain disabled');
  assert.equal(config.StopTimeout, 1, label + ' stop timeout changed');

  assert.equal(config.Image, expected.imageId, `${label} image ID changed`);
  assert.deepStrictEqual(config.Entrypoint, [expected.entrypoint], `${label} entrypoint changed`);
  assert.deepStrictEqual(config.Cmd, expected.args, `${label} command changed`);
  assert.equal(config.User, '65534:65534', `${label} user changed`);
  assert.equal(config.WorkingDir, expected.cwd, `${label} working directory changed`);
  assert.deepStrictEqual(config.Env, expected.environment, label + ' exact environment changed');
  assert.deepStrictEqual(config.Labels, expected.labels, `${label} labels changed`);
  assert.equal(config.OpenStdin, false, `${label} stdin must remain closed`);
  assert.equal(config.StdinOnce, false, `${label} stdin-once must remain disabled`);
  assert.equal(config.Tty, false, `${label} TTY must remain disabled`);
  assert.equal(config.Volumes === null || Object.keys(config.Volumes).length === 0, true, `${label} Config.Volumes must be empty`);
  assert.equal(Array.isArray(config.Env), true, `${label} Config.Env must be an array`);
  const environment = new Map();
  for (const value of config.Env) {
    assert.equal(typeof value === 'string' && value.length <= 16_384, true, `${label} environment entry is invalid`);
    const separator = value.indexOf('=');
    assert.equal(separator > 0, true, `${label} environment entry is malformed`);
    const key = value.slice(0, separator);
    const folded = key.toLowerCase();
    assert.equal(environment.has(folded), false, `${label} environment repeats a case-insensitive key`);
    environment.set(folded, value);
  }
  for (const value of expected.environment) {
    const key = value.slice(0, value.indexOf('=')).toLowerCase();
    assert.equal(environment.get(key), value, `${label} protected environment value changed`);
  }

  const host = inspected.hostConfig;
  assert.deepStrictEqual(host.LogConfig, { Type: 'none', Config: {} }, label + ' log driver must remain none');
  assert.equal(host.Privileged, false, `${label} privileged mode is forbidden`);
  assert.equal(host.ReadonlyRootfs, true, `${label} root filesystem must be read-only`);
  assert.equal(host.NetworkMode, 'none', `${label} network must remain disabled`);
  assert.deepStrictEqual(host.Binds, null, `${label} bind mounts are forbidden`);
  assert.equal(host.Mounts == null || (Array.isArray(host.Mounts) && host.Mounts.length === 0), true, `${label} HostConfig.Mounts must be empty`);
  assert.equal(host.VolumesFrom == null || (Array.isArray(host.VolumesFrom) && host.VolumesFrom.length === 0), true, `${label} volumes-from is forbidden`);
  assert.equal(host.Links == null || (Array.isArray(host.Links) && host.Links.length === 0), true, `${label} links are forbidden`);
  assert.equal(host.ExtraHosts == null || (Array.isArray(host.ExtraHosts) && host.ExtraHosts.length === 0), true, `${label} extra hosts are forbidden`);
  assert.deepStrictEqual(host.Devices, [], `${label} devices are forbidden`);
  assert.equal(host.DeviceRequests == null || (Array.isArray(host.DeviceRequests) && host.DeviceRequests.length === 0), true, `${label} device requests are forbidden`);
  assert.equal(host.DeviceCgroupRules == null || (Array.isArray(host.DeviceCgroupRules) && host.DeviceCgroupRules.length === 0), true, `${label} device cgroup rules are forbidden`);
  assert.equal(host.CapAdd, null, `${label} added capabilities are forbidden`);
  assert.deepStrictEqual(host.CapDrop, ['ALL'], `${label} capability drop changed`);
  assert.deepStrictEqual(host.SecurityOpt, ['no-new-privileges:true'], `${label} security options changed`);
  assert.equal(host.PidsLimit, 128, `${label} PID limit changed`);
  assert.equal(host.Memory, 1_073_741_824, `${label} memory limit changed`);
  assert.equal(host.MemorySwap, 1_073_741_824, `${label} memory+swap limit changed`);
  assert.equal(host.NanoCpus, 2_000_000_000, `${label} CPU limit changed`);
  assert.deepStrictEqual(host.Tmpfs, { '/tmp': expected.tmpfs }, `${label} tmpfs policy changed`);
  assert.equal(host.AutoRemove, false, `${label} auto-remove must remain disabled for witnessed cleanup`);
  assert.equal(host.PublishAllPorts, false, `${label} published ports are forbidden`);
  assert.deepStrictEqual(host.PortBindings, {}, `${label} port bindings are forbidden`);
  assert.equal(host.PidMode === '' || host.PidMode === 'private', true, `${label} PID namespace changed`);
  assert.equal(host.IpcMode === '' || host.IpcMode === 'private', true, `${label} IPC namespace changed`);
  assert.equal(validateNoContainerNetworkEndpoints(inspected.networkSettings, label), true);

  assert.equal(host.UTSMode === '' || host.UTSMode === 'private', true, `${label} UTS namespace changed`);
  assert.equal(host.UsernsMode === '', true, `${label} user namespace mode changed`);
  assert.equal(host.CgroupnsMode === '' || host.CgroupnsMode === 'private', true, `${label} cgroup namespace changed`);
  assert.equal(host.OomKillDisable === null || host.OomKillDisable === false, true, `${label} OOM kill protection is forbidden`);
  assert.equal(host.Init, true, `${label} init containment changed`);

  assertRecord(inspected.state, `${label} State`);
  assert.equal(typeof inspected.state.Running, 'boolean', `${label} Running state missing`);
  assert.equal(Number.isSafeInteger(inspected.state.Pid), true, `${label} PID state missing`);
  assert.equal(Number.isSafeInteger(inspected.state.ExitCode), true, `${label} exit-code state missing`);
  const securityConfiguration = {
    config: {
      image: config.Image,
      entrypoint: config.Entrypoint,
      command: config.Cmd,
      user: config.User,
      hostname: config.Hostname,
      domainname: config.Domainname,
      attachStdin: config.AttachStdin,
      attachStdout: config.AttachStdout,
      attachStderr: config.AttachStderr,
      healthcheck: config.Healthcheck,
      stopTimeout: config.StopTimeout,
      workingDirectory: config.WorkingDir,
      labels: config.Labels,
      openStdin: config.OpenStdin,
      stdinOnce: config.StdinOnce,
      tty: config.Tty,
      volumes: config.Volumes || {},
      environment: config.Env,
    },
    hostConfig: {
      privileged: host.Privileged,
      readonlyRootfs: host.ReadonlyRootfs,
      networkMode: host.NetworkMode,
      logConfig: host.LogConfig,
      binds: host.Binds || [],
      mounts: host.Mounts || [],
      volumesFrom: host.VolumesFrom || [],
      links: host.Links || [],
      extraHosts: host.ExtraHosts || [],
      devices: host.Devices,
      deviceRequests: host.DeviceRequests || [],
      deviceCgroupRules: host.DeviceCgroupRules || [],
      capAdd: host.CapAdd || [],
      capDrop: host.CapDrop,
      securityOpt: host.SecurityOpt,
      pidsLimit: host.PidsLimit,
      memory: host.Memory,
      memorySwap: host.MemorySwap,
      nanoCpus: host.NanoCpus,
      tmpfs: host.Tmpfs,
      autoRemove: host.AutoRemove,
      publishAllPorts: host.PublishAllPorts,
      portBindings: host.PortBindings,
      pidMode: host.PidMode,
      ipcMode: host.IpcMode,
    networkPolicy: { mode: 'none', endpointsPresent: false },
      utsMode: host.UTSMode,
      usernsMode: host.UsernsMode,
      cgroupnsMode: host.CgroupnsMode,
      oomKillDisable: host.OomKillDisable || false,
      init: host.Init,
    },
    mounts: inspected.mounts,
  };
  const configuration = { config, hostConfig: host, mounts: inspected.mounts };
  return deepFreeze({
    id: inspected.id,
    name: inspected.name.slice(1),
    configurationSha256: sha256(Buffer.from(stableJson(configuration), 'utf8')),
    securityConfigurationSha256: sha256(Buffer.from(stableJson(securityConfiguration), 'utf8')),
    running: inspected.state.Running,
    pid: inspected.state.Pid,
    exitCode: inspected.state.ExitCode,
  });
}

function inspectContainerState(containerId, expected, label, options = {}) {
  const result = runDockerSync(
    [
      'container', 'inspect',
      '--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"path":{{json .Path}},"args":{{json .Args}},"config":{{json .Config}},"hostConfig":{{json .HostConfig}},"mounts":{{json .Mounts}},"networkSettings":{"sandboxId":{{json .NetworkSettings.SandboxID}},"sandboxKey":{{json .NetworkSettings.SandboxKey}},"ports":{{json .NetworkSettings.Ports}},"networks":{{json .NetworkSettings.Networks}}},"state":{{json .State}}}',
      containerId,
    ],
    label,
    {
      allowFailure: true,
      maxStdoutBytes: 1_048_576,
      maxStderrBytes: 65_536,
      timeoutMs: 10_000,
    },
  );
  if (result.status !== 0) return null;
  return validateContainedContainerInspection(
    parseDockerJson(result.stdout, label),
    expected,
    label,
    options,
  );
}

function listExactContainerRows(name, label) {
  assert.match(name, /^ceragon-c07-[a-z0-9.-]{1,96}$/, `${label} name is invalid`);
  return runDockerSync(
    [
      'container', 'ls', '--all', '--no-trunc',
      '--filter', `name=^/${name}$`,
      '--format', '{{.ID}}\t{{.Names}}',
    ],
    label,
    { maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
  ).stdout;
}

function listAllContainerIds(label) {
  return runDockerSync(
    ['container', 'ls', '--all', '--no-trunc', '--format', '{{.ID}}'],
    label,
    { maxStdoutBytes: 1_048_576, maxStderrBytes: 65_536, timeoutMs: 10_000 },
  ).stdout;
}

function performVerifiedContainedCleanup(identity, operations) {
  assertExactKeys(identity, ['name', 'ids'], 'contained cleanup identity');
  assert.match(identity.name, /^ceragon-c07-[a-z0-9.-]{1,96}$/, 'contained cleanup name invalid');
  assert.equal(Array.isArray(identity.ids) && identity.ids.length <= 2, true, 'contained cleanup IDs invalid');
  assert.equal(new Set(identity.ids).size, identity.ids.length, 'contained cleanup repeated an ID');
  for (const id of identity.ids) assert.match(id, /^[0-9a-f]{64}$/, 'contained cleanup ID invalid');
  assertExactKeys(
    operations,
    ['removeId', 'listAllIds', 'listNameRows'],
    'contained cleanup operations',
  );
  for (const key of Object.keys(operations)) {
    assert.equal(typeof operations[key], 'function', `contained cleanup ${key} must be a function`);
  }
  const removals = [];
  for (const id of identity.ids) {
    let status = null;
    let errorCode = null;
    try {
      const result = operations.removeId(id);
      assertRecord(result, 'contained cleanup removal result');
      assert.equal(Number.isSafeInteger(result.status), true, 'contained cleanup removal status invalid');
      status = result.status;
    } catch (error) {
      errorCode = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    }
    removals.push(Object.freeze({ idSha256: sha256(Buffer.from(id, 'ascii')), status, errorCode }));
  }
  const allIds = parseContainerIds(operations.listAllIds(), 'contained cleanup exact ID listing');
  const survivingIds = identity.ids.filter((id) => allIds.includes(id));
  const nameRows = parseContainerIdentityRows(
    operations.listNameRows(),
    'contained cleanup exact name listing',
  );
  const survivingNameRows = nameRows.filter(({ name }) => name === identity.name);
  if (survivingIds.length !== 0 || survivingNameRows.length !== 0) {
    throw new IntegrationGateError(
      'CONTAINMENT_SURVIVOR',
      'contained process identity survived verified cleanup',
      {
        exactIdSurvivorCount: survivingIds.length,
        exactNameSurvivorCount: survivingNameRows.length,
      },
    );
  }
  return deepFreeze({
    containerRemoved: true,
    exactContainerIdsAbsent: true,
    exactContainerNameAbsent: true,
    survivorCount: 0,
    removals,
  });
}

function verifiedContainedCleanupOperations(name, label) {
  return Object.freeze({
    removeId: (id) => runDockerSync(
      containerControlArgs('remove', id),
      `${label} exact ID removal`,
      {
        allowFailure: true,
        maxStdoutBytes: 65_536,
        maxStderrBytes: 65_536,
        timeoutMs: 10_000,
      },
    ),
    listAllIds: () => listAllContainerIds(`${label} exact ID absence proof`),
    listNameRows: () => listExactContainerRows(name, `${label} exact name absence proof`),
  });
}

function discoverContainedCleanupIdentity(name, containerId, label) {
  assert.match(name, /^ceragon-c07-[a-z0-9.-]{1,96}$/, `${label} name is invalid`);
  assert.equal(containerId === null || /^[0-9a-f]{64}$/.test(containerId), true, `${label} ID is invalid`);
  const rows = parseContainerIdentityRows(
    listExactContainerRows(name, `${label} pre-cleanup name proof`),
    `${label} pre-cleanup name proof`,
  ).filter((row) => row.name === name);
  assert.equal(rows.length <= 1, true, `${label} exact name resolved to multiple containers`);
  const ids = new Set();
  if (containerId !== null) ids.add(containerId);
  for (const row of rows) ids.add(row.id);
  assert.equal(ids.size <= 2, true, `${label} cleanup identity exceeded its race bound`);
  return Object.freeze({ name, ids: Object.freeze([...ids]) });
}

function cleanupUnacceptedContainedProcess(name, containerId, label) {
  const identity = discoverContainedCleanupIdentity(name, containerId, label);
  return performVerifiedContainedCleanup(
    identity,
    verifiedContainedCleanupOperations(name, label),
  );
}

function cleanupContainedProcess(identity, expected, initialInspection) {
  assert.equal(initialInspection.id, identity.id, 'contained cleanup initial ID mismatch');
  let state = inspectContainerState(
    identity.id,
    expected,
    'contained process post-state proof',
    { requireExpectedName: false },
  );
  assert.ok(state, 'contained process disappeared before verified cleanup');
  assert.equal(
    state.securityConfigurationSha256,
    initialInspection.securityConfigurationSha256,
    'contained process configuration changed before cleanup',
  );
  if (state.running) {
    runDockerSync(
      containerControlArgs('kill', identity.id),
      'contained process exact ID kill',
      { maxStdoutBytes: 65_536, maxStderrBytes: 65_536, timeoutMs: 10_000 },
    );
    state = inspectContainerState(
      identity.id,
      expected,
      'contained process post-kill state proof',
      { requireExpectedName: false },
    );
  }
  assert.ok(state, 'contained process disappeared before witnessed removal');
  assert.equal(state.securityConfigurationSha256, initialInspection.securityConfigurationSha256, 'contained process configuration changed after kill');
  assert.equal(state.running, false, 'contained process remained running after exact ID kill');
  assert.equal(state.pid, 0, 'contained process PID survived termination');
  const proof = cleanupUnacceptedContainedProcess(identity.name, identity.id, 'contained process');
  return deepFreeze({
    ...proof,
    exitCode: state.exitCode,
    emergency: false,
    initialConfigurationSha256: initialInspection.configurationSha256,
    finalConfigurationSha256: state.configurationSha256,
    securityConfigurationSha256: state.securityConfigurationSha256,
    configurationSha256: state.configurationSha256,
  });
}

function containedCleanupInvariantId(error) {
  const message = String(error?.message || '');
  const catalog = [
    ['CONFIGURATION_CHANGED_BEFORE_CLEANUP', 'configuration changed before cleanup'],
    ['CONFIGURATION_CHANGED_AFTER_KILL', 'configuration changed after kill'],
    ['DISAPPEARED_BEFORE_CLEANUP', 'disappeared before verified cleanup'],
    ['DISAPPEARED_BEFORE_REMOVAL', 'disappeared before witnessed removal'],
    ['REMAINED_RUNNING', 'remained running after exact ID kill'],
    ['PID_SURVIVED', 'PID survived termination'],
    ['NAME_METADATA_CHANGED', 'name metadata changed'],
    ['MOUNTS_CHANGED', 'must not have any mounts'],
    ['LABELS_CHANGED', 'labels changed'],
    ['ENVIRONMENT_CHANGED', 'protected environment value changed'],
    ['READ_ONLY_CHANGED', 'root filesystem must be read-only'],
    ['NETWORK_CHANGED', 'network must remain disabled'],
    ['BINDS_CHANGED', 'bind mounts are forbidden'],
    ['HOST_MOUNTS_CHANGED', 'HostConfig.Mounts must be empty'],
    ['CAPABILITIES_CHANGED', 'capability drop changed'],
    ['SECURITY_OPTIONS_CHANGED', 'security options changed'],
    ['RESOURCE_LIMIT_CHANGED', 'limit changed'],
    ['TMPFS_CHANGED', 'tmpfs policy changed'],
    ['NAMESPACE_CHANGED', 'namespace changed'],
    ['INIT_CHANGED', 'init containment changed'],
    ['CLEANUP_ID_SURVIVED', 'identity survived verified cleanup'],
  ];
  const match = catalog.find(([, fragment]) => message.includes(fragment));
  return match ? match[0] : 'UNCLASSIFIED_ASSERTION';
}

function createBoundedTerminationController(operations, watchdogMs = 15_000) {
  assertExactKeys(
    operations,
    ['killContainer', 'killAttach', 'isSettled', 'onWatchdog'],
    'termination controller operations',
  );
  for (const key of Object.keys(operations)) assert.equal(typeof operations[key], 'function', `${key} must be a function`);
  assert.equal(Number.isSafeInteger(watchdogMs) && watchdogMs >= 10 && watchdogMs <= 60_000, true, 'termination watchdog bound invalid');
  let requested = false;
  let timer;
  return Object.freeze({
    request() {
      if (requested) return null;
      requested = true;
      let killError = null;
      try {
        operations.killContainer();
      } catch (error) {
        killError = error;
        try { operations.killAttach(); } catch {}
      }
      timer = setTimeout(() => {
        if (operations.isSettled()) return;
        let attachError = null;
        try { operations.killAttach(); } catch (error) { attachError = error; }
        operations.onWatchdog(attachError || new Error('contained attach did not close after forced stop'));
      }, watchdogMs);
      return killError;
    },
    cancel() {
      clearTimeout(timer);
    },
  });
}
function mergeExactContainerEnvironment(explicitEnvironment, inheritedEnvironment) {
  assert.equal(Array.isArray(explicitEnvironment), true, 'explicit container environment must be an array');
  assert.equal(Array.isArray(inheritedEnvironment), true, 'inherited container environment must be an array');
  const explicitKeys = new Set();
  const validateEntry = (value, label) => {
    assert.equal(typeof value === 'string' && value.length <= 16_384, true, label + ' entry invalid');
    const separator = value.indexOf('=');
    assert.equal(separator > 0, true, label + ' entry malformed');
    const key = value.slice(0, separator).toLowerCase();
    assert.match(key, /^[a-z_][a-z0-9_]*$/, label + ' key invalid');
    return key;
  };
  for (const value of explicitEnvironment) {
    const key = validateEntry(value, 'explicit container environment');
    assert.equal(explicitKeys.has(key), false, 'explicit container environment repeats a key');
    explicitKeys.add(key);
  }
  const inheritedKeys = new Set();
  const inherited = [];
  for (const value of inheritedEnvironment) {
    const key = validateEntry(value, 'inherited container environment');
    assert.equal(inheritedKeys.has(key), false, 'inherited container environment repeats a key');
    inheritedKeys.add(key);
    if (!explicitKeys.has(key)) inherited.push(value);
  }
  return Object.freeze([...explicitEnvironment, ...inherited]);
}

function runContainedProcess(spec, limits, semanticRequest = null) {
  validateContainedProcessSpec(spec);
  validateProcessLimits(limits);
  const semanticCapture = semanticRequest !== null;
  let semanticDriverWitness = null;
  if (semanticCapture) {
    assertExactKeys(
      semanticRequest,
      ['authority', 'consumer', 'driverArtifact'],
      'semantic capture request',
    );
    assert.equal(semanticRequest.authority, SEMANTIC_CAPTURE_AUTHORITY, 'semantic capture authority invalid');
    assert.equal(Object.hasOwn(APPROVED_INPUTS.consumers, semanticRequest.consumer), true, 'semantic consumer invalid');
    assert.equal(reviewedDriverArtifacts.has(semanticRequest.driverArtifact), true, 'semantic driver is not reviewed');
    assertExactKeys(
      semanticRequest.driverArtifact,
      ['consumer', 'driverId', 'bytes', 'sha256'],
      'reviewed semantic driver artifact',
    );
    assert.equal(semanticRequest.driverArtifact.consumer, semanticRequest.consumer, 'semantic driver consumer changed');
    assert.equal(semanticRequest.driverArtifact.driverId, DRIVER_IDS[semanticRequest.consumer], 'semantic driver ID changed');
    assert.equal(
      Number.isSafeInteger(semanticRequest.driverArtifact.bytes)
        && semanticRequest.driverArtifact.bytes >= 1
        && semanticRequest.driverArtifact.bytes <= 1_048_576,
      true,
      'semantic driver byte count invalid',
    );
    assert.match(semanticRequest.driverArtifact.sha256, /^sha256:[0-9a-f]{64}$/, 'semantic driver digest invalid');
    semanticDriverWitness = reviewedDriverArtifactWitnesses.get(semanticRequest.driverArtifact);
    assert.ok(semanticDriverWitness, 'semantic driver review witness is missing');
    assert.equal(Buffer.isBuffer(semanticDriverWitness.exactBytes), true, 'semantic driver witness has no exact bytes');
    assert.equal(semanticDriverWitness.exactBytes.length, semanticRequest.driverArtifact.bytes, 'semantic driver byte count changed');
    assert.equal(sha256(semanticDriverWitness.exactBytes), semanticRequest.driverArtifact.sha256, 'semantic driver bytes changed');
    const approved = APPROVED_INPUTS.consumers[semanticRequest.consumer];
    assert.equal(spec.snapshot.proof.commit, approved.commit, 'semantic snapshot commit changed');
    assert.equal(spec.snapshot.proof.tree, approved.tree, 'semantic snapshot tree changed');
  }

  const baseImage = containerImage(spec.image);
  const driverContext = semanticCapture
    ? Object.freeze({
        artifact: semanticRequest.driverArtifact,
        witness: Object.freeze({
          exactBytes: semanticDriverWitness.exactBytes,
          containerPath: semanticDriverWitness.containerPath,
        }),
      })
    : null;
  const inputImage = buildImmutableInputImage(spec.snapshot, spec.image, driverContext);
  const inputImageConfig = immutableInputImageConfigWitnesses.get(inputImage);
  assert.ok(inputImageConfig, 'immutable input image Config witness is missing at runtime');
  const name = `ceragon-c07-${crypto.randomBytes(16).toString('hex')}`;
  const runChallenge = semanticCapture ? crypto.randomBytes(32).toString('hex') : null;
  const containerCwd = spec.cwd === '.' ? '/workspace' : `/workspace/${spec.cwd}`;
  const containedEnvironment = [
    'HOME=/tmp/home',
    'TMPDIR=/tmp',
    'CI=true',
    'TZ=UTC',
    'LANG=C.UTF-8',
    'LC_ALL=C.UTF-8',
    'NO_COLOR=1',
    'FORCE_COLOR=0',
    'NODE_OPTIONS=',
    `NODE_PATH=${spec.image === 'backend' ? '/app/node_modules' : ''}`,
    'GOENV=off',
    'GOWORK=off',
    'GOTOOLCHAIN=local',
    'GOPROXY=off',
    'GOFLAGS=',
    'CGO_ENABLED=0',
    'GOCACHE=/tmp/go-build-cache',
    'GOMODCACHE=/tmp/go-module-cache',
    'GOPATH=/tmp/go-path',
    'CERAGON_AI_SECURITY_RUNTIME_ACTIVATABLE=false',
    'CERAGON_AI_SECURITY_V2_WRITER_ENABLED=false',
  ];
  if (semanticCapture) {
    containedEnvironment.push(
      `CERAGON_C07_RUN_CHALLENGE=${runChallenge}`,
      `CERAGON_C07_CONSUMER=${semanticRequest.consumer}`,
      `CERAGON_C07_SOURCE_COMMIT=${spec.snapshot.proof.commit}`,
      `CERAGON_C07_SOURCE_TREE=${spec.snapshot.proof.tree}`,
      `CERAGON_C07_SNAPSHOT_MANIFEST_SHA256=${spec.snapshot.proof.manifestSha256}`,
      `CERAGON_C07_INPUT_IMAGE_ID=${inputImage.id}`,
      `CERAGON_C07_DRIVER_ID=${semanticRequest.driverArtifact.driverId}`,
      `CERAGON_C07_DRIVER_BYTES=${semanticRequest.driverArtifact.bytes}`,
      `CERAGON_C07_DRIVER_SHA256=${semanticRequest.driverArtifact.sha256}`,
    );
  }
  const exactContainerEnvironment = mergeExactContainerEnvironment(
    containedEnvironment,
    inputImageConfig.Env || [],
  );
  const createArgs = [
    'container', 'create',
    '--name', name,
    '--label', 'ceragon.ai-security.c07=true',
    '--log-driver', 'none',
    '--no-healthcheck',
    '--stop-timeout', '1',
    '--init',
    '--network', 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '128',
    '--memory', '1073741824',
    '--memory-swap', '1073741824',
    '--cpus', '2.0',
    '--user', '65534:65534',
    '--tmpfs', `/tmp:${baseImage.tmpfs}`,
    '--workdir', containerCwd,
  ];
  for (const value of containedEnvironment) createArgs.push('--env', value);
  createArgs.push('--entrypoint', baseImage.entrypoint, inputImage.id, ...spec.args);
  let created;
  let containerId = null;
  let initialInspection;
  let expectedContainer;
  try {
    created = runDockerSync(createArgs, `profile command ${spec.id} container creation`);
    containerId = parseCreatedContainerId(
      created.stdout,
      `profile command ${spec.id} container ID`,
    );
    expectedContainer = deepFreeze({
      id: containerId,
      name,
      imageId: inputImage.id,
      entrypoint: baseImage.entrypoint,
      args: [...spec.args],
      cwd: containerCwd,
      labels: {
        ...(inputImageConfig.Labels || {}),
        'ceragon.ai-security.c07': 'true',
      },
      environment: exactContainerEnvironment,
      tmpfs: baseImage.tmpfs,
    });
    initialInspection = inspectContainerState(
      containerId,
      expectedContainer,
      `profile command ${spec.id} post-create full configuration proof`,
    );
    assert.ok(initialInspection, `profile command ${spec.id} disappeared after creation`);
    assert.equal(initialInspection.running, false, `profile command ${spec.id} ran before C07 start authority`);
    assert.equal(initialInspection.pid, 0, `profile command ${spec.id} has a pre-start PID`);
    assert.equal(inspectImmutableInputImage(inputImage), true);
  } catch (error) {
    let cleanupError = null;
    try {
      cleanupUnacceptedContainedProcess(
        name,
        containerId,
        `profile command ${spec.id} rejected post-create container`,
      );
    } catch (containedCleanupError) {
      cleanupError = containedCleanupError;
    }
    try {
      removeImmutableInputImage(inputImage);
    } catch (imageCleanupError) {
      cleanupError ||= imageCleanupError;
    }
    if (cleanupError) {
      throw new IntegrationGateError(
        'CONTAINMENT_CLEANUP_FAILED',
        `profile command ${spec.id} post-create validation cleanup failed`,
        {
          id: spec.id,
          causeCode: cleanupError.code,
          originalCauseCode: error.code,
        },
      );
    }
    throw error;
  }
  const identity = Object.freeze({ id: containerId, name });

  return new Promise((resolve, reject) => {
    const docker = fixedSystemTool('docker');
    verifyFixedSystemTool('docker');
    const stdoutHash = crypto.createHash('sha256');
    const stderrHash = crypto.createHash('sha256');
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failureCode = null;
    let terminationError = null;
    let settled = false;
    let child;
    let timeout;
    let terminationController;
    const semanticStdoutChunks = semanticCapture ? [] : null;
    let semanticStdoutCapturedBytes = 0;

    const wipeSemanticStdout = () => {
      if (!semanticStdoutChunks) return;
      for (const chunk of semanticStdoutChunks) chunk.fill(0);
      semanticStdoutChunks.length = 0;
      semanticStdoutCapturedBytes = 0;
    };
    const rejectAfterSemanticWipe = (error) => {
      wipeSemanticStdout();
      return reject(error);
    };
    const captureSemanticStdout = (chunk, priorByteCount) => {
      if (!semanticStdoutChunks || priorByteCount >= limits.maxStdoutBytes) return;
      const permitted = Math.min(chunk.length, limits.maxStdoutBytes - priorByteCount);
      if (permitted === 0) return;
      const captured = Buffer.from(chunk.subarray(0, permitted));
      semanticStdoutChunks.push(captured);
      semanticStdoutCapturedBytes += captured.length;
    };

    const terminate = (code) => {
      if (failureCode !== null) return;
      failureCode = code;
      terminationError = terminationController.request();
    };
    const finish = (startExitCode, startSignal, spawnError = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child?.stdout?.removeAllListeners('data');
      child?.stderr?.removeAllListeners('data');
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      terminationController?.cancel();
      let cleanup;
      let inputRemoval;
      let cleanupError = null;
      try {
        cleanup = cleanupContainedProcess(identity, expectedContainer, initialInspection);
      } catch (error) {
        cleanupError = error;
        try {
          const emergency = cleanupUnacceptedContainedProcess(
            name,
            containerId,
            `profile command ${spec.id} emergency cleanup`,
          );
          cleanup = deepFreeze({
            ...emergency,
            exitCode: null,
            emergency: true,
            configurationSha256: initialInspection.configurationSha256,
          });
        } catch (emergencyError) {
          cleanup = null;
          cleanupError = emergencyError;
        }
      }
      try {
        inputRemoval = removeImmutableInputImage(inputImage);
      } catch (error) {
        cleanupError ||= error;
      }
      try {
        verifyFixedSystemTool('docker');
      } catch (error) {
        cleanupError ||= error;
      }
      if (cleanupError || !cleanup || !inputRemoval) {
        return rejectAfterSemanticWipe(new IntegrationGateError(
          'CONTAINMENT_CLEANUP_FAILED',
          `profile command ${spec.id} containment cleanup failed`,
          {
            id: spec.id,
            causeCode: cleanupError?.code,
            causeDiagnosticSha256: sha256(Buffer.from(String(cleanupError?.message || ''), 'utf8')),
            causeInvariantId: containedCleanupInvariantId(cleanupError),
          },
        ));
      }
      const common = {
        id: spec.id,
        stdoutBytes,
        stderrBytes,
        containerRemoved: cleanup.containerRemoved,
        exactContainerIdsAbsent: cleanup.exactContainerIdsAbsent,
        exactContainerNameAbsent: cleanup.exactContainerNameAbsent,
        survivorCount: cleanup.survivorCount,
        inputImageRemoved: inputRemoval.inputImageRemoved,
        inputImageRemovalScope: inputRemoval.inputImageRemovalScope,
        buildCacheRetention: inputRemoval.buildCacheRetention,
        cacheInfluenceOnExecution: inputRemoval.cacheInfluenceOnExecution,
      };
      if (terminationError) {
        return rejectAfterSemanticWipe(new IntegrationGateError(
          'CONTAINMENT_TERMINATION_FAILED',
          `profile command ${spec.id} could not terminate its container`,
          { ...common, causeCode: terminationError.code },
        ));
      }
      if (failureCode === 'COMMAND_TIMEOUT') {
        return rejectAfterSemanticWipe(new IntegrationGateError('COMMAND_TIMEOUT', `profile command ${spec.id} exceeded its time bound`, common));
      }
      if (failureCode === 'COMMAND_OUTPUT_LIMIT') {
        return rejectAfterSemanticWipe(new IntegrationGateError('COMMAND_OUTPUT_LIMIT', `profile command ${spec.id} exceeded its output bound`, common));
      }
      if (spawnError) {
        return rejectAfterSemanticWipe(new IntegrationGateError('COMMAND_SPAWN_ERROR', `profile command ${spec.id} failed to attach`, common));
      }
      if (startSignal !== null || startExitCode !== 0 || cleanup.exitCode !== 0) {
        return rejectAfterSemanticWipe(new IntegrationGateError('COMMAND_FAILED', `profile command ${spec.id} failed`, {
          ...common,
          exitCode: cleanup.exitCode,
          signal: startSignal,
        }));
      }
      let rawSemanticStdout = null;
      if (semanticCapture) {
        if (semanticStdoutCapturedBytes !== stdoutBytes) {
          return rejectAfterSemanticWipe(new IntegrationGateError(
            'SEMANTIC_CAPTURE_FAILED',
            `profile command ${spec.id} semantic stdout capture was incomplete`,
            { id: spec.id },
          ));
        }
        try {
          rawSemanticStdout = Buffer.concat(semanticStdoutChunks, semanticStdoutCapturedBytes);
        } finally {
          wipeSemanticStdout();
        }
      }
      const result = deepFreeze({
        id: spec.id,
        status: 'PASS',
        exactContainerIdsAbsent: cleanup.exactContainerIdsAbsent,
        exactContainerNameAbsent: cleanup.exactContainerNameAbsent,
        containerConfigurationSha256: cleanup.configurationSha256,
        runner: 'DOCKER_IMMUTABLE_INPUT_IMAGE',
        baseImageId: baseImage.id,
        inputImage: inputImage.proof,
        exitCode: 0,
        stdoutBytes,
        stdoutSha256: `sha256:${stdoutHash.digest('hex')}`,
        stderrBytes,
        stderrSha256: `sha256:${stderrHash.digest('hex')}`,
        containerRemoved: cleanup.containerRemoved,
        survivorCount: cleanup.survivorCount,
        inputImageRemoved: inputRemoval.inputImageRemoved,
        inputImageRemovalScope: inputRemoval.inputImageRemovalScope,
        buildCacheRetention: inputRemoval.buildCacheRetention,
        cacheInfluenceOnExecution: inputRemoval.cacheInfluenceOnExecution,
        isolation: {
          network: 'NONE',
          rootFilesystem: 'READ_ONLY',
          hostMountCount: 0,
          inputSource: 'CONTENT_ADDRESSED_IMAGE_LAYER',
          user: '65534:65534',
          capabilities: 'NONE',
          noNewPrivileges: true,
          pidsLimit: 128,
          memoryBytes: 1_073_741_824,
          cpus: 2,
        },
      });
      successfulContainedRuns.set(result, Object.freeze({
        snapshot: spec.snapshot,
        inputImage,
        challengeSha256: semanticCapture ? sha256(Buffer.from(runChallenge, 'ascii')) : null,
        stdoutBytes,
        stderrBytes,
      }));
      if (semanticCapture) {
        try {
          semanticRunAuthority.retain(result, Object.freeze({
            snapshot: spec.snapshot,
            inputImage,
            consumer: semanticRequest.consumer,
            driverArtifact: semanticRequest.driverArtifact,
            driverWitness: semanticDriverWitness,
            runChallenge,
            rawStdout: rawSemanticStdout,
          }));
        } catch {
          rawSemanticStdout.fill(0);
          return reject(new IntegrationGateError(
            'SEMANTIC_CAPTURE_FAILED',
            `profile command ${spec.id} semantic stdout could not be retained`,
            { id: spec.id },
          ));
        }
      }
      return resolve(result);
    };

    terminationController = createBoundedTerminationController({
      killContainer() {
        runDockerSync(
          containerControlArgs('kill', containerId),
          `profile command ${spec.id} forced stop`,
          { timeoutMs: 10_000 },
        );
      },
      killAttach() {
        if (child && !child.killed) child.kill('SIGKILL');
      },
      isSettled: () => settled,
      onWatchdog: (error) => finish(null, 'SIGKILL', error),
    });

    try {
      const beforeStart = inspectContainerState(
        containerId,
        expectedContainer,
        `profile command ${spec.id} immediate pre-start full configuration proof`,
      );
      assert.ok(beforeStart, `profile command ${spec.id} disappeared before start`);
      assert.equal(
        beforeStart.securityConfigurationSha256,
        initialInspection.securityConfigurationSha256,
        `profile command ${spec.id} configuration changed before start`,
      );
      assert.equal(beforeStart.running, false, `profile command ${spec.id} started outside C07 authority`);
      assert.equal(beforeStart.pid, 0, `profile command ${spec.id} acquired a PID before start`);
      assert.equal(inspectImmutableInputImage(inputImage), true);
      child = spawn(docker.path, containerControlArgs('start', containerId), {
        env: createHermeticCommandEnvironment(trustedTemporaryBase()),
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish(null, null, error);
      return;
    }
    timeout = setTimeout(() => terminate('COMMAND_TIMEOUT'), limits.timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      const priorByteCount = stdoutBytes;
      stdoutBytes += chunk.length;
      stdoutHash.update(chunk);
      captureSemanticStdout(chunk, priorByteCount);
      if (stdoutBytes > limits.maxStdoutBytes) terminate('COMMAND_OUTPUT_LIMIT');
    });
    child.stderr.on('data', (chunk) => {
      if (settled) return;
      stderrBytes += chunk.length;
      stderrHash.update(chunk);
      if (stderrBytes > limits.maxStderrBytes) terminate('COMMAND_OUTPUT_LIMIT');
    });
    let spawnError = null;
    child.once('error', (error) => { spawnError = error; });
    child.once('close', (exitCode, signal) => finish(exitCode, signal, spawnError));
  });
}
const PRIOR_CANONICAL_C01_TEST_SCRIPTS = deepFreeze([
  'test-security-taxonomy.cjs',
  'test-vulnerability-applicability.cjs',
  'test-m3-contracts.cjs',
  'test-governance-profile.cjs',
  'test-runtime-adapter-contract.cjs',
]);

const PRIOR_CANONICAL_C01_HARNESS = String.raw`'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
let failureStage = 10;
process.on('uncaughtException', () => process.exit(failureStage));
const sourceRoot = '/workspace';
const repositoryRoot = '/tmp/c01-repository';
const packageRoot = path.join(repositoryRoot, 'packages', 'shared-contracts');
failureStage = 11;
fs.cpSync(sourceRoot, repositoryRoot, { recursive: true, errorOnExist: true, force: false });
process.chdir(packageRoot);
failureStage = 12;
const ts = require('/app/node_modules/typescript');
failureStage = 13;
assert.equal(ts.version, '5.9.3', 'reviewed TypeScript version changed');
const nodeTypesPackage = require('/app/node_modules/@types/node/package.json');
assert.equal(nodeTypesPackage.version, '20.19.43', 'reviewed Node type definitions changed');
const configPath = path.join(packageRoot, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
failureStage = 14;
assert.equal(configFile.error, undefined, 'C01 tsconfig could not be read');
failureStage = 15;
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  packageRoot,
  {
    noEmitOnError: true,
    typeRoots: ['/app/node_modules/@types'],
    types: ['node'],
  },
  configPath,
);
failureStage = 16;
assert.equal(parsed.errors.length, 0, 'C01 tsconfig produced diagnostics');
failureStage = 17;
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
failureStage = 18;
const emit = program.emit();
failureStage = 19;
const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
assert.equal(diagnostics.length, 0, 'C01 TypeScript compilation produced diagnostics');
assert.equal(emit.emitSkipped, false, 'C01 TypeScript emit was skipped');
const scripts = [
  'test-security-taxonomy.cjs',
  'test-vulnerability-applicability.cjs',
  'test-m3-contracts.cjs',
  'test-governance-profile.cjs',
  'test-runtime-adapter-contract.cjs',
];
for (const [index, script] of scripts.entries()) {
  failureStage = 20 + index;
  const absolute = path.join(packageRoot, 'scripts', script);
  assert.equal(fs.statSync(absolute).isFile(), true, 'C01 vector script is missing');
  require(absolute);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.name, '@ceragon/shared-contracts');
assert.equal(packageJson.version, '0.1.0');
assert.equal(packageJson.main, 'dist/index.js');
assert.equal(packageJson.types, 'dist/index.d.ts');
assert.equal(packageJson.devDependencies.typescript, '5.9.3');
const npmCli = '/usr/local/lib/node_modules/npm/bin/npm-cli.js';
assert.equal(fs.statSync(npmCli).isFile(), true, 'reviewed npm CLI is missing');
function runNpm(args, cwd) {
  const env = Object.assign(Object.create(null), process.env, {
    npm_config_audit: 'false',
    npm_config_cache: '/tmp/npm-cache',
    npm_config_fund: 'false',
    npm_config_ignore_scripts: 'true',
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  });
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 1048577,
    shell: false,
    timeout: 120000,
  });
  assert.equal(result.error, undefined, 'offline npm command failed to start or exceeded its bound');
  assert.equal(result.signal, null, 'offline npm command was signaled');
  assert.equal(result.status, 0, 'offline npm command failed');
  assert.equal(Buffer.byteLength(result.stdout || '', 'utf8') <= 1048576, true, 'offline npm stdout exceeded its bound');
  assert.equal(Buffer.byteLength(result.stderr || '', 'utf8') <= 1048576, true, 'offline npm stderr exceeded its bound');
  return result;
}
failureStage = 30;
const packRoot = '/tmp/c01-pack';
fs.mkdirSync(packRoot, { recursive: false });
const pack = runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', packRoot], packageRoot);
const packMetadata = JSON.parse(pack.stdout);
assert.equal(Array.isArray(packMetadata), true, 'npm pack metadata must be an array');
assert.equal(packMetadata.length, 1, 'npm pack must produce exactly one tarball');
const packed = packMetadata[0];
assert.match(packed.filename, /^[a-z0-9][a-z0-9._-]{0,255}\.tgz$/, 'npm pack filename invalid');
assert.equal(Array.isArray(packed.files), true, 'npm pack file manifest missing');
const packedPaths = packed.files.map((file) => file.path);
for (const relative of packedPaths) {
  assert.equal(typeof relative, 'string');
  assert.equal(path.posix.isAbsolute(relative), false, 'packed path is absolute');
  assert.equal(path.posix.normalize(relative), relative, 'packed path is not canonical');
  assert.equal(relative.startsWith('../'), false, 'packed path escapes the package');
}
for (const required of ['package.json', 'dist/index.js', 'dist/index.d.ts']) {
  assert.equal(packedPaths.includes(required), true, 'required packed file is missing');
}
const tarball = path.join(packRoot, packed.filename);
const tarballStat = fs.statSync(tarball);
assert.equal(tarballStat.isFile(), true, 'npm pack output is not a file');
assert.equal(tarballStat.size >= 1 && tarballStat.size <= 67108864, true, 'npm pack output size invalid');
const tarballSha256 = crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');
assert.match(tarballSha256, /^[0-9a-f]{64}$/);
failureStage = 40;
const consumerRoot = '/tmp/c01-consumer';
fs.mkdirSync(consumerRoot, { recursive: false });
fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"name":"c01-offline-consumer","version":"1.0.0","private":true}\n');
runNpm(['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--no-package-lock', tarball], consumerRoot);
const installedRoot = path.join(consumerRoot, 'node_modules', '@ceragon', 'shared-contracts');
const installedPackage = JSON.parse(fs.readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
assert.equal(installedPackage.name, '@ceragon/shared-contracts');
assert.equal(installedPackage.main, 'dist/index.js');
assert.deepStrictEqual(
  fs.readFileSync(path.join(installedRoot, 'dist', 'index.js')),
  fs.readFileSync(path.join(packageRoot, 'dist', 'index.js')),
  'installed package main bytes differ from compiled package bytes',
);
failureStage = 50;
const imported = require(installedRoot);
assert.equal(imported !== null && (typeof imported === 'object' || typeof imported === 'function'), true, 'installed package main is not importable');
process.stdout.write('C01_PROFILE_PASS\n');
`;

async function runPriorCanonicalProfile(snapshot) {
  assert.equal(repositorySnapshots.has(snapshot), true, 'C01 profile requires a C07 commit snapshot');
  assert.equal(snapshot.verify(), true, 'C01 commit snapshot changed before profile execution');
  assert.equal(snapshot.proof.commit, APPROVED_INPUTS.priorCanonical.commit, 'C01 source commit mismatch');
  assert.equal(snapshot.proof.tree, APPROVED_INPUTS.priorCanonical.tree, 'C01 source tree mismatch');
  assert.equal(snapshot.proof.totalBytes <= 268_435_456, true, 'C01 source is too large for the fixed tmpfs profile');
  const command = await runContainedProcess(
    {
      id: 'prior-canonical.c01-contract-package',
      image: 'backend',
      snapshot,
      cwd: '.',
      args: ['-e', PRIOR_CANONICAL_C01_HARNESS],
    },
    {
      timeoutMs: 300_000,
      maxStdoutBytes: 1_048_576,
      maxStderrBytes: 1_048_576,
    },
  );
  assert.equal(snapshot.verify(), true, 'C01 commit snapshot changed after profile execution');
  return deepFreeze({
    profile: 'PRIOR_CANONICAL_C01_V1',
    sourceCommit: snapshot.proof.commit,
    sourceTree: snapshot.proof.tree,
    typescriptVersion: '5.9.3',
    nodeTypesVersion: '20.19.43',
    compilerEnvironment: 'REVIEWED_C03_IMAGE_EXPLICIT_NODE_TYPES',
    verifiedScripts: [...PRIOR_CANONICAL_C01_TEST_SCRIPTS],
    packageProof: 'PACK_LOCAL_TARBALL_INSTALL_OFFLINE_REQUIRE',
    harnessSha256: sha256(Buffer.from(PRIOR_CANONICAL_C01_HARNESS, 'utf8')),
    command,
  });
}
const PIN_PROFILES = deepFreeze({
  backend: {
    profile: 'BACKEND_C03_V1',
    repository: 'Backend',
    format: 'ceragon.ai-security.backend-consumer-pin',
    consumer: 'Backend',
    base: 'packages/shared-contracts',
    projectionName: 'ceragon-ai-security-backend-projection',
    keys: [
      'format', 'formatVersion', 'consumer', 'sourceCommit', 'sourcePackage',
      'policySchemaVersion', 'canonicalGenerator', 'projectionGenerator', 'artifact',
      'releaseManifest', 'digestSidecar', 'generatedProjection', 'committedDist',
      'requiredIntegrationGate', 'runtimeActivatable', 'v2WriterEnabled',
    ],
  },
  installer: {
    profile: 'INSTALLER_C04_V1',
    repository: 'Installers',
    format: 'ceragon.ai-security.installer-consumer-pin',
    consumer: 'Installers',
    base: 'internal/aipolicycontract',
    projectionName: null,
    keys: [
      'format', 'formatVersion', 'consumer', 'sourceCommit', 'sourcePackage',
      'policySchemaVersion', 'canonicalGenerator', 'artifact', 'releaseManifest',
      'digestSidecar', 'requiredIntegrationGate', 'runtimeActivatable', 'v2WriterEnabled',
    ],
  },
  browser: {
    profile: 'BROWSER_C05_V1',
    repository: 'Installers/browser-extension',
    format: 'ceragon.ai-security.browser-consumer-pin',
    consumer: 'Installers/browser-extension',
    base: 'browser-extension',
    projectionName: 'ceragon-ai-security-browser-projection',
    keys: [
      'format', 'formatVersion', 'consumer', 'sourceCommit', 'sourcePackage',
      'policySchemaVersion', 'canonicalGenerator', 'projectionGenerator', 'artifact',
      'releaseManifest', 'digestSidecar', 'generatedMetadata', 'generatedValidators',
      'requiredIntegrationGate', 'runtimeActivatable', 'v2WriterEnabled',
    ],
  },
  frontend: {
    profile: 'FRONTEND_C06_V1',
    repository: 'Frontend',
    format: 'ceragon.ai-security.frontend-consumer-pin',
    consumer: 'Frontend',
    base: '',
    projectionName: 'ceragon-ai-security-frontend-projection',
    keys: [
      'format', 'formatVersion', 'consumer', 'sourceCommit', 'sourcePackage',
      'policySchemaVersion', 'canonicalGenerator', 'projectionGenerator', 'artifact',
      'releaseManifest', 'digestSidecar', 'generatedProjection',
      'requiredIntegrationGate', 'runtimeActivatable', 'v2WriterEnabled',
    ],
  },
});

function prefixDescriptor(base, descriptor) {
  validateDescriptor(descriptor, 'consumer file');
  return {
    path: base ? path.posix.join(base, descriptor.path) : descriptor.path,
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
  };
}

function assertCanonicalDescriptor(descriptor, canonicalKey, label) {
  assertExactKeys(
    descriptor,
    canonicalKey === 'artifact' ? ['directory', 'path', 'bytes', 'sha256'] : ['path', 'bytes', 'sha256'],
    label,
  );
  validateDescriptor(descriptor, label);
  const expected = CANONICAL_FILES[canonicalKey];
  assert.equal(descriptor.bytes, expected.bytes, `${label} byte count differs from C02`);
  assert.equal(descriptor.sha256, expected.sha256, `${label} digest differs from C02`);
}

function collectProjectionDescriptors(pin, profile) {
  if (profile.projectionName === null) return [];
  assertRecord(pin.projectionGenerator, 'projection generator');
  assert.equal(pin.projectionGenerator.name, profile.projectionName, 'projection generator name mismatch');
  assert.equal(typeof pin.projectionGenerator.version, 'string', 'projection generator version missing');
  assert.equal(
    pin.projectionGenerator.version.length >= 1 && pin.projectionGenerator.version.length <= 32,
    true,
    'projection generator version length invalid',
  );

  const descriptors = [];
  const add = (role, descriptor) => {
    validateFileDescriptorShape(descriptor, role);
    descriptors.push([role, descriptor]);
  };
  if (profile.profile === 'BROWSER_C05_V1') {
    assertExactKeys(pin.projectionGenerator, ['name', 'version', 'sources'], 'projection generator');
    assert.equal(Array.isArray(pin.projectionGenerator.sources), true, 'browser projection sources missing');
    assert.equal(pin.projectionGenerator.sources.length, 2, 'browser projection must bind two sources');
    pin.projectionGenerator.sources.forEach((descriptor, index) => {
      descriptors.push([`projectionSource${index}`, descriptor]);
    });
    add('generatedMetadata', pin.generatedMetadata);
    add('generatedValidators', pin.generatedValidators);
  } else {
    assertExactKeys(pin.projectionGenerator, ['name', 'version', 'source'], 'projection generator');
    add('projectionSource', pin.projectionGenerator.source);
    add('generatedProjection', pin.generatedProjection);
    if (profile.profile === 'BACKEND_C03_V1') {
      assert.equal(Array.isArray(pin.committedDist), true, 'Backend committedDist must be an array');
      assert.equal(pin.committedDist.length, 8, 'Backend committedDist must bind eight files');
      pin.committedDist.forEach((descriptor, index) => descriptors.push([`committedDist${index}`, descriptor]));
    }
  }
  return descriptors;
}

function verifyPinnedConsumer(root, manifestEntry, consumerKey) {
  const profile = PIN_PROFILES[consumerKey];
  assert.ok(profile, `unknown consumer key ${consumerKey}`);
  assert.equal(manifestEntry.repository, profile.repository, `${consumerKey} repository mismatch`);
  assert.equal(manifestEntry.profile, profile.profile, `${consumerKey} profile mismatch`);
  validateFileDescriptorShape(manifestEntry.pin, `${consumerKey} pin descriptor`);

  const snapshotter = createProtectedSnapshotter(root);
  const pinSnapshot = snapshotter.snapshot(manifestEntry.pin, `${consumerKey} consumer pin`);
  const pin = parseStrictJsonBytes(pinSnapshot.bytes, {
    maxBytes: 65_536,
    maxDepth: 16,
    maxNodes: 4_096,
  });
  assertExactKeys(pin, profile.keys, `${consumerKey} consumer pin`);
  assert.equal(pin.format, profile.format, `${consumerKey} pin format mismatch`);
  assert.equal(pin.formatVersion, 1, `${consumerKey} pin format version mismatch`);
  assert.equal(pin.consumer, profile.consumer, `${consumerKey} pin consumer mismatch`);
  assert.equal(pin.sourceCommit, APPROVED_INPUTS.canonical.commit, `${consumerKey} source commit mismatch`);
  assert.deepStrictEqual(pin.sourcePackage, { name: '@ceragon/shared-contracts', version: '0.3.0' });
  assert.equal(pin.policySchemaVersion, 1, `${consumerKey} policy schema version mismatch`);
  assert.deepStrictEqual(pin.canonicalGenerator, {
    name: 'ceragon-ai-security-artifact',
    version: '1.2.0',
  });
  assert.equal(pin.requiredIntegrationGate, 'P0-C07', `${consumerKey} integration gate mismatch`);
  assert.equal(pin.runtimeActivatable, false, `${consumerKey} runtimeActivatable must remain false`);
  assert.equal(pin.v2WriterEnabled, false, `${consumerKey} v2WriterEnabled must remain false`);

  assertCanonicalDescriptor(pin.artifact, 'artifact', `${consumerKey} artifact`);
  assert.equal(typeof pin.artifact.directory, 'string', `${consumerKey} artifact directory missing`);
  assert.equal(path.posix.dirname(pin.artifact.path), pin.artifact.directory, `${consumerKey} artifact directory mismatch`);
  assertCanonicalDescriptor(pin.releaseManifest, 'releaseManifest', `${consumerKey} release manifest`);
  assertCanonicalDescriptor(pin.digestSidecar, 'digestSidecar', `${consumerKey} digest sidecar`);

  const snapshots = [];
  const capture = (role, descriptor) => {
    const prefixed = prefixDescriptor(profile.base, descriptor);
    const value = snapshotter.snapshot(prefixed, `${consumerKey} ${role}`);
    snapshots.push({ role, path: prefixed.path, bytes: value.bytes.length, sha256: value.sha256 });
    return value.bytes;
  };
  const artifactBytes = capture('artifact', pin.artifact);
  const releaseBytes = capture('releaseManifest', pin.releaseManifest);
  const sidecarBytes = capture('digestSidecar', pin.digestSidecar);
  for (const [role, descriptor] of collectProjectionDescriptors(pin, profile)) capture(role, descriptor);

  assert.equal(sidecarBytes.toString('utf8'), `${CANONICAL_FILES.artifact.sha256}\n`, `${consumerKey} sidecar mismatch`);
  const artifact = parseStrictJsonBytes(artifactBytes);
  const release = parseStrictJsonBytes(releaseBytes);
  assert.equal(artifact.runtimeActivatable, false, `${consumerKey} artifact runtime activation changed`);
  assert.equal(artifact.signedRuntimePolicyBundle, false, `${consumerKey} artifact signed-bundle claim changed`);
  assert.deepStrictEqual(artifact.protocol?.readableVersions, ['1', '2']);
  assert.deepStrictEqual(artifact.protocol?.writableVersions, ['1']);
  assert.equal(artifact.protocol?.v2WriterEnabled, false);
  assert.equal(release.artifactDigest, CANONICAL_FILES.artifact.sha256);
  assert.equal(release.artifactBytes, CANONICAL_FILES.artifact.bytes);
  assert.equal(release.runtimeActivatable, false);
  assert.equal(release.signedRuntimePolicyBundle, false);
  assert.equal(release.v2WriterEligible, false);
  assert.equal(release.requiredIntegrationGate, 'P0-C07');

  return Object.freeze({
    consumer: consumerKey,
    sourceCommit: pin.sourceCommit,
    profile: profile.profile,
    pin: Object.freeze({
      path: manifestEntry.pin.path,
      bytes: pinSnapshot.bytes.length,
      sha256: pinSnapshot.sha256,
    }),
    verifiedFileCount: 1 + snapshots.length,
    files: Object.freeze(snapshots.map((entry) => Object.freeze(entry))),
    artifactBytes,
    releaseBytes,
    sidecarBytes,
  });
}
const PROFILE_REQUIRED_COMMAND_IDS = deepFreeze({
  backend: [
    'backend.consumer-check',
    'backend.consumer-vectors',
    'backend.reader-rank-vectors',
  ],
  installer: [
    'installer.runtime-vectors',
    'installer.tooling-vectors',
    'installer.tooling-check',
  ],
  browser: [
    'browser.consumer-check',
    'browser.reader-vectors',
  ],
  frontend: [
    'frontend.consumer-check',
    'frontend.consumer-vectors',
    'frontend.unknown-neutral-vectors',
  ],
});

const FIXED_PROFILES = deepFreeze({
  backend: {
    profile: 'BACKEND_C03_V1',
    requiredCommandIds: PROFILE_REQUIRED_COMMAND_IDS.backend,
    commands: [
      {
        id: 'backend.consumer-check',
        tool: 'NODE',
        cwd: '.',
        entry: 'packages/shared-contracts/scripts/check-ai-security-backend-consumer.cjs',
        args: ['packages/shared-contracts/scripts/check-ai-security-backend-consumer.cjs'],
        timeoutMs: 180_000,
      },
      {
        id: 'backend.consumer-vectors',
        tool: 'NODE',
        cwd: '.',
        entry: 'packages/shared-contracts/scripts/test-ai-security-backend-consumer.cjs',
        args: ['packages/shared-contracts/scripts/test-ai-security-backend-consumer.cjs'],
        timeoutMs: 180_000,
      },
      {
        id: 'backend.reader-rank-vectors',
        tool: 'NODE',
        cwd: '.',
        entry: 'node_modules/jest/bin/jest.js',
        args: [
          'node_modules/jest/bin/jest.js',
          '--runInBand',
          '--runTestsByPath',
          'src/ai-security-policy/ai-security-portable-reader.spec.ts',
          'src/ai-security-policy/resolve-strictest-policy.spec.ts',
        ],
        timeoutMs: 300_000,
      },
    ],
  },
  installer: {
    profile: 'INSTALLER_C04_V1',
    requiredCommandIds: PROFILE_REQUIRED_COMMAND_IDS.installer,
    commands: [
      {
        id: 'installer.runtime-vectors',
        tool: 'GO',
        cwd: '.',
        entry: null,
        args: ['test', './internal/aipolicycontract'],
        timeoutMs: 180_000,
      },
      {
        id: 'installer.tooling-vectors',
        tool: 'GO',
        cwd: 'internal/aipolicycontract/tooling',
        entry: null,
        args: ['test', './...'],
        timeoutMs: 240_000,
      },
      {
        id: 'installer.tooling-check',
        tool: 'GO',
        cwd: 'internal/aipolicycontract/tooling',
        entry: null,
        args: ['run', './cmd/aipolicycontractcheck'],
        timeoutMs: 180_000,
      },
    ],
  },
  browser: {
    profile: 'BROWSER_C05_V1',
    requiredCommandIds: PROFILE_REQUIRED_COMMAND_IDS.browser,
    commands: [
      {
        id: 'browser.consumer-check',
        tool: 'NODE',
        cwd: 'browser-extension',
        entry: 'scripts/check-ai-security-browser-consumer.cjs',
        args: ['scripts/check-ai-security-browser-consumer.cjs'],
        timeoutMs: 180_000,
      },
      {
        id: 'browser.reader-vectors',
        tool: 'NODE',
        cwd: 'browser-extension',
        entry: 'test/ai-security-browser-consumer.test.mjs',
        args: ['--test', 'test/ai-security-browser-consumer.test.mjs'],
        timeoutMs: 300_000,
      },
    ],
  },
  frontend: {
    profile: 'FRONTEND_C06_V1',
    requiredCommandIds: PROFILE_REQUIRED_COMMAND_IDS.frontend,
    commands: [
      {
        id: 'frontend.consumer-check',
        tool: 'NODE',
        cwd: '.',
        entry: 'scripts/check-ai-security-frontend-consumer.cjs',
        args: ['scripts/check-ai-security-frontend-consumer.cjs'],
        timeoutMs: 180_000,
      },
      {
        id: 'frontend.consumer-vectors',
        tool: 'NODE',
        cwd: '.',
        entry: 'scripts/test-ai-security-frontend-consumer.cjs',
        args: ['scripts/test-ai-security-frontend-consumer.cjs'],
        timeoutMs: 180_000,
      },
      {
        id: 'frontend.unknown-neutral-vectors',
        tool: 'NODE',
        cwd: '.',
        entry: 'node_modules/jest/bin/jest.js',
        args: [
          'node_modules/jest/bin/jest.js',
          '--runInBand',
          '--runTestsByPath',
          'types/__tests__/ai-security-portable-contract.test.ts',
          'lib/__tests__/ai-security-display.test.ts',
          'components/admin/__tests__/ai-security-policy-section.contract.test.tsx',
        ],
        timeoutMs: 300_000,
      },
    ],
  },
});

function assertCommandCoverage(requiredIds, results, label) {
  assert.equal(Array.isArray(requiredIds), true, `${label} required command IDs must be an array`);
  assert.equal(Array.isArray(results), true, `${label} command results must be an array`);
  const actualIds = results.map((result) => result.id);
  const unique = new Set(actualIds);
  assert.equal(unique.size, actualIds.length, `${label} repeated a command result`);
  assert.deepStrictEqual(
    actualIds,
    [...requiredIds],
    `${label} has a missing or skipped required command`,
  );
}

function assertCommandEntry(root, cwd, command) {
  if (command.entry === null) return;
  const absolute = path.resolve(cwd, ...command.entry.split('/'));
  assert.equal(isWithin(root, absolute), true, `${command.id} entry escapes repository root`);
  let stat;
  try {
    stat = fs.lstatSync(absolute, { bigint: true });
  } catch {
    throw new IntegrationGateError(
      'COMMAND_MISSING',
      `profile command ${command.id} failed because its fixed entry is missing`,
      { id: command.id },
    );
  }
  assert.equal(stat.isSymbolicLink(), false, `${command.id} entry must not be a link/reparse point`);
  assert.equal(stat.isFile(), true, `${command.id} entry must be a regular file`);
  assert.equal(stat.nlink, 1n, `${command.id} entry must not be hard-linked`);
  assert.equal(samePath(realpath(absolute), absolute), true, `${command.id} entry path is indirect`);
}

const CONTAINED_SEMANTIC_PROFILES = deepFreeze({
  backend: {
    id: 'backend.semantic-compatibility',
    image: 'backend',
    cwd: '.',
    args: [
      '/c07/backend-semantic-driver.cjs',
      '/workspace/packages/shared-contracts/generated/ai-security/0.3.0/portable-contract.v1.jcs.json',
      '/workspace/src/ai-security-policy/ai-security-portable-reader.ts',
      '/app/dist/ai-security-policy/resolve-strictest-policy.js',
      '/workspace/packages/shared-contracts/dist/generated/ai-security-portable.generated.js',
    ],
  },
  installer: {
    id: 'installer.semantic-compatibility',
    image: 'go',
    cwd: '.',
    args: [
      'run',
      '/workspace/cmd/c07semanticdriver/main.go',
      '/workspace/internal/aipolicycontract/embedded/0.3.0/portable-contract.v1.jcs.json',
      '/workspace/cmd/c07semanticdriver/main.go',
    ],
  },
  browser: {
    id: 'browser.semantic-compatibility',
    image: 'node',
    cwd: '.',
    args: [
      '/c07/browser-semantic-driver.mjs',
      '/workspace/browser-extension/generated/ai-security/0.3.0/portable-contract.v1.jcs.json',
      '/workspace/browser-extension/src/ai-security-policy-v1-reader.js',
      '/workspace/browser-extension/src/generated/ai-security-portable.generated.js',
    ],
  },
  frontend: {
    id: 'frontend.semantic-compatibility',
    image: 'frontend',
    cwd: '.',
    args: ['/c07/frontend-semantic-driver.test.cjs'],
  },
});

function semanticProfileSpec(consumerKey, snapshot) {
  const profile = FIXED_PROFILES[consumerKey];
  assert.ok(profile, `unknown fixed consumer profile ${consumerKey}`);
  assert.equal(
    repositorySnapshots.has(snapshot),
    true,
    `${profile.profile} requires an immutable repository commit snapshot`,
  );
  assert.equal(snapshot.verify(), true, `${profile.profile} snapshot changed before execution`);
  const reviewed = CONTAINED_SEMANTIC_PROFILES[consumerKey];
  assert.ok(reviewed, `${profile.profile} has no contained semantic profile`);
  return Object.freeze({
    id: reviewed.id,
    image: reviewed.image,
    snapshot,
    cwd: reviewed.cwd,
    args: reviewed.args,
  });
}

async function runFixedProfile(consumerKey, snapshot, context) {
  assertExactKeys(context, ['rollback', 'artifactBytes'], 'contained semantic profile context');
  assert.equal(Buffer.isBuffer(context.artifactBytes), true, 'canonical artifact must be exact bytes');
  const driverArtifact = issueReviewedSemanticDriver(consumerKey);
  const execution = await runContainedProcess(
    semanticProfileSpec(consumerKey, snapshot),
    {
      timeoutMs: 300_000,
      maxStdoutBytes: MAX_CONTAINED_SEMANTIC_ENVELOPE_BYTES,
      maxStderrBytes: 1,
    },
    {
      authority: SEMANTIC_CAPTURE_AUTHORITY,
      consumer: consumerKey,
      driverArtifact,
    },
  );
  return consumeContainedSemanticRun({
    execution,
    rollback: context.rollback,
    artifactBytes: context.artifactBytes,
  });
}
const reviewedDriverBindings = new WeakMap();
const containedSemanticReceipts = new WeakMap();
const containedProfileProofs = new WeakSet();
const containedProfileProofWitnesses = new WeakMap();
const consumedContainedRuns = new WeakSet();

const MAX_CONTAINED_SEMANTIC_ENVELOPE_BYTES = 270_336;
const EMPTY_OUTPUT_SHA256 = sha256(Buffer.alloc(0));

function semanticEnvelopeStage(invariantId, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof IntegrationGateError && error.code === 'SEMANTIC_ENVELOPE_REJECTED') {
      throw error;
    }
    throw new IntegrationGateError(
      'SEMANTIC_ENVELOPE_REJECTED',
      'contained semantic envelope rejected by reviewed C07 transport authority',
      {
        invariantId,
        diagnosticSha256: sha256(Buffer.from(String(error?.message || ''), 'utf8')),
      },
    );
  }
}

function validateContainedSemanticEnvelopeBytes(input) {
  const transport = semanticEnvelopeStage('EXACT_CANONICAL_STDOUT_TRANSPORT', () => {
    assertExactKeys(
      input,
      ['execution', 'semanticRun', 'executionWitness', 'artifactBytes'],
      'contained semantic envelope inputs',
    );
    const { execution, semanticRun, executionWitness, artifactBytes } = input;
    assertRecord(execution, 'contained semantic execution');
    assertRecord(semanticRun, 'contained semantic run witness');
    assertRecord(executionWitness, 'contained execution witness');
    assert.equal(Buffer.isBuffer(artifactBytes), true, 'portable artifact must be exact bytes');
    const rawStdout = semanticRun.rawStdout;
    assert.equal(Buffer.isBuffer(rawStdout), true, 'semantic stdout must be exact bytes');
    assert.equal(
      rawStdout.length >= 2 && rawStdout.length <= MAX_CONTAINED_SEMANTIC_ENVELOPE_BYTES,
      true,
      'semantic stdout byte bound changed',
    );
    assert.equal(execution.stdoutBytes, rawStdout.length, 'semantic stdout byte count changed');
    assert.equal(execution.stdoutSha256, sha256(rawStdout), 'semantic stdout digest changed');
    assert.equal(execution.stderrBytes, 0, 'semantic driver wrote stderr');
    assert.equal(execution.stderrSha256, EMPTY_OUTPUT_SHA256, 'semantic stderr digest changed');
    assert.equal(rawStdout.at(-1), 0x0a, 'semantic envelope terminal newline missing');
    const envelope = parseStrictJsonBytes(rawStdout, {
      maxBytes: MAX_CONTAINED_SEMANTIC_ENVELOPE_BYTES,
      maxDepth: 40,
      maxNodes: 20_000,
    });
    const canonicalBytes = Buffer.from(`${stableJson(envelope)}\n`, 'utf8');
    assert.equal(canonicalBytes.length, rawStdout.length, 'semantic envelope is not canonical');
    assert.equal(
      crypto.timingSafeEqual(canonicalBytes, rawStdout),
      true,
      'semantic envelope is not one canonical JSON record',
    );
    assertExactKeys(
      envelope,
      [
        'format', 'formatVersion', 'runChallenge', 'consumer', 'sourceCommit', 'sourceTree',
        'snapshotManifestSha256', 'inputImageId', 'driverId', 'driverBytes',
        'driverSha256', 'semanticReceipt',
      ],
      'contained semantic envelope',
    );
    assert.equal(envelope.format, 'ceragon.ai-security.contained-semantic-envelope');
    assert.equal(envelope.formatVersion, 1);
    assert.match(envelope.runChallenge, /^[0-9a-f]{64}$/, 'semantic challenge invalid');
    assert.equal(Object.hasOwn(APPROVED_INPUTS.consumers, envelope.consumer), true, 'semantic consumer invalid');
    assert.match(envelope.sourceCommit, /^[0-9a-f]{40}$/, 'semantic source commit invalid');
    assert.match(envelope.sourceTree, /^[0-9a-f]{40}$/, 'semantic source tree invalid');
    assert.match(envelope.snapshotManifestSha256, /^sha256:[0-9a-f]{64}$/, 'semantic snapshot manifest invalid');
    assert.match(envelope.inputImageId, /^sha256:[0-9a-f]{64}$/, 'semantic input image invalid');
    assert.equal(
      Number.isSafeInteger(envelope.driverBytes)
        && envelope.driverBytes >= 1
        && envelope.driverBytes <= 1_048_576,
      true,
      'semantic driver byte count invalid',
    );
    assert.match(envelope.driverSha256, /^sha256:[0-9a-f]{64}$/, 'semantic driver digest invalid');
    assertRecord(envelope.semanticReceipt, 'nested semantic receipt');
    return { execution, semanticRun, executionWitness, artifactBytes, envelope };
  });

  semanticEnvelopeStage('RUN_NONCE_SOURCE_IMAGE_BINDING', () => {
    const { execution, semanticRun, executionWitness, envelope } = transport;
    assert.equal(semanticRun.snapshot, executionWitness.snapshot, 'semantic snapshot witness identity changed');
    assert.equal(semanticRun.inputImage, executionWitness.inputImage, 'semantic image witness identity changed');
    assert.equal(executionWitness.stdoutBytes, execution.stdoutBytes, 'semantic execution stdout count witness changed');
    assert.equal(executionWitness.stderrBytes, execution.stderrBytes, 'semantic execution stderr count witness changed');
    assert.equal(
      executionWitness.challengeSha256,
      sha256(Buffer.from(semanticRun.runChallenge, 'ascii')),
      'semantic challenge witness changed',
    );
    assert.equal(envelope.runChallenge, semanticRun.runChallenge, 'semantic challenge echo changed');
    assert.equal(envelope.consumer, semanticRun.consumer, 'semantic consumer binding changed');
    assert.equal(envelope.sourceCommit, semanticRun.snapshot.proof.commit, 'semantic source commit changed');
    assert.equal(envelope.sourceTree, semanticRun.snapshot.proof.tree, 'semantic source tree changed');
    assert.equal(
      envelope.snapshotManifestSha256,
      semanticRun.snapshot.proof.manifestSha256,
      'semantic snapshot manifest changed',
    );
    assert.equal(envelope.inputImageId, semanticRun.inputImage.id, 'semantic input image binding changed');
  });

  const driverBinding = semanticEnvelopeStage('EXACT_REVIEWED_DRIVER_BINDING', () => {
    const { semanticRun, envelope } = transport;
    const { driverArtifact, driverWitness } = semanticRun;
    assertExactKeys(
      driverArtifact,
      ['consumer', 'driverId', 'bytes', 'sha256'],
      'semantic driver artifact',
    );
    assert.equal(driverArtifact.consumer, semanticRun.consumer, 'semantic driver consumer changed');
    assert.equal(driverArtifact.driverId, DRIVER_IDS[semanticRun.consumer], 'semantic driver ID changed');
    assert.equal(Buffer.isBuffer(driverWitness.exactBytes), true, 'semantic driver exact bytes missing');
    assert.equal(driverWitness.exactBytes.length, driverArtifact.bytes, 'semantic driver byte count changed');
    assert.equal(sha256(driverWitness.exactBytes), driverArtifact.sha256, 'semantic driver digest changed');
    assert.equal(envelope.driverId, driverArtifact.driverId, 'semantic envelope driver ID changed');
    assert.equal(envelope.driverBytes, driverArtifact.bytes, 'semantic envelope driver byte count changed');
    assert.equal(envelope.driverSha256, driverArtifact.sha256, 'semantic envelope driver digest changed');
    return deepFreeze({
      driverId: driverArtifact.driverId,
      driverBytes: driverArtifact.bytes,
      driverSha256: driverArtifact.sha256,
    });
  });

  const semanticReceipt = semanticEnvelopeStage('INNER_EXACT_SEMANTIC_ORACLE', () => {
    const { semanticRun, artifactBytes, envelope } = transport;
    const receiptBytes = Buffer.from(`${stableSemanticJson(envelope.semanticReceipt)}\n`, 'utf8');
    try {
      return validateSemanticReceiptBytes({
        consumer: semanticRun.consumer,
        receiptBytes,
        artifactBytes,
        driverDescriptor: {
          id: driverBinding.driverId,
          bytes: driverBinding.driverBytes,
          sha256: driverBinding.driverSha256,
        },
        driverBytes: semanticRun.driverWitness.exactBytes,
      });
    } finally {
      receiptBytes.fill(0);
    }
  });

  return Object.freeze({
    consumer: transport.semanticRun.consumer,
    semanticReceipt,
    driverBinding,
  });
}

function consumeContainedSemanticRun(input) {
  assertExactKeys(input, ['execution', 'rollback', 'artifactBytes'], 'semantic run consumption');
  const { execution, rollback, artifactBytes } = input;
  const validated = semanticRunAuthority.consume(execution, (semanticRun) => {
    const executionWitness = containedExecutionWitness(execution, semanticRun.consumer);
    assert.equal(semanticRun.snapshot, executionWitness.snapshot, 'semantic snapshot provenance changed');
    assert.equal(semanticRun.inputImage, executionWitness.inputImage, 'semantic image provenance changed');
    assert.equal(reviewedDriverArtifacts.has(semanticRun.driverArtifact), true, 'semantic driver provenance missing');
    assert.equal(
      reviewedDriverArtifactWitnesses.get(semanticRun.driverArtifact),
      semanticRun.driverWitness,
      'semantic driver witness identity changed',
    );
    return validateContainedSemanticEnvelopeBytes({
      execution,
      semanticRun,
      executionWitness,
      artifactBytes,
    });
  });
  reviewedDriverBindings.set(validated.driverBinding, execution);
  containedSemanticReceipts.set(
    validated.semanticReceipt,
    Object.freeze({ execution, driverBinding: validated.driverBinding }),
  );
  return mintContainedProfileProof({
    consumer: validated.consumer,
    execution,
    rollback,
    driverBinding: validated.driverBinding,
    semanticReceipt: validated.semanticReceipt,
  });
}

function containedExecutionWitness(execution, consumer) {
  const witness = successfulContainedRuns.get(execution);
  assert.ok(witness, `${consumer} execution has no successful contained-run provenance`);
  assert.equal(repositorySnapshots.has(witness.snapshot), true, `${consumer} snapshot has no repository provenance`);
  assert.equal(immutableInputImages.has(witness.inputImage), true, `${consumer} image has no immutable-image provenance`);
  assert.equal(witness.snapshot.verify(), true, `${consumer} snapshot changed before authority issuance`);
  assert.equal(witness.inputImage.removed(), true, `${consumer} immutable image cleanup was not witnessed`);
  const approved = APPROVED_INPUTS.consumers[consumer];
  assert.ok(approved, `${consumer} has no accepted input identity`);
  assert.equal(witness.snapshot.proof.commit, approved.commit, `${consumer} snapshot commit changed`);
  assert.equal(witness.snapshot.proof.tree, approved.tree, `${consumer} snapshot tree changed`);
  assert.equal(execution.status, 'PASS', `${consumer} contained execution did not pass`);
  assert.equal(execution.exitCode, 0, `${consumer} contained execution exit changed`);
  assert.equal(execution.runner, 'DOCKER_IMMUTABLE_INPUT_IMAGE', `${consumer} runner changed`);
  assert.equal(execution.containerRemoved, true, `${consumer} container cleanup was not witnessed`);
  assert.equal(execution.exactContainerIdsAbsent, true, `${consumer} exact container ID survived cleanup`);
  assert.equal(execution.exactContainerNameAbsent, true, `${consumer} exact container name survived cleanup`);
  assert.equal(execution.survivorCount, 0, `${consumer} container survivor count is nonzero`);
  assert.equal(execution.inputImageRemoved, true, `${consumer} input image cleanup was not witnessed`);
  assert.equal(
    execution.inputImageRemovalScope,
    'ENGINE_IMAGE_IDS_TEMPORARY_TAG_AND_BUILD_RUN_LABEL',
    `${consumer} image cleanup scope changed`,
  );
  assert.deepStrictEqual(execution.inputImage, witness.inputImage.proof, `${consumer} input image proof changed`);
  assert.equal(execution.inputImage.snapshotCommit, approved.commit, `${consumer} image commit changed`);
  assert.equal(execution.inputImage.snapshotTree, approved.tree, `${consumer} image tree changed`);
  assert.equal(execution.inputImage.inputImageId, witness.inputImage.id, `${consumer} image ID changed`);
  assert.deepStrictEqual(execution.isolation, {
    network: 'NONE',
    rootFilesystem: 'READ_ONLY',
    hostMountCount: 0,
    inputSource: 'CONTENT_ADDRESSED_IMAGE_LAYER',
    user: '65534:65534',
    capabilities: 'NONE',
    noNewPrivileges: true,
    pidsLimit: 128,
    memoryBytes: 1_073_741_824,
    cpus: 2,
  });
  return witness;
}

function mintContainedProfileProof(input) {
  assertExactKeys(
    input,
    ['consumer', 'execution', 'rollback', 'driverBinding', 'semanticReceipt'],
    'contained profile proof inputs',
  );
  const { consumer, execution, rollback, driverBinding, semanticReceipt } = input;
  assert.equal(Object.hasOwn(APPROVED_INPUTS.consumers, consumer), true, 'contained profile consumer invalid');
  const witness = containedExecutionWitness(execution, consumer);
  assert.equal(consumedContainedRuns.has(execution), false, `${consumer} contained run was already consumed`);
  consumedContainedRuns.add(execution);
  assert.equal(witnessedRollbackReceipts.has(rollback), true, `${consumer} rollback has no witness provenance`);
  assert.equal(rollback.sourceCommit, APPROVED_INPUTS.priorCanonical.commit, `${consumer} rollback commit changed`);
  assert.equal(rollback.sourceTree, APPROVED_INPUTS.priorCanonical.tree, `${consumer} rollback tree changed`);
  assert.equal(rollback.canonicalArtifactAbsent, true, `${consumer} rollback artifact absence changed`);
  assert.equal(rollback.priorSourceMounted, false, `${consumer} prior source was mounted`);
  assert.equal(reviewedDriverBindings.get(driverBinding), execution, `${consumer} driver has no reviewed run binding`);
  const semanticBinding = containedSemanticReceipts.get(semanticReceipt);
  assert.ok(semanticBinding, `${consumer} semantic receipt has no contained-run binding`);
  assert.equal(semanticBinding.execution, execution, `${consumer} semantic receipt was replayed from another run`);
  assert.equal(semanticBinding.driverBinding, driverBinding, `${consumer} semantic receipt driver binding changed`);
  assert.equal(semanticReceipt.consumerId, consumer.toUpperCase(), `${consumer} semantic identity changed`);

  const semanticProofs = SEMANTIC_COMPATIBILITY_REQUIREMENTS
    .filter(({ consumers }) => consumers.includes(consumer))
    .map(({ id }) => semanticProofFor(semanticReceipt, id));
  const semanticProofSetSha256 = sha256(Buffer.from(`${stableJson(semanticProofs)}\n`, 'utf8'));
  const isolationSha256 = sha256(Buffer.from(`${stableJson(execution.isolation)}\n`, 'utf8'));
  const cleanupSha256 = sha256(Buffer.from(`${stableJson({
    containerRemoved: execution.containerRemoved,
    exactContainerIdsAbsent: execution.exactContainerIdsAbsent,
    exactContainerNameAbsent: execution.exactContainerNameAbsent,
    survivorCount: execution.survivorCount,
    inputImageRemoved: execution.inputImageRemoved,
    inputImageRemovalScope: execution.inputImageRemovalScope,
  })}\n`, 'utf8'));
  const projection = {
    consumerId: consumer.toUpperCase(),
    sourceCommit: witness.snapshot.proof.commit,
    sourceTree: witness.snapshot.proof.tree,
    snapshotManifestSha256: witness.snapshot.proof.manifestSha256,
    inputImageId: witness.inputImage.id,
    baseImageId: execution.inputImage.baseImageId,
    baseImageConfigSha256: execution.inputImage.baseImageConfigSha256,
    containerConfigurationSha256: execution.containerConfigurationSha256,
    challengeSha256: witness.challengeSha256,
    driverId: driverBinding.driverId,
    driverSha256: driverBinding.driverSha256,
    semanticTransportSha256: semanticReceipt.transportSha256,
    semanticProofSetSha256,
    isolationSha256,
    cleanupSha256,
    rollbackSha256: sha256(Buffer.from(`${stableJson(rollback)}\n`, 'utf8')),
  };
  const proof = deepFreeze({
    ...projection,
    proofSha256: sha256(Buffer.from(`${stableJson(projection)}\n`, 'utf8')),
  });
  containedProfileProofs.add(proof);
  containedProfileProofWitnesses.set(
    proof,
    Object.freeze({ semanticReceipt, execution, driverBinding, rollback }),
  );
  return proof;
}

function buildCompatibilityMatrix(input) {
  assertExactKeys(input, ['profiles', 'rollback'], 'compatibility authority inputs');
  const { profiles, rollback } = input;
  assertExactKeys(profiles, ['backend', 'installer', 'browser', 'frontend'], 'profile authorities');
  const witnesses = {};
  for (const [consumer, proof] of Object.entries(profiles)) {
    assert.equal(
      containedProfileProofs.has(proof),
      true,
      `${consumer} profile has no contained authority provenance`,
    );
    assert.equal(proof.consumerId, consumer.toUpperCase(), `${consumer} profile identity changed`);
    const witness = containedProfileProofWitnesses.get(proof);
    assert.ok(witness, `${consumer} profile witness is missing`);
    witnesses[consumer] = witness;
  }
  assert.equal(
    witnessedRollbackReceipts.has(rollback),
    true,
    'compatibility rollback has no repository-snapshot witness provenance',
  );
  for (const [consumer, witness] of Object.entries(witnesses)) {
    assert.equal(witness.rollback, rollback, `${consumer} profile rollback binding changed`);
  }

  const rows = SEMANTIC_COMPATIBILITY_REQUIREMENTS.map((requirement) => {
    const proofs = requirement.consumers.map((consumer) => semanticProofFor(
      witnesses[consumer].semanticReceipt,
      requirement.id,
    ));
    return {
      id: requirement.id,
      status: 'PASS',
      proofSetSha256: sha256(Buffer.from(`${stableJson(proofs)}\n`, 'utf8')),
      proofs,
    };
  });
  const standaloneProofs = [
    ...Object.entries(profiles).map(([consumer, proof]) => ({
      consumerId: consumer.toUpperCase(),
      profileProofSha256: proof.proofSha256,
    })),
    {
      rollbackCommit: rollback.sourceCommit,
      rollbackTree: rollback.sourceTree,
      rollbackSha256: sha256(Buffer.from(`${stableJson(rollback)}\n`, 'utf8')),
    },
  ];
  rows.push({
    id: 'CONSUMERS_STANDALONE_WITH_PRIOR_SOURCE_ROLLBACK',
    status: 'PASS',
    proofSetSha256: sha256(Buffer.from(`${stableJson(standaloneProofs)}\n`, 'utf8')),
    proofs: standaloneProofs,
  });
  return deepFreeze(rows);
}

function evidenceRepositoryProjection(repository, label) {
  assertExactKeys(repository, ['commit', 'tree'], label);
  assert.match(repository.commit, /^[0-9a-f]{40}$/, label + ' commit invalid');
  assert.match(repository.tree, /^[0-9a-f]{40}$/, label + ' tree invalid');
  return {
    commit: repository.commit,
    tree: repository.tree,
  };
}

function evidenceFileProjection(file, label, includeRole = false) {
  assertExactKeys(
    file,
    includeRole ? ['role', 'path', 'bytes', 'sha256'] : ['path', 'bytes', 'sha256'],
    label,
  );
  validateDescriptor(file, label);
  const projection = {
    path: file.path,
    bytes: file.bytes,
    sha256: file.sha256,
  };
  if (includeRole) {
    assert.equal(
      typeof file.role === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(file.role),
      true,
      label + ' role invalid',
    );
    return {
      role: file.role,
      ...projection,
    };
  }
  return projection;
}

function evidenceCanonicalFilesProjection(canonicalFiles) {
  assertExactKeys(
    canonicalFiles,
    ['artifact', 'releaseManifest', 'digestSidecar'],
    'canonical file evidence',
  );
  return Object.fromEntries(
    ['artifact', 'releaseManifest', 'digestSidecar'].map((key) => [
      key,
      evidenceFileProjection(canonicalFiles[key], 'canonical ' + key + ' evidence'),
    ]),
  );
}

function evidenceConsumerProjection(consumer, label) {
  assertExactKeys(
    consumer,
    [
      'consumer',
      'sourceCommit',
      'profile',
      'pin',
      'verifiedFileCount',
      'files',
      'artifactBytes',
      'releaseBytes',
      'sidecarBytes',
    ],
    label,
  );
  assert.match(consumer.consumer, /^(?:backend|installer|browser|frontend)$/, label + ' ID invalid');
  assert.match(consumer.sourceCommit, /^[0-9a-f]{40}$/, label + ' source commit invalid');
  assert.match(consumer.profile, /^[A-Z][A-Z0-9_]{2,63}$/, label + ' profile invalid');
  assert.equal(
    Number.isSafeInteger(consumer.verifiedFileCount) && consumer.verifiedFileCount >= 1,
    true,
    label + ' verified file count invalid',
  );
  assert.equal(Array.isArray(consumer.files), true, label + ' files must be an array');
  assert.equal(consumer.files.length <= 64, true, label + ' files exceed bound');
  assert.equal(
    consumer.verifiedFileCount,
    1 + consumer.files.length,
    label + ' verified file count changed',
  );
  assert.equal(Buffer.isBuffer(consumer.artifactBytes), true, label + ' artifact bytes missing');
  assert.equal(Buffer.isBuffer(consumer.releaseBytes), true, label + ' release bytes missing');
  assert.equal(Buffer.isBuffer(consumer.sidecarBytes), true, label + ' sidecar bytes missing');
  return {
    consumer: consumer.consumer,
    sourceCommit: consumer.sourceCommit,
    profile: consumer.profile,
    pin: evidenceFileProjection(consumer.pin, label + ' pin'),
    verifiedFileCount: consumer.verifiedFileCount,
    files: consumer.files.map((file, index) => evidenceFileProjection(
      file,
      label + ' file ' + index,
      true,
    )),
  };
}

const PROFILE_EVIDENCE_SHA256_KEYS = Object.freeze([
  'snapshotManifestSha256',
  'inputImageId',
  'baseImageId',
  'baseImageConfigSha256',
  'containerConfigurationSha256',
  'challengeSha256',
  'driverSha256',
  'semanticTransportSha256',
  'semanticProofSetSha256',
  'isolationSha256',
  'cleanupSha256',
  'rollbackSha256',
  'proofSha256',
]);

function evidenceProfileProjection(profile, label) {
  assertExactKeys(
    profile,
    [
      'consumerId',
      'sourceCommit',
      'sourceTree',
      'snapshotManifestSha256',
      'inputImageId',
      'baseImageId',
      'baseImageConfigSha256',
      'containerConfigurationSha256',
      'challengeSha256',
      'driverId',
      'driverSha256',
      'semanticTransportSha256',
      'semanticProofSetSha256',
      'isolationSha256',
      'cleanupSha256',
      'rollbackSha256',
      'proofSha256',
    ],
    label,
  );
  assert.match(profile.consumerId, /^(?:BACKEND|INSTALLER|BROWSER|FRONTEND)$/, label + ' consumer invalid');
  assert.match(profile.sourceCommit, /^[0-9a-f]{40}$/, label + ' source commit invalid');
  assert.match(profile.sourceTree, /^[0-9a-f]{40}$/, label + ' source tree invalid');
  assert.match(profile.driverId, /^C07_[A-Z0-9_]{3,91}$/, label + ' driver ID invalid');
  for (const key of PROFILE_EVIDENCE_SHA256_KEYS) {
    assert.match(profile[key], /^sha256:[0-9a-f]{64}$/, label + ' ' + key + ' invalid');
  }
  return {
    consumerId: profile.consumerId,
    sourceCommit: profile.sourceCommit,
    sourceTree: profile.sourceTree,
    snapshotManifestSha256: profile.snapshotManifestSha256,
    inputImageId: profile.inputImageId,
    baseImageId: profile.baseImageId,
    baseImageConfigSha256: profile.baseImageConfigSha256,
    containerConfigurationSha256: profile.containerConfigurationSha256,
    challengeSha256: profile.challengeSha256,
    driverId: profile.driverId,
    driverSha256: profile.driverSha256,
    semanticTransportSha256: profile.semanticTransportSha256,
    semanticProofSetSha256: profile.semanticProofSetSha256,
    isolationSha256: profile.isolationSha256,
    cleanupSha256: profile.cleanupSha256,
    rollbackSha256: profile.rollbackSha256,
    proofSha256: profile.proofSha256,
  };
}

function evidenceRollbackProjection(rollback) {
  assertExactKeys(
    rollback,
    ['sourceCommit', 'sourceTree', 'canonicalArtifactAbsent', 'priorSourceMounted'],
    'rollback evidence',
  );
  assert.match(rollback.sourceCommit, /^[0-9a-f]{40}$/, 'rollback evidence commit invalid');
  assert.match(rollback.sourceTree, /^[0-9a-f]{40}$/, 'rollback evidence tree invalid');
  assert.equal(rollback.canonicalArtifactAbsent, true, 'rollback evidence artifact absence changed');
  assert.equal(rollback.priorSourceMounted, false, 'rollback evidence mount state changed');
  return {
    sourceCommit: rollback.sourceCommit,
    sourceTree: rollback.sourceTree,
    canonicalArtifactAbsent: rollback.canonicalArtifactAbsent,
    priorSourceMounted: rollback.priorSourceMounted,
  };
}

function evidenceStringListProjection(value, label) {
  validateStringList(value, label);
  return value.map((entry) => entry);
}

function assertContentFree(value, pathLabel = '$') {
  const forbiddenKeys = new Set([
    'rawPrompt',
    'rawValue',
    'rawContent',
    'modelOutput',
    'toolArguments',
    'commandOutput',
    'stdout',
    'stderr',
    'cwd',
    'root',
    'localPath',
    'absolutePath',
  ]);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    assert.equal(value.length <= 2_048, true, `${pathLabel} string exceeds evidence bound`);
    assert.doesNotMatch(value, /(?:^|[\s"'])[A-Za-z]:[\\/]/, `${pathLabel} contains an absolute Windows path`);
    assert.doesNotMatch(value, /(?:^|[\s"'])\/(?:tmp|home|Users|var\/tmp)\//, `${pathLabel} contains an absolute local path`);
    return;
  }
  assert.equal(Array.isArray(value) || (typeof value === 'object' && value !== null), true, `${pathLabel} has unsupported evidence type`);
  if (Array.isArray(value)) {
    assert.equal(value.length <= 512, true, `${pathLabel} array exceeds evidence bound`);
    value.forEach((entry, index) => assertContentFree(entry, `${pathLabel}/${index}`));
    return;
  }
  assert.equal(Buffer.isBuffer(value), false, `${pathLabel} must not retain file or command bytes`);
  const keys = Object.keys(value);
  assert.equal(keys.length <= 128, true, `${pathLabel} object exceeds evidence field bound`);
  for (const key of keys) {
    assert.equal(forbiddenKeys.has(key), false, `${pathLabel} contains forbidden evidence key ${key}`);
    assertContentFree(value[key], `${pathLabel}/${key}`);
  }
}

function buildContentFreeEvidence({
  repositories,
  canonicalFiles,
  consumers,
  profiles,
  rollback,
  unsupportedSurfaces,
  activeWaivers,
}) {
  const repositoryKeys = [
    'canonical',
    'priorCanonical',
    'backend',
    'installer',
    'browser',
    'frontend',
  ];
  const consumerKeys = ['backend', 'installer', 'browser', 'frontend'];
  assertExactKeys(repositories, repositoryKeys, 'repository evidence');
  assertExactKeys(consumers, consumerKeys, 'consumer evidence');
  assertExactKeys(profiles, consumerKeys, 'profile evidence');

  const repositoryEvidence = Object.fromEntries(repositoryKeys.map((key) => [
    key,
    evidenceRepositoryProjection(repositories[key], key + ' repository evidence'),
  ]));
  const canonicalFileEvidence = evidenceCanonicalFilesProjection(canonicalFiles);
  const consumerEvidence = Object.fromEntries(consumerKeys.map((key) => [
    key,
    evidenceConsumerProjection(consumers[key], key + ' consumer evidence'),
  ]));
  const profileEvidence = Object.fromEntries(consumerKeys.map((key) => [
    key,
    evidenceProfileProjection(profiles[key], key + ' profile evidence'),
  ]));
  const rollbackEvidence = evidenceRollbackProjection(rollback);
  const unsupportedSurfaceEvidence = evidenceStringListProjection(
    unsupportedSurfaces,
    'unsupported surface evidence',
  );
  const activeWaiverEvidence = evidenceStringListProjection(
    activeWaivers,
    'active waiver evidence',
  );
  const compatibility = buildCompatibilityMatrix({ profiles, rollback });

  const evidence = {
    format: 'ceragon.ai-security.integration-evidence',
    formatVersion: 1,
    packetId: 'P0-C07',
    status: 'PASS_INERT_COMPATIBILITY_GATE',
    authority: {
      decisionId: AUTHORITY.decisionId,
      decisionSha256: AUTHORITY.decisionSha256,
      approvalEventSha256: AUTHORITY.approvalEventSha256,
      selection: AUTHORITY.selection,
    },
    repositories: repositoryEvidence,
    canonical: {
      packageName: '@ceragon/shared-contracts',
      packageVersion: '0.3.0',
      policySchemaVersion: 1,
      files: canonicalFileEvidence,
      byteEqualityAcrossAllConsumers: true,
      readableVersions: ['1', '2'],
      writableVersions: ['1'],
      runtimeActivatable: false,
      signedRuntimePolicyBundle: false,
      v2WriterEnabled: false,
    },
    consumers: consumerEvidence,
    profiles: profileEvidence,
    compatibility,
    rollback: rollbackEvidence,
    unsupportedSurfaces: unsupportedSurfaceEvidence,
    activeWaivers: activeWaiverEvidence,
    privacy: {
      rawCustomerContentIncluded: false,
      commandOutputIncluded: false,
      localPathsIncluded: false,
      outputEvidence: 'SHA256_AND_BYTE_COUNT_ONLY',
    },
    authorizationBoundary: {
      productionRuntimeActivated: false,
      v2WriterActivated: false,
      detectorOrEnforcementBehaviorChanged: false,
      productionProtectionClaimAuthorized: false,
    },
  };
  assertContentFree(evidence);
  return deepFreeze(evidence);
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function serializeContentFreeEvidence(evidence) {
  assertContentFree(evidence);
  const bytes = Buffer.from(`${stableJson(evidence)}\n`, 'utf8');
  assert.equal(bytes.length <= 262_144, true, 'integration evidence exceeds 262144 bytes');
  return bytes;
}
const INTEGRATION_SCHEMA_DESCRIPTOR = deepFreeze({
  path: 'schemas/ai-security-integration-input-manifest-v1.schema.json',
  bytes: 6_047,
  sha256: 'sha256:57d2bde7cce294c1f8c67d508b8e660f2c416f5b3b5ee3b827372fec8d46b831',
});

// This exact accepted manifest is the only promotable C07 input. Caller-supplied
// paths and the retained pending negative fixture cannot enter reviewed execution.
const REVIEWED_FINAL_MANIFEST_DESCRIPTOR = deepFreeze({
  path: 'fixtures/ai-security-integration-input-manifest-v1.accepted.json',
  bytes: 3_824,
  sha256: 'sha256:cc5b4903dc2432b4ab891c9e94bdb2a86a076b18223714dc8ea3701e53a77dd8',
});

function verifyCanonicalSource(root, canonical) {
  const snapshotter = createProtectedSnapshotter(root);
  const artifact = snapshotter.snapshot(canonical.artifact, 'canonical E01 artifact');
  const releaseManifest = snapshotter.snapshot(
    canonical.releaseManifest,
    'canonical E01 release manifest',
  );
  const digestSidecar = snapshotter.snapshot(canonical.digestSidecar, 'canonical E01 digest sidecar');
  assert.equal(
    digestSidecar.bytes.toString('utf8'),
    `${CANONICAL_FILES.artifact.sha256}\n`,
    'canonical E01 digest sidecar does not name the artifact digest',
  );
  const artifactValue = parseStrictJsonBytes(artifact.bytes);
  const releaseValue = parseStrictJsonBytes(releaseManifest.bytes);
  assert.equal(artifactValue.format, 'ceragon.ai-security.portable-contract');
  assert.equal(artifactValue.formatVersion, 1);
  assert.deepStrictEqual(artifactValue.protocol?.readableVersions, ['1', '2']);
  assert.deepStrictEqual(artifactValue.protocol?.writableVersions, ['1']);
  assert.equal(artifactValue.protocol?.v2WriterEnabled, false);
  assert.equal(artifactValue.runtimeActivatable, false);
  assert.equal(artifactValue.signedRuntimePolicyBundle, false);
  assert.equal(artifactValue.requiredIntegrationGate, 'P0-C07');
  assert.equal(releaseValue.artifactDigest, CANONICAL_FILES.artifact.sha256);
  assert.equal(releaseValue.artifactBytes, CANONICAL_FILES.artifact.bytes);
  assert.equal(releaseValue.runtimeActivatable, false);
  assert.equal(releaseValue.signedRuntimePolicyBundle, false);
  assert.equal(releaseValue.v2WriterEligible, false);
  return Object.freeze({
    artifactBytes: artifact.bytes,
    releaseBytes: releaseManifest.bytes,
    sidecarBytes: digestSidecar.bytes,
    files: Object.freeze({
      artifact: { path: artifact.path, bytes: artifact.bytes.length, sha256: artifact.sha256 },
      releaseManifest: {
        path: releaseManifest.path,
        bytes: releaseManifest.bytes.length,
        sha256: releaseManifest.sha256,
      },
      digestSidecar: {
        path: digestSidecar.path,
        bytes: digestSidecar.bytes.length,
        sha256: digestSidecar.sha256,
      },
    }),
  });
}

function assertCanonicalByteEquality(canonical, consumers) {
  for (const key of ['backend', 'installer', 'browser', 'frontend']) {
    const consumer = consumers[key];
    assert.ok(consumer, `missing ${key} canonical-byte proof`);
    assert.equal(
      consumer.artifactBytes.equals(canonical.artifactBytes),
      true,
      `${key} artifact differs byte-for-byte from canonical E01`,
    );
    assert.equal(
      consumer.releaseBytes.equals(canonical.releaseBytes),
      true,
      `${key} release manifest differs byte-for-byte from canonical E01`,
    );
    assert.equal(
      consumer.sidecarBytes.equals(canonical.sidecarBytes),
      true,
      `${key} digest sidecar differs byte-for-byte from canonical E01`,
    );
  }
  return true;
}

const witnessedRollbackReceipts = new WeakSet();

function verifyPriorSourceRollback(snapshot) {
  assert.equal(repositorySnapshots.has(snapshot), true, 'rollback requires a C07 prior repository snapshot');
  assert.equal(snapshot.proof.commit, APPROVED_INPUTS.priorCanonical.commit, 'rollback snapshot commit changed');
  assert.equal(snapshot.proof.tree, APPROVED_INPUTS.priorCanonical.tree, 'rollback snapshot tree changed');
  assert.equal(snapshot.verify(), true, 'rollback snapshot changed before absence proof');
  const absent = [
    CANONICAL_FILES.artifact.path,
    CANONICAL_FILES.releaseManifest.path,
    CANONICAL_FILES.digestSidecar.path,
    'packages/shared-contracts/manifests/ai-security-portable-release.v1.json',
  ];
  for (const relative of absent) {
    const absolute = path.resolve(snapshot.root, ...relative.split('/'));
    assert.equal(isWithin(snapshot.root, absolute), true, 'rollback absence path escapes snapshot');
    assert.equal(fs.existsSync(absolute), false, `prior C01 source unexpectedly contains ${relative}`);
  }
  const receipt = deepFreeze({
    sourceCommit: APPROVED_INPUTS.priorCanonical.commit,
    sourceTree: APPROVED_INPUTS.priorCanonical.tree,
    canonicalArtifactAbsent: true,
    priorSourceMounted: false,
  });
  witnessedRollbackReceipts.add(receipt);
  return receipt;
}

function validateRoots(roots) {
  assertExactKeys(
    roots,
    ['canonical', 'priorCanonical', 'backend', 'installer', 'browser', 'frontend'],
    'integration roots',
  );
  for (const [key, value] of Object.entries(roots)) {
    assert.equal(typeof value, 'string', `${key} root must be a string`);
    assert.equal(value.length >= 1 && value.length <= 1024, true, `${key} root length invalid`);
  }
}

function validateRuntimeInputs(runtimeInputs) {
  assertExactKeys(runtimeInputs, ['frontendDependencyImage'], 'integration runtime inputs');
  const frontendDependencyImage = registerFrontendDependencyImage(
    runtimeInputs.frontendDependencyImage,
  );
  return Object.freeze({ frontendDependencyImage });
}

async function runIntegrationGate(manifest, roots, runtimeInputs) {
  const accepted = validateIntegrationManifest(manifest);
  validateRoots(roots);
  validateRuntimeInputs(runtimeInputs);
  const repositoryPins = {
    canonical: accepted.canonical.source,
    priorCanonical: accepted.canonical.priorSource,
    backend: accepted.consumers.backend,
    installer: accepted.consumers.installer,
    browser: accepted.consumers.browser,
    frontend: accepted.consumers.frontend,
  };
  const repositoryProofEntries = await Promise.all(
    Object.keys(repositoryPins).map(async (key) => [
      key,
      await assertRepositoryAtPin(roots[key], repositoryPins[key], `${key} integration input`),
    ]),
  );
  const repositories = Object.fromEntries(repositoryProofEntries);

  const canonical = verifyCanonicalSource(roots.canonical, accepted.canonical);
  const consumers = Object.fromEntries(
    ['backend', 'installer', 'browser', 'frontend'].map((key) => [
      key,
      verifyPinnedConsumer(roots[key], accepted.consumers[key], key),
    ]),
  );
  assertCanonicalByteEquality(canonical, consumers);

  const snapshots = {};
  const acquiredSnapshots = [];
  try {
    for (const key of ['priorCanonical', 'backend', 'installer', 'browser', 'frontend']) {
      const snapshot = await materializeRepositorySnapshot(
        roots[key],
        repositoryPins[key],
        `${key} immutable integration source`,
      );
      snapshots[key] = snapshot;
      acquiredSnapshots.push(snapshot);
    }
    const rollback = verifyPriorSourceRollback(snapshots.priorCanonical);
    const consumerKeys = ['backend', 'installer', 'browser', 'frontend'];
    const profileSettlements = await Promise.allSettled(
      consumerKeys.map((key) => runFixedProfile(key, snapshots[key], {
        rollback,
        artifactBytes: canonical.artifactBytes,
      })),
    );
    const failedProfile = profileSettlements.find((result) => result.status === 'rejected');
    if (failedProfile) throw failedProfile.reason;
    const profiles = Object.fromEntries(
      profileSettlements.map((result, index) => [consumerKeys[index], result.value]),
    );
    buildCompatibilityMatrix({ profiles, rollback });

    for (const key of Object.keys(repositoryPins)) {
      const after = await assertRepositoryAtPin(
        roots[key],
        repositoryPins[key],
        `${key} integration input after profile execution`,
      );
      assert.deepStrictEqual(after, repositories[key], `${key} repository changed during integration`);
    }

    const evidence = buildContentFreeEvidence({
      repositories,
      canonicalFiles: canonical.files,
      consumers,
      profiles,
      rollback,
      unsupportedSurfaces: accepted.unsupportedSurfaces,
      activeWaivers: accepted.activeWaivers,
    });
    const evidenceBytes = serializeContentFreeEvidence(evidence);
    return Object.freeze({ evidence, evidenceBytes });
  } finally {
    for (const snapshot of acquiredSnapshots.reverse()) snapshot.dispose();
  }
}

function loadReviewedIntegrationManifest(packageRoot) {
  const snapshotter = createProtectedSnapshotter(packageRoot);
  snapshotter.snapshot(INTEGRATION_SCHEMA_DESCRIPTOR, 'integration manifest schema');
  const snapshot = snapshotter.snapshot(
    REVIEWED_FINAL_MANIFEST_DESCRIPTOR,
    'reviewed final integration manifest',
  );
  return validateIntegrationManifest(parseStrictJsonBytes(snapshot.bytes));
}

async function runReviewedIntegrationGate(packageRoot, roots, runtimeInputs) {
  const manifest = loadReviewedIntegrationManifest(packageRoot);
  return runIntegrationGate(manifest, roots, runtimeInputs);
}
// These isolated transport primitives cannot seed this module's private gate authority.
// They exist only so the exact one-shot and canonical-transport algorithms are adversarially tested.
const testing = Object.freeze({
  containedSemanticProfiles: CONTAINED_SEMANTIC_PROFILES,
  createOneShotSemanticRunAuthority,
  registerFrontendDependencyImage,
  validateContainedSemanticEnvelopeBytes,
  trustedGitFileModeSetting,
  parseTreeEntries,
  validateBuildxAttestationBytes,
});

module.exports = {
  APPROVED_INPUTS,
  CANONICAL_FILES,
  FIXED_CONTAINER_IMAGES,
  FIXED_PROFILES,
  INTEGRATION_SCHEMA_DESCRIPTOR,
  IntegrationGateError,
  assertCanonicalByteEquality,
  assertCommandCoverage,
  assertRepositoryAtPin,
  buildCanonicalDockerContext,
  buildCompatibilityMatrix,
  buildContentFreeEvidence,
  createProtectedSnapshotter,
  createHermeticCommandEnvironment,
  createBoundedTerminationController,
  containerControlArgs,
  parseCreatedContainerId,
  performVerifiedContainedCleanup,
  validateContainedContainerInspection,
  cleanupUnacceptedContainedProcess,
  performVerifiedImageCleanup,
  loadReviewedIntegrationManifest,
  materializeRepositorySnapshot,
  runBoundedProcess,
  runContainedProcess,
  runPriorCanonicalProfile,
  runFixedProfile,
  runIntegrationGate,
  runReviewedIntegrationGate,
  serializeContentFreeEvidence,
  sha256,
  validateIntegrationManifest,
  verifyDockerExecutionEnvironment,
  verifyCanonicalSource,
  verifyPinnedConsumer,
  testing,
  verifyPriorSourceRollback,
};
