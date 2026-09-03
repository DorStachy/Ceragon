#!/usr/bin/env node
/**
 * CROSS-REPO DRIFT CHECK for the vendored browser detection engine.
 *
 * THE GAP THIS CLOSES. The console's AI Security policy playground evaluates
 * admin-typed prompts through a VERBATIM COPY of the endpoint's browser
 * extension engine, vendored into Frontend/lib/ai-security/vendored/ and
 * pinned by a MANIFEST.json carrying a commit and a digest per file.
 *
 * Frontend's own vendored-digest.test.ts compares THE COPY against THAT
 * MANIFEST. It is a good test and it runs per-PR. But both halves it compares
 * live in the same repo, so it is structurally incapable of seeing the case
 * that matters: the copy and the manifest agreeing with each other while the
 * UPSTREAM file in Installers has moved. When that happens the console
 * demonstrates behaviour the endpoint does not have, and every guard in either
 * repo stays green.
 *
 * The GitHub-side answer to that, Frontend's vendored-upstream-drift.yml, is
 * workflow_dispatch plus a daily cron, needs a cross-repo read token, and its
 * per-PR trigger is an owner cost decision owned elsewhere. So on any given
 * pull request the upstream question is asked by nothing.
 *
 * This check asks it from the workspace, where both repos are already on disk:
 * no token, no network, and no GitHub setting can switch it off.
 *
 * EXIT VOCABULARY, matching ci/lib/vocab-parity.mjs:
 *
 *   0  PASS         manifest, vendored copy and Installers source all agree
 *   1  DRIFT        they were compared and they do not agree
 *   2  NOT CHECKED  the comparison could not be made
 *   3  usage
 *
 * NOT CHECKED IS NOT A PASS, and that discipline is the whole point. The
 * workflow this check stands in for says it plainly: "A drift check that exits
 * 0 because it checked nothing reports the same green as one that checked and
 * found nothing." A missing checkout, an unreadable file or unparseable JSON
 * is 2, never 0.
 *
 * Digests are over LF-NORMALISED content, because the manifest's own refresh
 * note says so and because a raw byte compare goes red on every Windows
 * worktree in this workspace for a reason that has nothing to do with drift.
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE = path.resolve(HERE, '..', '..')

const MANIFEST_REL = 'lib/ai-security/vendored/MANIFEST.json'
const UPSTREAM_REL = 'browser-extension/src'

const EXIT = { PASS: 0, DRIFT: 1, NOT_CHECKED: 2, USAGE: 3 }

const digest = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex')

function readText(file) {
  try {
    return { ok: true, text: readFileSync(file, 'utf8') }
  } catch (error) {
    return { ok: false, reason: `cannot read ${file}: ${error.message}` }
  }
}

export function compare({ frontend, installers }) {
  if (!existsSync(frontend)) {
    return { status: 'NOT CHECKED', reasons: [`no Frontend checkout at ${frontend}`] }
  }
  if (!existsSync(installers)) {
    return {
      status: 'NOT CHECKED',
      reasons: [
        `no Installers checkout at ${installers}`,
        'The upstream half of this comparison is missing, so nothing was compared.',
      ],
    }
  }

  const manifestPath = path.join(frontend, MANIFEST_REL)
  const manifestRead = readText(manifestPath)
  if (!manifestRead.ok) return { status: 'NOT CHECKED', reasons: [manifestRead.reason] }

  let manifest
  try {
    manifest = JSON.parse(manifestRead.text)
  } catch (error) {
    return { status: 'NOT CHECKED', reasons: [`${MANIFEST_REL} is not parseable JSON: ${error.message}`] }
  }

  const files = manifest?.files
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    return {
      status: 'NOT CHECKED',
      reasons: [`${MANIFEST_REL} declares no files; there is nothing to compare and that is not a pass.`],
    }
  }

  const rows = []
  const drift = []
  const reasons = []

  /*
   * THE MANIFEST'S FILE LIST IS NOT SELF-CERTIFYING.
   *
   * This loop iterates the manifest. If the manifest is the only thing that says
   * which files are vendored, then DELETING AN ENTRY makes the check green over
   * a file that has drifted -- absence read as compliance, in the script whose
   * own header refuses exactly that. The discipline was applied at the whole
   * manifest (0 files is exit 2) and not per file.
   *
   * So the vendored DIRECTORY is the authority on what must be compared: a .js
   * file sitting in it that the manifest does not name is unpinned, and that is
   * NOT CHECKED rather than a pass.
   *
   * The OTHER direction is deliberately NOT checked, and saying so matters more
   * than closing it. browser-extension/src/ is the whole extension, not three
   * engines, so "every upstream file must be vendored" is false -- the manifest
   * is the only thing that knows which upstream files the console is supposed
   * to carry. An engine added upstream and never vendored therefore passes here,
   * and only a human re-vendoring notices. That is a real gap in this check and
   * it is stated rather than papered over.
   */
  let onDisk = []
  try {
    onDisk = readdirSync(path.join(frontend, 'lib/ai-security/vendored')).filter((f) => f.endsWith('.js'))
  } catch (error) {
    return { status: 'NOT CHECKED', reasons: [`cannot list the vendored directory: ${error.message}`] }
  }
  for (const f of onDisk) {
    if (!Object.prototype.hasOwnProperty.call(files, f)) {
      reasons.push(`${f} is vendored but the manifest does not name it, so nothing pins it; deleting a manifest entry must not silence this check`)
    }
  }

  for (const [name, declared] of Object.entries(files)) {
    const copyRead = readText(path.join(frontend, 'lib/ai-security/vendored', name))
    const upstreamRead = readText(path.join(installers, UPSTREAM_REL, name))
    if (!copyRead.ok) { reasons.push(copyRead.reason); continue }
    if (!upstreamRead.ok) { reasons.push(upstreamRead.reason); continue }

    const copy = digest(copyRead.text)
    const upstream = digest(upstreamRead.text)
    const pinned = String(declared?.sha256 ?? '')
    if (!pinned) { reasons.push(`${name}: the manifest declares no sha256`); continue }

    const row = { name, pinned, copy, upstream }
    rows.push(row)

    if (copy !== pinned) {
      drift.push({ ...row, kind: 'copy-vs-manifest',
        say: `${name}: the vendored copy does not match the digest the manifest pins.` })
    }
    if (copy !== upstream) {
      drift.push({ ...row, kind: 'copy-vs-upstream',
        say: `${name}: the vendored copy and the Installers source have diverged. THIS is the case Frontend's own vendored-digest.test.ts cannot see.` })
    }
  }

  if (reasons.length) return { status: 'NOT CHECKED', reasons, rows }
  if (rows.length === 0) {
    return { status: 'NOT CHECKED', reasons: ['no file was compared'], rows }
  }
  return { status: drift.length ? 'DRIFT' : 'PASS', reasons: [], rows, drift, pinnedCommit: manifest?.source?.commit ?? null }
}

