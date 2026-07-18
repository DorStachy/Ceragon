package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/codefense/cli-wrapper/internal/aipolicycontract"
)

const (
	consumer       = "installer"
	driverID       = "C07_INSTALLER_SEMANTIC_V1"
	artifactSHA256 = "sha256:1bb9aed7553750f0161dadaba531583101d34eef2b35110e326d4d4a20153826"
)

var (
	hex40       = regexp.MustCompile(`^[0-9a-f]{40}$`)
	hex64       = regexp.MustCompile(`^[0-9a-f]{64}$`)
	sha256Token = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)

	envelopeEnvironmentKeys = []string{
		"CERAGON_C07_CONSUMER",
		"CERAGON_C07_DRIVER_BYTES",
		"CERAGON_C07_DRIVER_ID",
		"CERAGON_C07_DRIVER_SHA256",
		"CERAGON_C07_INPUT_IMAGE_ID",
		"CERAGON_C07_RUN_CHALLENGE",
		"CERAGON_C07_SNAPSHOT_MANIFEST_SHA256",
		"CERAGON_C07_SOURCE_COMMIT",
		"CERAGON_C07_SOURCE_TREE",
	}

	consumerFiles = map[string]string{
		"go.mod":                                                                         "sha256:c2d38eebd5e2c2e8ec03d26b6c942461bb5bff3ac69e8e02e8b8265fa9177ea2",
		"internal/aipolicycontract/accessors.go":                                         "sha256:7d77784bfce79cdc22a518726a43daacc46ceecf6d1090e8c5fcd9ff318cd807",
		"internal/aipolicycontract/contract.go":                                          "sha256:190a392d2ba072a8cbb3d6259cb6f8c1ace8d02e12f6c6b5be47979638ea6efc",
		"internal/aipolicycontract/findings.go":                                          "sha256:f9076509f2c0c93cd728644fc4bc31cf581740cbd4baffe4e203b279dd2fa156",
		"internal/aipolicycontract/ranks.go":                                             "sha256:9c8cb90c5564314ef2546354cf2ff0985a98b92de50a8cf132a508da3d82e812",
		"internal/aipolicycontract/reader.go":                                            "sha256:12a4f0e3def5ea555197fe142df3d6668f57e80b2701ba70022a055f4735bfd2",
		"internal/aipolicycontract/runtime_schema.go":                                    "sha256:dbbae3d31ab851774d799419f58188efa5570373f4e3cc33eed2fa255a02ee94",
		"internal/aipolicycontract/tokens.go":                                            "sha256:0a32f6bda7c52c3faace41f6616ffb6f566a49f8cf0e1a7d9a05992333725322",
		"internal/aipolicycontract/trust_anchor.go":                                      "sha256:33a1a22fb3c79b6d5b7d82c2d4f8571cc062bb3940603fa6f7c6ca9560229f0f",
		"internal/aipolicycontract/consumer-pin.v1.json":                                 "sha256:95868f60105999cce0cd67687258b0b3c7a69cf9c23055e9247d0d3286796003",
		"internal/aipolicycontract/embedded/0.3.0/portable-contract.v1.jcs.json":         "sha256:1bb9aed7553750f0161dadaba531583101d34eef2b35110e326d4d4a20153826",
		"internal/aipolicycontract/embedded/0.3.0/portable-contract-release.v1.jcs.json": "sha256:91d95d99ec2d916260be4afd360e482d938419b871831d6757f66476523d5686",
		"internal/aipolicycontract/embedded/0.3.0/portable-contract.v1.jcs.json.sha256":  "sha256:bb1949874d3da79c204c4e76dc8abd08a0a29753a773b79c02642dc80c49d5dc",
	}
)

type bindings struct {
	runChallenge           string
	sourceCommit           string
	sourceTree             string
	snapshotManifestSHA256 string
	inputImageID           string
	driverBytes            int
	driverSHA256           string
}

type caseDefinition struct {
	id               string
	vectorIDs        []string
	operationIndexes []int
	protocolVersion  string
}

