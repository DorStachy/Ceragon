'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function loadSsmSecret(name) {
  return execFileSync('aws', [
    'ssm',
    'get-parameter',
    '--region', 'eu-north-1',
    '--name', name,
    '--with-decryption',
    '--query', 'Parameter.Value',
    '--output', 'text',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
  }).trim();
}

async function main() {
  process.env.NGC_API_KEY = process.env.NGC_API_KEY || loadSsmSecret('/cera/staging/workers/NGC_API_KEY');
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || loadSsmSecret('/cera/staging/workers/GEMINI_API_KEY');

  const { AIAnalyzer } = require(path.join(root, 'Static-Worker', 'dist', 'analyzer', 'ai-analyzer'));
  const { Logger } = require(path.join(root, 'Static-Worker', 'dist', 'logger'));
  const { llmGenerate } = require(path.join(root, 'Static-Worker', 'dist', 'utils', 'llm-client'));

  const pkgDir = path.join(root, 'testing', 'suspicious-test-package');
  const packageJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

  const scripts = packageJson.scripts || {};
  const scriptFileContents = [
    {
      relativePath: 'scripts/preinstall.js',
      content: fs.readFileSync(path.join(pkgDir, 'scripts', 'preinstall.js'), 'utf8'),
    },
    {
      relativePath: 'scripts/postinstall.js',
      content: fs.readFileSync(path.join(pkgDir, 'scripts', 'postinstall.js'), 'utf8'),
    },
  ];

  const logger = new Logger();
  const analyzer = new AIAnalyzer(logger);

  let captured = null;
  const originalGenerateContent = analyzer.generateContent.bind(analyzer);
  analyzer.generateContent = async (systemPrompt, userPrompt, maxTokens, temperature) => {
    captured = { systemPrompt, userPrompt, maxTokens, temperature };
    return originalGenerateContent(systemPrompt, userPrompt, maxTokens, temperature);
  };

  const analysisResult = await analyzer.analyze(
    packageJson.name,
    scripts,
    scriptFileContents,
    'npm',
  );

  if (!captured) {
    throw new Error('Failed to capture analyzer prompt');
  }

  const tokenProbes = [];
  for (const probeTokens of [4096, 8192]) {
    const probeResult = await llmGenerate({
      systemPrompt: captured.systemPrompt,
      userPrompt: captured.userPrompt,
      maxTokens: probeTokens,
      temperature: captured.temperature,
    });

    tokenProbes.push({
      requestedMaxTokens: probeTokens,
      provider: probeResult?.provider || null,
      model: probeResult?.model || null,
      textPreview: probeResult?.text?.slice(0, 180) || null,
      latencyMs: probeResult?.latencyMs || null,
      fallbackReason: probeResult?.fallbackReason || null,
    });
  }

  const summary = {
    package: `${packageJson.name}@${packageJson.version}`,
    analyzerInitialMaxTokens: captured.maxTokens,
    userPromptChars: captured.userPrompt.length,
    systemPromptChars: captured.systemPrompt.length,
    analysisReturned: !!analysisResult,
    analysisResult,
    analysisSummary: analysisResult?.summary || null,
    tokenProbes,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});