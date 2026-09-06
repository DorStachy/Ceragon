# P47 stage 1 - WIRE lane (provider-proxy egress)

Question: when a real API call to an AI provider passes through the DeVoid daemon's
provider proxy, what bytes actually leave the machine?

Run 2026-09-05/06, this lane's OWN daemon on 127.0.0.1:19391 (isolated home
%TEMP%\devoid-p47-wire), backend http://127.0.0.1:2353, org policy site
95937361-828f-4737-9c74-64defab9f5c6. The shared daemon (:19390), backend and console were
not restarted or reconfigured. Nothing reached the public internet: the forward destination
was a loopback capture server and the daemon ran with HTTPS_PROXY pointed at a dead loopback
port (NO_PROXY=127.0.0.1), so a non-loopback dial fails at connect. `upstream-capture.jsonl`
is the complete list of everything that left the proxy.

Two provider lanes exist and both were exercised: `POST /proxy/anthropic/v1/messages`
(Claude Code, Anthropic Messages) and `POST /proxy/openai/v1/responses` (Codex, OpenAI
Responses over SSE). There is no `/v1/chat/completions` lane - the Codex lane speaks the
Responses API only.

Mid-run the org policy changed under us: another lane moved `stripe-live` from redact to
block at 21:17:27Z (policy `updatedAt` 2026-09-05T21:17:27.325Z). Rows below say which
revision they were measured under, and the cross-lane comparison was re-run so all three
lanes are compared under one revision.

## Results

| probe | expected | observed | verdict | evidence file |
|---|---|---|---|---|
| W1 benign prompt, uplink | forwarded unchanged | upstream received a body whose sha256 45654843... equals the exact bytes the client sent; the client's response sha256 fa439702... equals the exact bytes the upstream returned | VERIFIED | negative-control.json, results-noninteractive.json |
| W2 synthetic AWS key pair (aws-access-key / aws-credential-pair: block) | nothing leaves | 0 upstream requests; client got a provider-shaped 200 whose text says devoid blocked it, with the key masked in the echoed prompt | VERIFIED | results-noninteractive.json, upstream-capture.jsonl |
| W3 synthetic Stripe live key (stripe-live: redact, rev 1) | redacted on the wire | upstream received the prompt with the key replaced by the literal [REDACTED:stripe-live]; the raw key is absent from the captured bytes | VERIFIED | results-noninteractive.json |
| W4 synthetic Slack bot token (slack-token: redact) | redacted on the wire | upstream received [REDACTED:slack-token]; the raw token is absent | VERIFIED | results-noninteractive.json, results-anthropic-rev2.json |
| W5 throwaway RSA private key (private-key: block) | nothing leaves | 0 upstream requests; client got the block message | VERIFIED | results-noninteractive.json |
| W6 system-prompt-exfiltration prompt (injection-override-exfil: block) | nothing leaves | 0 upstream requests; block message names the three injection classes | VERIFIED | results-noninteractive.json |
| W7 count_tokens sibling carrying the blocked AWS prompt | must not leak the prompt | 0 upstream requests; client answered benign {"input_tokens":0}; the audit row was still written | VERIFIED | results-extra.json |
| W8 count_tokens sibling, benign | forwarded unchanged | forwarded byte-identical; upstream answered {"input_tokens":42} | VERIFIED | results-extra.json |
| W9 same six fixtures with stream:true | verdicts survive streaming | identical outcomes; the redact notice arrives as a leading SSE content_block_delta, a block arrives as a synthetic msg_devoid_synth SSE stream, and the upstream got either the redacted body or nothing | VERIFIED | results-resp-sse.json |
| W10 poisoned RESPONSE (synthetic secret plus an injected shell instruction), Anthropic lane, non-streamed | some inspection | the client received the secret and the injected instruction verbatim; no redaction, no flag, no notice | GAP | results-resp-nonstream.json |
| W11 same, streamed SSE | some inspection | same: reassembling the text_delta frames yields the secret and the injected instruction verbatim | GAP | results-resp-sse.json, analyze-sse.cjs |
| W12 same, Codex lane (Responses SSE) | some inspection | same on turn 1, and the next turn on the same session was not held either | GAP | results-openai-downlink.json |
| W13 warn-tier secret (stripe-key: warn), caller sends no X-Devoid-Interactive | policy says warn | request forwarded byte-identical - the raw synthetic key left the box. Log: "warn on non-interactive surface; degrading to monitored forward". Ledger row says ALLOW / SENT_ALLOWED with warned=false | GAP | results-extra.json, daemon-decisions.log |
| W14 same secret, caller sends X-Devoid-Interactive: true | held | 0 upstream requests; client got the WARN hold notice with a release fingerprint | VERIFIED | results-extra.json |
| W15 hook lane vs wire lane, same six fixtures, policy rev 2 | same decision | identical for all six (allow, block, block, redact, block, block) | VERIFIED | results-hooklane.json, results-anthropic-rev2.json |
| W16 Codex wire lane vs Anthropic wire lane, same six, rev 2 | same decision | identical for all six, including redact-then-forward for slack-token | VERIFIED | results-openai.json, results-anthropic-rev2.json |
| W17 header hygiene | client credential relayed, devoid headers not | x-api-key reached the upstream unchanged; x-devoid-interactive and x-devoid-warn-session were stripped; the daemon token was never forwarded; the proxy adds x-forwarded-for: 127.0.0.1 | VERIFIED | forwarded-headers.json |
| W18 audit rows for every probe | one honest row per decision | rows exist for every non-allow decision, but see Gaps 3 to 7 | PARTIAL | ai-events-wire-lane.txt |
| W19 dev/test override for the upstream base URL | some seam | none exists in the shipped code (Gap 1) | GAP | harness-seam.patch |

