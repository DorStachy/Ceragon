#!/usr/bin/env node
/*
 * P47 stage-1 WIRE lane — fake AI provider upstream.
 * Binds 127.0.0.1:19399 (plain HTTP). Appends every request (method, url,
 * headers, raw body, sha256 of the raw body) to upstream-capture.jsonl and
 * answers in the provider's own shape.
 *
 * Response mode is read from upstream-mode.json on EVERY request, so the mode can
 * change without restarting: {"mode":"benign"|"secret"|"secret-sse", "text":"..."}.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DIR = __dirname;
const CAP = path.join(DIR, 'upstream-capture.jsonl');
const MODE = path.join(DIR, 'upstream-mode.json');
const PORT = Number(process.env.FAKE_UPSTREAM_PORT || 19399);

function mode() {
  try { return JSON.parse(fs.readFileSync(MODE, 'utf8')); } catch { return { mode: 'benign' }; }
}
function sseResponses(res, text) {
  // OpenAI Responses-API SSE shape (what Codex expects on /responses).
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const w = (ev, obj) => res.write(`event: ${ev}
data: ${JSON.stringify(obj)}

`);
  const id = 'resp_fake';
  const itemId = 'msg_fake_item';
  w('response.created', { type: 'response.created', response: { id, object: 'response', status: 'in_progress', model: 'gpt-5-codex', output: [] } });
  w('response.in_progress', { type: 'response.in_progress', response: { id, object: 'response', status: 'in_progress', model: 'gpt-5-codex', output: [] } });
  w('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { id: itemId, type: 'message', role: 'assistant', status: 'in_progress', content: [] } });
  w('response.content_part.added', { type: 'response.content_part.added', item_id: itemId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } });
  const chunks = [];
  for (let i = 0; i < text.length; i += 17) chunks.push(text.slice(i, i + 17));
  for (const c of chunks) w('response.output_text.delta', { type: 'response.output_text.delta', item_id: itemId, output_index: 0, content_index: 0, delta: c });
  w('response.output_text.done', { type: 'response.output_text.done', item_id: itemId, output_index: 0, content_index: 0, text });
  w('response.content_part.done', { type: 'response.content_part.done', item_id: itemId, output_index: 0, content_index: 0, part: { type: 'output_text', text } });
  w('response.output_item.done', { type: 'response.output_item.done', output_index: 0, item: { id: itemId, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] } });
  w('response.completed', { type: 'response.completed', response: { id, object: 'response', status: 'completed', model: 'gpt-5-codex', output: [{ id: itemId, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 12, output_tokens: 40, total_tokens: 52 } } });
  res.end();
}
function sse(res, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const w = (ev, obj) => res.write(`event: ${ev}\ndata: ${JSON.stringify(obj)}\n\n`);
  w('message_start', { type: 'message_start', message: { id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 0 } } });
  w('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  // Chunk the text so a mid-token secret straddles two SSE frames.
  const chunks = [];
  for (let i = 0; i < text.length; i += 17) chunks.push(text.slice(i, i + 17));
  for (const c of chunks) w('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } });
  w('content_block_stop', { type: 'content_block_stop', index: 0 });
  w('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 40 } });
  w('message_stop', { type: 'message_stop' });
  res.end();
}
const server = http.createServer((req, res) => {
  const bufs = [];
  req.on('data', (d) => bufs.push(d));
  req.on('end', () => {
    const raw = Buffer.concat(bufs);
    const rec = {
      ts: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyLen: raw.length,
      bodySha256: crypto.createHash('sha256').update(raw).digest('hex'),
      body: raw.toString('utf8'),
    };
    fs.appendFileSync(CAP, JSON.stringify(rec) + '\n');
    const m = mode();
    let text = m.text || 'Sure. Here is a short answer from the fake upstream.';
    if (m.textB64) text = Buffer.from(m.textB64, 'base64').toString('utf8');
    if (/count_tokens/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ input_tokens: 42 }));
    }
    let wantsStream = false;
    try { wantsStream = JSON.parse(raw.toString('utf8')).stream === true; } catch {}
    if (/responses/.test(req.url)) {
      if (wantsStream || m.mode === 'secret-sse') return sseResponses(res, text);
    }
    if (m.mode === 'secret-sse' || (wantsStream && m.mode !== 'no-sse')) return sse(res, text);
    if (/chat\/completions/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: 'chatcmpl-fake', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: 'gpt-4o', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
    }
    if (/responses/.test(req.url)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: 'resp_fake', object: 'response', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5-20260929', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 20 } }));
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`fake upstream listening on 127.0.0.1:${PORT}, capture=${CAP}`));