var caseDefinitions = []caseDefinition{
	{id: "CURRENT_V1_ACCEPTED_RANKABLE", vectorIDs: []string{"TOLERANT-V1-EFFECTIVE-BRANCH"}, protocolVersion: "1"},
	{id: "LEGACY_N_MINUS_ONE_ACCEPTED", vectorIDs: []string{"TOLERANT-V1-LEGACY-BRANCH"}, protocolVersion: "1"},
	{id: "PROTOCOL_2_READABLE_WITH_WRITER_DISABLED", vectorIDs: []string{"TOLERANT-V1-EFFECTIVE-BRANCH"}, protocolVersion: "2"},
	{id: "FUTURE_PROTOCOL_DEGRADED_NONRANKABLE", vectorIDs: []string{"TOLERANT-V1-EFFECTIVE-BRANCH"}, protocolVersion: "3"},
	{id: "ADDITIVE_UNKNOWN_FIELDS_DEGRADED_NONRANKABLE", vectorIDs: []string{"TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED"}, operationIndexes: []int{3, 11}, protocolVersion: "2"},
	{id: "UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW", vectorIDs: []string{"TOLERANT-V1-FORWARD-ADDITIVE-AND-ENUM-DEGRADED"}, protocolVersion: "2"},
	{id: "MISSING_REQUIRED_FIELDS_INVALID", vectorIDs: []string{"TOLERANT-V1-MISSING-FULL-SECTION", "TOLERANT-V1-MISSING-CURRENT-ACTION-KEY"}, protocolVersion: "1"},
	{id: "KNOWN_FIELD_WRONG_TYPE_INVALID", vectorIDs: []string{"TOLERANT-V1-KNOWN-FIELD-WRONG-TYPE"}, protocolVersion: "1"},
}