Correction to an earlier stage-1 note: the shared drive-results.json shows the hook lane
answering allow to an AWS key. That fixture is the AWS documented example key, which the
detector grades non-enforcing on purpose. With a synthetic random AKIA key the hook lane and
both wire lanes all block. There is no AWS gap.

## Gaps

1. The provider proxy cannot be pointed anywhere but the real provider, so its egress is
   untestable as shipped. `internal/daemon/server.go` hardcodes
   `url.Parse("https://api.anthropic.com")` at mount time; the Codex lane's bases are consts
   in `internal/proxy/openai_route.go`, and the one env seam that does exist
   (DEVOID_OPENAI_MANAGED_BASE) is rejected by `classifyBaseURL` for any host other than
   api.openai.com or chatgpt.com. There is no config field, credentials.json field,
   managed-config entry or flag. To capture the bytes at all, this lane built a harness
   binary with a loopback-only upstream override (harness-seam.patch, 100 lines across three
   files, branch p47/wire-lane-harness, never pushed): one env var per lane that is ignored
   unless the host is 127.* or localhost, plus a fingerprint salt so a second daemon on this
   machine can enrol as its own endpoint. No scan, policy, redaction or routing-decision
   code was touched - the seam only changes where the already-decided bytes are sent. Every
   verdict in the table is the shipped code's own behaviour.

2. The response direction is not inspected on either lane. A provider, or anything able to
   answer as one, can return a secret and an instruction telling the agent to fetch and run
   a remote script, and the developer's client receives it verbatim - non-streamed and
   streamed, Anthropic lane and Codex lane. This matches the code's own comment ("SCOPE (V1
   = REQUEST-SIDE ONLY) ... response-side gating is a documented FAST-FOLLOW"), so it is a
   scope gap rather than a defect, but it means the wire lane protects the provider from the
   developer's secrets and does not protect the developer from the provider's answer. The
   Codex lane's downlink_inspection_degraded hold, which fired while our stub was returning
   the wrong response shape, is a parse check rather than a content check: a well-formed
   poisoned response sails through.

3. A warn class is not a wire control. Any caller that does not volunteer
   X-Devoid-Interactive: true gets the original body forwarded byte-identical. That header
   is client-asserted, so "does this secret leave the machine?" is decided by the caller and
   not by the admin's policy.

4. A degraded warn is invisible in the console. The ledger row for the W13 forward reads
   PROMPT_SUBMITTED / ALLOW / SENT_ALLOWED with warned=false, so an admin sees an ordinary
   allowed prompt rather than a warn that was degraded because the caller did not claim
   interactivity.

