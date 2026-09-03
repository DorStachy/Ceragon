#!/usr/bin/env node
/**
 * Mutation proof for ci/lib/vendored-engine-parity.mjs.
 *
 * A drift check nobody has watched fail is a drift check nobody should trust.
 * This fabricates trios on disk and asserts the exit code of each, so the four
 * states the check claims to distinguish are actually distinguished.
 *
 * Case (b) is the one this whole check exists for: the manifest and the
 * vendored copy AGREEING WITH EACH OTHER while the Installers source has
 * moved. Frontend's own vendored-digest.test.ts compares two files that both
 * live in Frontend, so it is structurally incapable of going red there. If
 * case (b) ever starts passing, this check has stopped doing the only job
 * that justifies its existence.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendored-engine-parity.mjs')
const sha = (t) => createHash('sha256').update(t.replace(/\r\n/g, '\n'), 'utf8').digest('hex')

let failures = 0

/**
 * @param {object} spec
 * @param {Record<string,string>} spec.copies      vendored file -> content
 * @param {Record<string,string>} spec.upstream    installers file -> content
 * @param {Record<string,string>} [spec.pins]      file -> digest to pin (defaults to the copy's own)
 * @param {boolean} [spec.omitInstallers]          do not create the Installers checkout at all
 * @param {string}  [spec.rawManifest]             write this instead of a generated manifest
 */
function scaffold(spec) {
  const root = mkdtempSync(path.join(tmpdir(), 'vep-'))
  const frontend = path.join(root, 'Frontend')
  const installers = path.join(root, 'Installers')
  mkdirSync(path.join(frontend, 'lib/ai-security/vendored'), { recursive: true })

  for (const [name, body] of Object.entries(spec.copies ?? {})) {
    writeFileSync(path.join(frontend, 'lib/ai-security/vendored', name), body)
  }

  if (spec.rawManifest !== undefined) {
    writeFileSync(path.join(frontend, 'lib/ai-security/vendored/MANIFEST.json'), spec.rawManifest)
  } else {
    const files = {}
    for (const [name, body] of Object.entries(spec.copies ?? {})) {
      files[name] = { sha256: spec.pins?.[name] ?? sha(body), lines: body.split('\n').length }
    }
    writeFileSync(
      path.join(frontend, 'lib/ai-security/vendored/MANIFEST.json'),
      JSON.stringify({ source: { repo: 'x/Installers', path: 'browser-extension/src/', commit: 'abc1234' }, files }, null, 2)
    )
  }

  if (!spec.omitInstallers) {
    mkdirSync(path.join(installers, 'browser-extension/src'), { recursive: true })
    for (const [name, body] of Object.entries(spec.upstream ?? {})) {
      writeFileSync(path.join(installers, 'browser-extension/src', name), body)
    }
  }
  return { root, frontend, installers }
}

function expectExit(label, spec, want) {
  const { root, frontend, installers } = scaffold(spec)
  const run = spawnSync(process.execPath, [CHECK, '--frontend', frontend, '--installers', installers], { encoding: 'utf8' })
  rmSync(root, { recursive: true, force: true })
  if (run.status === want) {
    console.log(`  ok    ${label} -> exit ${run.status}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${label} -> exit ${run.status}, want ${want}`)
    console.error(`        stdout: ${(run.stdout || '').trim().slice(0, 300)}`)
    console.error(`        stderr: ${(run.stderr || '').trim().slice(0, 300)}`)
  }
}

const ENGINE = 'export function scan(t) { return t.includes("secret") }\n'
const MOVED = 'export function scan(t) { return t.includes("secret") || t.includes("token") }\n'

console.log('vendored-engine-parity self-test')

expectExit('(a) manifest, copy and upstream all agree', {
  copies: { 'dlp.js': ENGINE, 'promptrisk.js': ENGINE },
  upstream: { 'dlp.js': ENGINE, 'promptrisk.js': ENGINE },
}, 0)

expectExit('(b) manifest and copy agree, UPSTREAM HAS MOVED -- the blind case', {
  copies: { 'dlp.js': ENGINE },
  upstream: { 'dlp.js': MOVED },
}, 1)

expectExit('(b2) upstream moved on only one of three files', {
  copies: { 'dlp.js': ENGINE, 'promptrisk.js': ENGINE, 'policyeval.js': ENGINE },
  upstream: { 'dlp.js': ENGINE, 'promptrisk.js': MOVED, 'policyeval.js': ENGINE },
}, 1)

expectExit('(d) the copy no longer matches the digest the manifest pins', {
  copies: { 'dlp.js': ENGINE },
  upstream: { 'dlp.js': ENGINE },
  pins: { 'dlp.js': sha(MOVED) },
}, 1)

expectExit('(c) the Installers checkout is absent', {
  copies: { 'dlp.js': ENGINE },
  omitInstallers: true,
}, 2)

expectExit('(c2) an upstream file is missing while the checkout exists', {
  copies: { 'dlp.js': ENGINE, 'promptrisk.js': ENGINE },
  upstream: { 'dlp.js': ENGINE },
}, 2)

expectExit('(c3) the manifest is not parseable JSON', {
  copies: { 'dlp.js': ENGINE },
  upstream: { 'dlp.js': ENGINE },
  rawManifest: '{ this is not json',
}, 2)

expectExit('(c4) the manifest declares no files -- nothing compared is not a pass', {
  copies: {},
  upstream: {},
  rawManifest: JSON.stringify({ source: {}, files: {} }),
}, 2)

expectExit('(e) a manifest entry DELETED for a drifted file is NOT a pass', {
  copies: { 'dlp.js': ENGINE, 'promptrisk.js': ENGINE },
  upstream: { 'dlp.js': ENGINE, 'promptrisk.js': MOVED },
  // promptrisk.js is vendored and drifted, but the manifest no longer names it.
  // Before 2026-09-04 this returned PASS: the loop only walked the manifest, so
  // removing an entry removed the file from the comparison entirely.
  rawManifest: JSON.stringify({
    source: { repo: 'x/Installers', path: 'browser-extension/src/', commit: 'abc1234' },
    files: { 'dlp.js': { sha256: sha(ENGINE), lines: 1 } },
  }),
}, 2)

expectExit('(e2) an engine added UPSTREAM and never vendored passes -- the stated gap', {
  copies: { 'dlp.js': ENGINE },
  upstream: { 'dlp.js': ENGINE, 'newengine.js': ENGINE },
}, 0)

expectExit('(c5) LF vs CRLF is not drift', {
  copies: { 'dlp.js': ENGINE.replace(/\n/g, '\r\n') },
  upstream: { 'dlp.js': ENGINE },
  pins: { 'dlp.js': sha(ENGINE) },
}, 0)

if (failures) {
  console.error(`\n${failures} self-test case(s) failed.`)
  process.exit(1)
}
console.log('\nall cases behaved as declared.')