function usage(message) {
  console.error(`vendored-engine-parity: ${message}`)
  console.error('usage: node ci/lib/vendored-engine-parity.mjs [--frontend <dir>] [--installers <dir>]')
  return EXIT.USAGE
}

export function main(argv) {
  let frontend = path.join(WORKSPACE, 'Frontend')
  let installers = path.join(WORKSPACE, 'Installers')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--frontend') { frontend = argv[i + 1]; i += 1; if (!frontend) return usage('--frontend needs a directory') }
    else if (argv[i] === '--installers') { installers = argv[i + 1]; i += 1; if (!installers) return usage('--installers needs a directory') }
    else return usage(`unrecognised argument ${argv[i]}`)
  }

  const result = compare({ frontend, installers })

  if (result.status === 'NOT CHECKED') {
    console.error('NOT CHECKED -- the console engine and the endpoint engine were not compared.\n')
    for (const reason of result.reasons) console.error(`  ${reason}`)
    console.error('\nThis is not a pass. A drift check that exits 0 because it checked nothing')
    console.error('reports the same green as one that checked and found nothing.')
    return EXIT.NOT_CHECKED
  }

  if (result.status === 'DRIFT') {
    console.error('DRIFT -- the console does not evaluate what the endpoint evaluates.\n')
    for (const d of result.drift) {
      console.error(`  ${d.say}`)
      console.error(`    manifest ${d.pinned.slice(0, 16)}  copy ${d.copy.slice(0, 16)}  installers ${d.upstream.slice(0, 16)}`)
    }
    console.error('\nRe-vendor with the manifest\'s own recipe and update its digests, or explain')
    console.error('in the manifest why the console deliberately runs a different engine.')
    return EXIT.DRIFT
  }

  console.log(`PASS -- ${result.rows.length} vendored file(s) match both the manifest and the Installers source.`)
  if (result.pinnedCommit) console.log(`       manifest pins Installers ${result.pinnedCommit}`)
  for (const row of result.rows) console.log(`       ${row.name.padEnd(16)} ${row.copy.slice(0, 16)}`)
  return EXIT.PASS
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
