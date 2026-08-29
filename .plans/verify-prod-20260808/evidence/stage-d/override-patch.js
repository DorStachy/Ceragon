/**
 * Stage D harness patch.
 *
 * Inserts a LIVE-RELOADED override layer into the proven stub backend so a
 * fixture state can be swapped between screenshots without restarting either
 * server. Every Stage D defeat step is "hand the surface a different shape and
 * photograph what it then says", so the shape has to be changeable at request
 * time, not at boot.
 */
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, 'stub-backend.cjs')
const dst = path.join(__dirname, 'stub.cjs')
let s = fs.readFileSync(src, 'utf8')

const anchor = `  if (p === '/health') { res.end(JSON.stringify({ status: 'ok', stub: true })); return }`
if (!s.includes(anchor)) throw new Error('anchor not found')

const injected = anchor + `

  // ---- Stage D override layer (live-reloaded on every request) -------------
  // overrides.json: [{ pattern, status?, body?, delayMs?, raw? }]
  // First match wins. \`status\` >= 400 with no body yields an error envelope.
  try {
    const ovPath = require('path').join(__dirname, 'overrides.json')
    if (require('fs').existsSync(ovPath)) {
      const list = JSON.parse(require('fs').readFileSync(ovPath, 'utf8'))
      for (const o of list) {
        if (!new RegExp(o.pattern).test(p)) continue
        const finish = () => {
          res.statusCode = o.status || 200
          if (o.raw !== undefined) { res.end(String(o.raw)); return }
          res.end(JSON.stringify(o.body !== undefined ? o.body : { message: 'stage-d override error' }))
        }
        console.log('OVERRIDE', o.pattern, '->', o.status || 200, p)
        if (o.delayMs) { setTimeout(finish, o.delayMs); return }
        finish()
        return
      }
    }
  } catch (e) { console.log('OVERRIDE-LOAD-FAILED', e.message) }
  // -------------------------------------------------------------------------
`

s = s.replace(anchor, injected)
fs.writeFileSync(dst, s)
console.log('wrote', dst)
