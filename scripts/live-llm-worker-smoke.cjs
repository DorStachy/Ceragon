'use strict';

const path = require('path');

const root = path.resolve(__dirname, '..');

function requireFrom(relativePath) {
  return require(path.join(root, relativePath));
}

async function runStaticWorkerSmoke() {
  const { AIAnalyzer } = requireFrom('Static-Worker/dist/analyzer/ai-analyzer');
  const { Logger } = requireFrom('Static-Worker/dist/logger');
  const { llmGenerate } = requireFrom('Static-Worker/dist/utils/llm-client');

  const analyzer = new AIAnalyzer(new Logger());
  const wrapperText = await analyzer.generateContent(
    'Respond with exactly this JSON: {"ok":true,"surface":"static-ai-analyzer"}',
    'Return JSON only.',
    64,
    0,
  );
  if (!wrapperText) throw new Error('Static worker AIAnalyzer wrapper returned null');

  const clientResult = await llmGenerate({
    systemPrompt: 'Return JSON only.',
    userPrompt: 'Respond with exactly this JSON: {"ok":true,"surface":"static-llm-client"}',
    maxTokens: 64,
    temperature: 0,
    jsonMode: true,
    timeoutMs: 45000,
  });
  if (!clientResult) throw new Error('Static worker llmGenerate returned null');

  return {
    ok: true,
    wrapperResponse: wrapperText.slice(0, 160),
    provider: clientResult.provider,
    model: clientResult.model,
    latencyMs: clientResult.latencyMs,
    clientResponse: clientResult.text.slice(0, 160),
  };
}

async function runSandboxWorkerSmoke() {
  const { AIVerdictEngine } = requireFrom('Sandbox-Worker/dist/analyzer/ai-verdict-engine');
  const { llmGenerate } = requireFrom('Sandbox-Worker/dist/utils/llm-client');

  const engine = new AIVerdictEngine({ timeoutMs: 90000 });
  const wrapperResult = await engine.generateContent(
    'Respond with exactly this JSON: {"verdict":"WARN","confidence":77,"risk_score":61,"reasoning":"sandbox wrapper smoke","summary":"sandbox wrapper smoke","execution_narrative":"none","mitre_tactics":[],"key_indicators":[],"recommended_action":"review"}',
  );
  if (!wrapperResult) throw new Error('Sandbox worker generateContent returned null');

  const clientResult = await llmGenerate({
    systemPrompt: 'Return JSON only.',
    userPrompt: 'Respond with exactly this JSON: {"ok":true,"surface":"sandbox-llm-client"}',
    maxTokens: 96,
    temperature: 0,
    jsonMode: true,
    timeoutMs: 45000,
  });
  if (!clientResult) throw new Error('Sandbox worker llmGenerate returned null');

  return {
    ok: true,
    provider: wrapperResult.provider,
    model: wrapperResult.model,
    latencyMs: wrapperResult.latencyMs,
    wrapperResponse: wrapperResult.text.slice(0, 160),
    clientProvider: clientResult.provider,
    clientModel: clientResult.model,
    clientResponse: clientResult.text.slice(0, 160),
  };
}

async function runScannerWorkerSmoke() {
  const { llmGenerate } = requireFrom('GithubApp-Bot-Scanner-Worker/scanner-worker/dist/utils/llm-client');
  const result = await llmGenerate({
    systemPrompt: 'Return JSON only.',
    userPrompt: 'Respond with exactly this JSON: {"ok":true,"surface":"scanner-llm-client"}',
    maxTokens: 64,
    temperature: 0,
    jsonMode: true,
    timeoutMs: 45000,
  });
  if (!result) throw new Error('Scanner worker llmGenerate returned null');

  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    response: result.text.slice(0, 160),
  };
}

async function main() {
  const summary = {
    staticWorker: null,
    sandboxWorker: null,
    scannerWorker: null,
  };

  summary.staticWorker = await runStaticWorkerSmoke();
  summary.sandboxWorker = await runSandboxWorkerSmoke();
  summary.scannerWorker = await runScannerWorkerSmoke();

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});