func failUnless(condition bool) {
	if !condition {
		panic("C07 installer semantic driver invariant failed")
	}
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func canonicalJSON(value any) []byte {
	encoded, err := json.Marshal(value)
	failUnless(err == nil)
	return encoded
}

func canonicalBytes(value any) []byte {
	return append(canonicalJSON(value), '\n')
}

func cloneJSON(value any) any {
	decoder := json.NewDecoder(bytes.NewReader(canonicalJSON(value)))
	decoder.UseNumber()
	var cloned any
	failUnless(decoder.Decode(&cloned) == nil)
	return cloned
}

func exactAbsolutePath(value string) string {
	failUnless(len(value) >= 2 && len(value) <= 4096)
	failUnless(strings.HasPrefix(value, "/") && !strings.Contains(value, "\\") && !strings.ContainsRune(value, 0))
	failUnless(path.Clean(value) == value)
	return value
}

func readDigestBoundFile(filePath, expected string) []byte {
	data, err := os.ReadFile(exactAbsolutePath(filePath))
	failUnless(err == nil && len(data) > 0 && digest(data) == expected)
	return data
}

func readBindings(driverSourcePath string) bindings {
	actualKeys := make([]string, 0, len(envelopeEnvironmentKeys))
	values := make(map[string]string, len(envelopeEnvironmentKeys))
	for _, entry := range os.Environ() {
		key, value, found := strings.Cut(entry, "=")
		if found && strings.HasPrefix(key, "CERAGON_C07_") {
			actualKeys = append(actualKeys, key)
			values[key] = value
		}
	}
	sort.Strings(actualKeys)
	failUnless(bytes.Equal(canonicalJSON(actualKeys), canonicalJSON(envelopeEnvironmentKeys)))
	failUnless(hex64.MatchString(values["CERAGON_C07_RUN_CHALLENGE"]))
	failUnless(values["CERAGON_C07_CONSUMER"] == consumer)
	failUnless(hex40.MatchString(values["CERAGON_C07_SOURCE_COMMIT"]))
	failUnless(hex40.MatchString(values["CERAGON_C07_SOURCE_TREE"]))
	failUnless(sha256Token.MatchString(values["CERAGON_C07_SNAPSHOT_MANIFEST_SHA256"]))
	failUnless(sha256Token.MatchString(values["CERAGON_C07_INPUT_IMAGE_ID"]))
	failUnless(values["CERAGON_C07_DRIVER_ID"] == driverID)
	driverByteCount, err := strconv.Atoi(values["CERAGON_C07_DRIVER_BYTES"])
	failUnless(err == nil && driverByteCount >= 1 && driverByteCount <= 1_048_576)
	failUnless(strconv.Itoa(driverByteCount) == values["CERAGON_C07_DRIVER_BYTES"])
	failUnless(sha256Token.MatchString(values["CERAGON_C07_DRIVER_SHA256"]))
	driverSource := readDigestBoundFile(driverSourcePath, values["CERAGON_C07_DRIVER_SHA256"])
	failUnless(len(driverSource) == driverByteCount)
	return bindings{
		runChallenge:           values["CERAGON_C07_RUN_CHALLENGE"],
		sourceCommit:           values["CERAGON_C07_SOURCE_COMMIT"],
		sourceTree:             values["CERAGON_C07_SOURCE_TREE"],
		snapshotManifestSHA256: values["CERAGON_C07_SNAPSHOT_MANIFEST_SHA256"],
		inputImageID:           values["CERAGON_C07_INPUT_IMAGE_ID"],
		driverBytes:            driverByteCount,
		driverSHA256:           values["CERAGON_C07_DRIVER_SHA256"],
	}
}

func verifyConsumerFiles(driverSourcePath string) {
	failUnless(strings.HasSuffix(driverSourcePath, "/cmd/c07semanticdriver/main.go"))
	moduleRoot := path.Clean(path.Join(path.Dir(driverSourcePath), "../.."))
	paths := make([]string, 0, len(consumerFiles))
	for relative := range consumerFiles {
		paths = append(paths, relative)
	}
	sort.Strings(paths)
	for _, relative := range paths {
		readDigestBoundFile(path.Join(moduleRoot, relative), consumerFiles[relative])
	}
}

func object(value any) map[string]any {
	result, ok := value.(map[string]any)
	failUnless(ok)
	return result
}

func array(value any) []any {
	result, ok := value.([]any)
	failUnless(ok)
	return result
}

func text(value any) string {
	result, ok := value.(string)
	failUnless(ok)
	return result
}

func applyOperations(document map[string]any, operations []any) {
	for _, rawOperation := range operations {
		operation := object(rawOperation)
		operationName := text(operation["op"])
		pointer := text(operation["path"])
		failUnless(operationName == "add" || operationName == "replace" || operationName == "remove")
		failUnless(strings.HasPrefix(pointer, "/"))
		segments := strings.Split(pointer, "/")[1:]
		for index := range segments {
			segments[index] = strings.ReplaceAll(strings.ReplaceAll(segments[index], "~1", "/"), "~0", "~")
		}
		failUnless(len(segments) > 0)
		parent := document
		for _, segment := range segments[:len(segments)-1] {
			parent = object(parent[segment])
		}
		key := segments[len(segments)-1]
		if operationName == "remove" {
			_, present := parent[key]
			failUnless(present)
			delete(parent, key)
		} else {
			parent[key] = cloneJSON(operation["value"])
		}
	}
}

func materializeInput(artifact map[string]any, definition caseDefinition) map[string]any {
	schemaCases := object(object(artifact["v1Policy"])["schemaCases"])
	validationCases := array(schemaCases["validationCases"])
	baseDocuments := object(schemaCases["baseDocuments"])
	entries := make([]any, 0, len(definition.vectorIDs))
	for _, vectorID := range definition.vectorIDs {
		var vector map[string]any
		for _, candidate := range validationCases {
			candidateObject := object(candidate)
			if candidateObject["id"] == vectorID {
				vector = candidateObject
				break
			}
		}
		failUnless(vector != nil && vector["schema"] == "tolerant-read")
		var document map[string]any
		if documentRef, present := vector["documentRef"]; present {
			document = object(cloneJSON(baseDocuments[text(documentRef)]))
		} else {
			document = object(cloneJSON(vector["document"]))
		}
		operations := []any{}
		if rawOperations, present := vector["operations"]; present {
			operations = array(rawOperations)
		}
		if definition.operationIndexes != nil {
			selected := make([]any, 0, len(definition.operationIndexes))
			for _, index := range definition.operationIndexes {
				failUnless(index >= 0 && index < len(operations))
				selected = append(selected, operations[index])
			}
			operations = selected
		}
		applyOperations(document, operations)
		entries = append(entries, map[string]any{
			"vectorId":        vectorID,
			"protocolVersion": definition.protocolVersion,
			"document":        document,
		})
	}
	return map[string]any{"entries": entries}
}

func canonicalRows(rows []any) []any {
	sort.Slice(rows, func(left, right int) bool {
		return bytes.Compare(canonicalJSON(rows[left]), canonicalJSON(rows[right])) < 0
	})
	return rows
}

func projectedProtocol(token aipolicycontract.TokenRead) map[string]any {
	state := string(token.State)
	failUnless(state == "known" || state == "degraded" || state == "invalid")
	var value any
	var reason any
	if token.State == aipolicycontract.TokenKnown {
		value = token.Value
		reason = nil
	} else {
		value = nil
		reason = string(token.Reason)
	}
	return map[string]any{
		"state":    state,
		"rawToken": token.RawToken,
		"value":    value,
		"reason":   reason,
	}
}

func projectedResult(vectorID string, result aipolicycontract.PolicyReadResult) map[string]any {
	policy, retained := result.PolicyJSON()
	var policyDigest any
	if retained {
		policyDigest = digest(policy)
	}
	degradedTokens := make([]any, 0)
	for _, finding := range result.DegradedTokens() {
		degradedTokens = append(degradedTokens, map[string]any{"kind": finding.Kind, "path": finding.Path, "rawToken": finding.RawToken})
	}
	unknownFields := make([]any, 0)
	for _, finding := range result.UnknownFields() {
		unknownFields = append(unknownFields, map[string]any{"path": finding.Path})
	}
	validationErrors := make([]any, 0)
	for _, finding := range result.ValidationErrors() {
		validationErrors = append(validationErrors, map[string]any{"path": finding.Path, "keyword": finding.Keyword})
	}
	return map[string]any{
		"vectorId":         vectorID,
		"protocol":         projectedProtocol(result.Protocol),
		"policySha256":     policyDigest,
		"degradedTokens":   canonicalRows(degradedTokens),
		"unknownFields":    canonicalRows(unknownFields),
		"validationErrors": canonicalRows(validationErrors),
		"state":            string(result.State),
		"rankingEligible":  result.RankingEligible,
	}
}

type rankEntry struct {
	token string
	rank  int
}

type rankFamily struct {
	name           string
	read           func(any) aipolicycontract.TokenRead
	rank           func(aipolicycontract.TokenRead) (int, bool)
	ranks          []rankEntry
	representative string
}

func buildRankOracle() map[string]any {
	families := []rankFamily{
		{
			name: "dlp", read: aipolicycontract.ReadDLPAction, rank: aipolicycontract.RankDLPAction,
			ranks: []rankEntry{{"allow", 0}, {"warn", 1}, {"redact", 2}, {"block", 3}}, representative: "block",
		},
		{
			name: "prompt", read: aipolicycontract.ReadPromptAction, rank: aipolicycontract.RankPromptAction,
			ranks: []rankEntry{{"allow", 0}, {"warn", 1}, {"block", 2}}, representative: "block",
		},
		{
			name: "upload", read: aipolicycontract.ReadUploadAction, rank: aipolicycontract.RankUploadAction,
			ranks: []rankEntry{{"allow", 0}, {"warn", 1}, {"block", 2}}, representative: "block",
		},
		{
			name: "exclusion", read: aipolicycontract.ReadExclusionAction, rank: aipolicycontract.RankExclusionAction,
			ranks: []rankEntry{{"allow", 0}, {"block", 1}}, representative: "block",
		},
		{
			name: "governance", read: aipolicycontract.ReadGovernanceMode, rank: aipolicycontract.RankGovernanceMode,
			ranks: []rankEntry{{"", 0}, {"monitor", 1}, {"enforce", 2}}, representative: "enforce",
		},
		{
			name: "enforcementTier", read: aipolicycontract.ReadEnforcementTier, rank: aipolicycontract.RankEnforcementTier,
			ranks: []rankEntry{{"detect", 0}, {"strict", 1}}, representative: "strict",
		},
		{
			name: "proxyFailMode", read: aipolicycontract.ReadProxyFailMode, rank: aipolicycontract.RankProxyFailMode,
			ranks: []rankEntry{{"open", 0}, {"closed", 1}}, representative: "closed",
		},
		{
			name: "ingress", read: aipolicycontract.ReadIngressAction, rank: aipolicycontract.RankIngressAction,
			ranks: []rankEntry{{"off", 0}, {"warn", 1}, {"redact", 2}, {"hold", 3}}, representative: "hold",
		},
	}
	knownRanks := make(map[string]any, len(families))
	unknownRanks := make([]any, 0, len(families))
	forgedRanks := make([]any, 0, len(families))
	crossFamilyRanks := make(map[string]any, len(families))
	for _, target := range families {
		familyRanks := make(map[string]int, len(target.ranks))
		for _, entry := range target.ranks {
			issued := target.read(entry.token)
			failUnless(
				issued.State == aipolicycontract.TokenKnown &&
					issued.RawToken == entry.token &&
					issued.Value == entry.token &&
					issued.Reason == "",
			)
			actualRank, rankable := target.rank(issued)
			failUnless(rankable && actualRank == entry.rank)
			familyRanks[entry.token] = actualRank
		}
		knownRanks[target.name] = familyRanks

		unknownRank, unknownRankable := target.rank(target.read("future-token"))
		failUnless(!unknownRankable && unknownRank == 0)
		unknownRanks = append(unknownRanks, nil)

		forgedRank, forgedRankable := target.rank(aipolicycontract.TokenRead{
			State: aipolicycontract.TokenKnown, RawToken: target.representative, Value: target.representative,
		})
		failUnless(!forgedRankable && forgedRank == 0)
		forgedRanks = append(forgedRanks, nil)

		mutated := target.read(target.representative)
		mutated.RawToken = target.ranks[0].token
		mutated.Value = target.ranks[0].token
		mutationRank, mutationRankable := target.rank(mutated)
		failUnless(!mutationRankable && mutationRank == 0)

		serialized, err := json.Marshal(target.read(target.representative))
		failUnless(err == nil)
		var reconstructed aipolicycontract.TokenRead
		failUnless(json.Unmarshal(serialized, &reconstructed) == nil)
		reconstructedRank, reconstructedRankable := target.rank(reconstructed)
		failUnless(!reconstructedRankable && reconstructedRank == 0)

		crossRanks := make(map[string]any, len(families)-1)
		for _, source := range families {
			if source.name == target.name {
				continue
			}
			sourceToken := source.read(source.representative)
			crossRank, crossRankable := target.rank(sourceToken)
			failUnless(!crossRankable && crossRank == 0)
			crossRanks[source.name] = nil
		}
		crossFamilyRanks[target.name] = crossRanks
	}
	return map[string]any{
		"familyCount":      len(families),
		"knownRanks":       knownRanks,
		"unknownRanks":     unknownRanks,
		"forgedRanks":      forgedRanks,
		"crossFamilyRanks": crossFamilyRanks,
	}
}

func metadataObservation() map[string]any {
	failUnless(aipolicycontract.SelfCheck() == nil)
	metadata := aipolicycontract.ContractMetadata()
	failUnless(bytes.Equal(canonicalJSON(metadata.ReadableProtocolVersions), canonicalJSON([]string{"1", "2"})))
	failUnless(bytes.Equal(canonicalJSON(metadata.WritableProtocolVersions), canonicalJSON([]string{"1"})))
	failUnless(!metadata.RuntimeActivatable && !metadata.SignedRuntimePolicyBundle && !metadata.V2WriterEnabled)
	failUnless(metadata.ArtifactDigest == artifactSHA256)
	return map[string]any{
		"readableVersions":          metadata.ReadableProtocolVersions,
		"writableVersions":          metadata.WritableProtocolVersions,
		"runtimeActivatable":        metadata.RuntimeActivatable,
		"signedRuntimePolicyBundle": metadata.SignedRuntimePolicyBundle,
		"v2WriterEnabled":           metadata.V2WriterEnabled,
	}
}

func buildSemanticReceipt(artifact map[string]any) map[string]any {
	metadata := metadataObservation()
	cases := make([]any, 0, len(caseDefinitions))
	catalogEntries := make([]any, 0, len(caseDefinitions))
	for _, definition := range caseDefinitions {
		input := materializeInput(artifact, definition)
		entries := array(input["entries"])
		results := make([]any, 0, len(entries))
		for _, rawEntry := range entries {
			entry := object(rawEntry)
			documentBytes := canonicalBytes(entry["document"])
			result := aipolicycontract.ReadPolicy(documentBytes, entry["protocolVersion"])
			results = append(results, projectedResult(text(entry["vectorId"]), result))
		}
		observation := map[string]any{
			"metadata":   cloneJSON(metadata),
			"results":    results,
			"rankOracle": nil,
		}
		if definition.id == "UNKNOWN_SECURITY_TOKENS_NEVER_RANK_ALLOW" {
			observation["rankOracle"] = buildRankOracle()
		}
		caseRow := map[string]any{
			"id":                definition.id,
			"inputSha256":       digest(canonicalBytes(input)),
			"observationSha256": digest(canonicalBytes(observation)),
			"observation":       observation,
		}
		cases = append(cases, caseRow)
		catalogEntries = append(catalogEntries, map[string]any{
			"caseId":            definition.id,
			"inputSha256":       caseRow["inputSha256"],
			"observationSha256": caseRow["observationSha256"],
			"resultCount":       len(results),
		})
	}
	catalog := map[string]any{
		"format":        "ceragon.ai-security.semantic-case-catalog",
		"formatVersion": 1,
		"oracleVersion": "C07_EXACT_COMPATIBILITY_ORACLE_V1",
		"consumer":      consumer,
		"driverId":      driverID,
		"entries":       catalogEntries,
	}
	return map[string]any{
		"format":            "ceragon.ai-security.semantic-receipt",
		"formatVersion":     1,
		"driverId":          driverID,
		"artifactSha256":    artifactSHA256,
		"caseCatalogSha256": digest(canonicalBytes(catalog)),
		"cases":             cases,
	}
}

func run() {
	failUnless(len(os.Args) == 3)
	artifactPath := exactAbsolutePath(os.Args[1])
	driverSourcePath := exactAbsolutePath(os.Args[2])
	bound := readBindings(driverSourcePath)
	verifyConsumerFiles(driverSourcePath)
	artifactBytes := readDigestBoundFile(artifactPath, artifactSHA256)
	decoder := json.NewDecoder(bytes.NewReader(artifactBytes))
	decoder.UseNumber()
	var artifact map[string]any
	failUnless(decoder.Decode(&artifact) == nil)
	failUnless(artifact["format"] == "ceragon.ai-security.portable-contract")
	semanticReceipt := buildSemanticReceipt(artifact)
	envelope := map[string]any{
		"format":                 "ceragon.ai-security.contained-semantic-envelope",
		"formatVersion":          1,
		"runChallenge":           bound.runChallenge,
		"consumer":               consumer,
		"sourceCommit":           bound.sourceCommit,
		"sourceTree":             bound.sourceTree,
		"snapshotManifestSha256": bound.snapshotManifestSHA256,
		"inputImageId":           bound.inputImageID,
		"driverId":               driverID,
		"driverBytes":            bound.driverBytes,
		"driverSha256":           bound.driverSHA256,
		"semanticReceipt":        semanticReceipt,
	}
	_, err := os.Stdout.Write(canonicalBytes(envelope))
	failUnless(err == nil)
}

func main() {
	func() {
		defer func() {
			if recover() != nil {
				os.Exit(1)
			}
		}()
		run()
	}()
}
