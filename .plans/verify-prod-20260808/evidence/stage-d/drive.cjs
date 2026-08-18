/**
 * Stage D render driver.
 *
 * Drives Chrome headlessly over CDP to the console's REAL route (not a component
 * in isolation), waits for the page to actually settle, then writes:
 *   - a PNG
 *   - the page's rendered innerText (this is the pasteable evidence)
 *   - the text + data-attributes of any testids asked for
 *   - console errors and >=400 responses
 *
 * Usage:  node drive.cjs <shot-name> <route> [width] [testid,testid,...]
 *
 * The session cookie is HttpOnly, so page JS cannot set it; CDP Network.setCookie
 * can. The token comes from the stub itself so fixtures and token cannot disagree.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.CDP_PORT || 9366)
const APP = process.env.APP || 'http://localhost:3130'
const STUB = process.env.STUB || 'http://127.0.0.1:2163'
const OUT = path.join(__dirname, '..', 'shots')
const PROFILE = path.join(os.tmpdir(), 'staged-profile-' + PORT + '-' + Date.now())
const SITE = '11111111-1111-4111-8111-111111111111'

const NAME = process.argv[2]
const ROUTE = process.argv[3]
const WIDTH = Number(process.argv[4] || 1440)
const TESTIDS = (process.argv[5] || '').split(',').filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(u) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(u)
    let id = 0
    const p = new Map()
    const listeners = []
    ws.addEventListener('open', () => res({
      send(m, q = {}) {
        return new Promise((a, b) => { const i = ++id; p.set(i, { a, b }); ws.send(JSON.stringify({ id: i, method: m, params: q })) })
      },
      on(fn) { listeners.push(fn) },
      close: () => ws.close(),
    }))
    ws.addEventListener('error', rej)
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && p.has(m.id)) {
        const { a, b } = p.get(m.id); p.delete(m.id)
        m.error ? b(new Error(JSON.stringify(m.error))) : a(m.result)
      } else if (m.method) listeners.forEach((fn) => fn(m))
    })
  })
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })

  const login = await fetch(`${STUB}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'render-qa@local.test', password: 'local-stub-no-auth' }),
  })
  const { accessToken } = await login.json()
  if (!accessToken) throw new Error('stub returned no accessToken')

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
  ], { stdio: 'ignore' })

  let targets
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break } catch {}
    await sleep(500)
  }
  if (!targets || !targets.length) throw new Error('chrome did not expose a CDP target')
  const cdp = await connect((targets.find((t) => t.type === 'page') || targets[0]).webSocketDebuggerUrl)

  const consoleErrors = []
  const failed = []
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 240))
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 300))
    }
    if (m.method === 'Network.responseReceived') {
      const { url, status } = m.params.response
      if (status >= 400) failed.push(`${status} ${url.replace(APP, '')}`)
    }
  })

  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: WIDTH < 500 ? 812 : 950, deviceScaleFactor: 2, mobile: WIDTH < 500,
  })
  await cdp.send('Network.setCookie', {
    name: 'codefense_session', value: accessToken,
    domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax',
  })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('cera_active_site_id','${SITE}')}catch(e){}`,
  })

  // Warm the route server-side first: a dev-mode Next route compiles on first
  // hit, and the settle poll below would otherwise photograph the shell.
  try { await fetch(APP + ROUTE, { headers: { cookie: `codefense_session=${accessToken}` } }) } catch {}

  await cdp.send('Page.navigate', { url: APP + ROUTE })

  let len = 0, stable = 0
  for (let i = 0; i < 60; i++) {
    await sleep(1000)
    const r = await cdp.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const t = document.body.innerText
        return { len: t.length, busy: document.querySelectorAll('[class*="animate-spin"],[class*="animate-pulse"],[role="progressbar"],[aria-busy="true"]').length > 0 }
      })()`,
    })
    const v = r.result.value
    stable = v.len === len && !v.busy && v.len > 200 ? stable + 1 : 0
    len = v.len
    if (stable >= 3 && i >= 4) break
  }
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
  await sleep(800)

  const probe = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const ids = ${JSON.stringify(TESTIDS)}
      const found = {}
      for (const id of ids) {
        // A bare word is a data-testid; anything with CSS punctuation is used
        // as a raw selector, because not every surface labels itself testid.
        // NB: written out longhand, not \\w — this string is a JS template
        // literal, so a backslash class would reach the page as a bare letter.
        const sel = /^[A-Za-z0-9_-]+$/.test(id) ? '[data-testid="' + id + '"]' : id
        const els = Array.from(document.querySelectorAll(sel))
        found[id] = els.map((el) => ({
          text: el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 700),
          attrs: Object.fromEntries(Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
        }))
      }
      return JSON.stringify({
        url: location.pathname + location.search,
        title: document.title,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          ? { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth } : null,
        bodyText: document.body.innerText.replace(/\\n{3,}/g, '\\n\\n'),
        found,
      })
    })()`,
  })
  const data = JSON.parse(probe.result.value)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const png = path.join(OUT, `${NAME}.png`)
  fs.writeFileSync(png, Buffer.from(shot.data, 'base64'))
  fs.writeFileSync(path.join(OUT, `${NAME}.txt`), data.bodyText)
  fs.writeFileSync(path.join(OUT, `${NAME}.json`), JSON.stringify({ ...data, bodyText: undefined, consoleErrors, failed }, null, 2))

  console.log('=== ' + NAME + ' @ ' + data.url + ' (w=' + WIDTH + ') ===')
  console.log('title:', data.title)
  console.log('h-overflow:', data.overflow ? JSON.stringify(data.overflow) : 'none')
  console.log('failedRequests:', failed.length ? failed.slice(0, 6).join(' | ') : 'none')
  console.log('consoleErrors:', consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'none')
  for (const id of TESTIDS) {
    const rows = data.found[id] || []
    console.log(`-- [${id}] x${rows.length}`)
    rows.slice(0, 12).forEach((r) => console.log('   ', JSON.stringify(r.attrs), '::', r.text))
  }
  console.log('bodyTextChars:', data.bodyText.length, '| png', (fs.statSync(png).size / 1024).toFixed(0) + 'KB')

  cdp.close(); chrome.kill()
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