5. The two lanes describe the same event differently in ai_events. For one slack-token
   prompt under one policy revision the hook lane wrote
   PROMPT_REDACTED / BLOCK / BLOCKED_BEFORE_EGRESS / deny-prompt while the wire lane wrote
   PROMPT_REDACTED / ALLOW / REDACTED_THEN_SENT / none. The wire row is the one that matches
   the bytes. An auditor reading the hook row alone would conclude nothing was sent, when a
   redacted version was.

6. Wire-lane rows carry enforcement_effect = none and surface = web-ai-proxy. Every block
   that actually stopped bytes at the proxy records no enforcement effect, while the hook
   lane's advisory decision on the same prompt records deny-prompt. And both provider
   proxies - Claude Code over ANTHROPIC_BASE_URL and Codex over the wire - are labelled with
   the browser Web AI Guard surface name.

7. An allowed request through the Anthropic lane leaves no ledger row at all. Over 30
   minutes, anthropic / web-ai-proxy had 12 PROMPT_BLOCKED, 5 PROMPT_REDACTED and 1
   PROMPT_SUBMITTED (the W13 warn degrade) against roughly eight clean allows, while the
   Codex lane recorded a PROMPT_SUBMITTED for every allow (4 of 4). "How much traffic went
   through this proxy" is answerable for Codex and not for Claude Code.

8. The Codex lane refuses an anonymous stream. A POST /proxy/openai/v1/responses with no
   Session-Id, Thread-Id or X-Codex-Parent-Thread-Id header is held with
   missing_session_identity and never dispatched. Fail-closed and defensible, but any
   Responses client that does not send one of those headers cannot work through the proxy at
   all. Recorded because it cost a probe round to discover.

## Not exercised

- The WebSocket-v2 Codex transport: the daemon answers a responses_websockets upgrade with
  426 by design, so only the SSE fallback was measured.
- TLS to the upstream. The capture server is plain HTTP on loopback. Intercepting a real TLS
  upstream on Windows would need a CA in the machine root store, which this lane will not
  add; the proxy has no "trust this test CA" option.
- proxy.failMode = "open". The site policy is closed and this lane did not change org policy.
- Attachment/upload gating, egress-allowlist blocking, the allow-once release path, and
  delegated approvals.

## Setup notes (how to re-run)

1. Harness binary: `git worktree add -b p47/wire-lane-harness /c/cwt/p47-wire-lane
   p47/fix-system-exfil`, apply harness-seam.patch, then
   `go build -ldflags "-X main.version=7.10.99" -o <ISO>/devoid.exe ./cmd/devoid`.
   The binary MUST be named devoid.exe - argv[0] selects daemon mode versus shim mode.
2. Credentials: `node gen-agent-credentials-wire.cjs`. It mints a cli_agent key for the
   existing demo org and site into %TEMP%\devoid-p47-wire\home\.devoid\credentials.json and
   never prints the token. A second daemon on this machine also needs
   DEVOID_TEST_FINGERPRINT_SALT, or the backend refuses re-enrolment with
   SIGNED_REENROLL_REQUIRED.
3. Capture server: `node fake-upstream.cjs` on 127.0.0.1:19399. Its response shape is read
   from upstream-mode.json on every request, so it can be switched without a restart.
4. Daemon: `bash run-daemon-wire.sh` (port 19391, loopback upstream override, dead
   HTTPS_PROXY guard).
5. Probes: `node drive-wire.cjs [--stream] [--interactive] [--tag NAME] [--only NAME]`,
   `node drive-extra.cjs`, `node drive-openai.cjs`, `node drive-openai-downlink.cjs`,
   `node drive-hook-compare.cjs`. Readers: `node analyze.cjs <tag>` and
   `node analyze-sse.cjs <tag>`.
6. Fixtures live in fixtures.b64.json and fixtures-extra.b64.json as base64 and are decoded
   at run time. Every secret in them is synthetic and was generated locally for this run;
   throwaway-key.pem is a throwaway 2048-bit RSA key with no other use.
