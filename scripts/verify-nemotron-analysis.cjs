'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const credentialsPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Owner', '.ceragon', 'credentials.json');
const packageDir = path.join(root, 'testing', 'suspicious-test-package');
const packageJsonPath = path.join(packageDir, 'package.json');
const logGroupName = '/ecs/cera-fetch-worker-staging';
const region = 'eu-north-1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AWS_PAGER: '',
    },
    ...options,
  }).trim();
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function packTarball(cwd) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', 'npm pack --json'], { cwd });
  }
  return run(npmCommand(), ['pack', '--json'], { cwd });
}

async function postJson(url, apiKey, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function putBinary(url, filePath) {
  const body = fs.readFileSync(filePath);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Upload failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function postSse(url, apiKey, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 500)}`);
  }

  if (!response.body) {
    throw new Error('SSE response body missing');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });

    while (true) {
      const delimiterIndex = buffer.indexOf('\n\n');
      if (delimiterIndex === -1) break;

      const block = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);

      const lines = block.split(/\r?\n/);
      let eventType = 'message';
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) continue;

      const rawData = dataLines.join('\n');
      let parsedData;
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        parsedData = rawData;
      }

      events.push({ event: eventType, data: parsedData });
      if (eventType === 'done') {
        return events;
      }
    }
  }

  return events;
}

function fetchLogs(correlationId, startTimeMs) {
  const raw = run('aws', [
    'logs',
    'filter-log-events',
    '--no-cli-pager',
    '--log-group-name', logGroupName,
    '--region', region,
    '--start-time', String(startTimeMs),
    '--filter-pattern', correlationId,
    '--output', 'json',
  ]);

  const parsed = JSON.parse(raw || '{"events": []}');
  return (parsed.events || []).map((event) => event.message).filter(Boolean);
}

function fetchLogsByPattern(pattern, startTimeMs) {
  const raw = run('aws', [
    'logs',
    'filter-log-events',
    '--no-cli-pager',
    '--log-group-name', logGroupName,
    '--region', region,
    '--start-time', String(startTimeMs),
    '--filter-pattern', pattern,
    '--output', 'json',
  ]);

  const parsed = JSON.parse(raw || '{"events": []}');
  return (parsed.events || []).map((event) => event.message).filter(Boolean);
}

function tryParseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function summarizeRelevantLogs(lines) {
  return lines
    .map((line) => ({ raw: line, parsed: tryParseJsonLine(line) }))
    .filter(({ raw, parsed }) => {
      const message = parsed?.message || raw;
      return /Running AI analysis|LLM call succeeded|Nemotron returned reasoning without final content|falling back to Gemini|Gemini fallback/i.test(message);
    })
    .map(({ raw, parsed }) => {
      if (!parsed) {
        return { message: raw };
      }
      return {
        timestamp: parsed.timestamp,
        level: parsed.level,
        message: parsed.message,
        context: parsed.context,
      };
    });
}

async function main() {
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const correlationId = `nemotron-verify-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const startTimeMs = Date.now() - 60_000;

  console.log(`Starting verification for ${pkg.name}@${pkg.version}`);
  console.log(`Correlation ID: ${correlationId}`);

  const packOutput = packTarball(packageDir);
  const packInfo = JSON.parse(packOutput);
  const tarballName = Array.isArray(packInfo) ? packInfo[0]?.filename : null;
  if (!tarballName) {
    throw new Error(`Unexpected npm pack output: ${packOutput}`);
  }
  const tarballPath = path.join(packageDir, tarballName);

  try {
    console.log('Requesting upload URL...');
    const upload = await postJson(
      `${credentials.apiBaseUrl}/api/v1/packages/upload-artifact-url`,
      credentials.apiKey,
      {
        ecosystem: 'npm',
        packageName: pkg.name,
        version: pkg.version,
      },
    );

  console.log('Uploading tarball...');
    await putBinary(upload.uploadUrl, tarballPath);

  console.log('Submitting check-packages request...');
    const checkResponse = await postJson(
      `${credentials.apiBaseUrl}/api/v1/packages/check-packages`,
      credentials.apiKey,
      {
        tool: 'npm',
        intent: 'INSTALL',
        targets: [
          {
            name: pkg.name,
            version: pkg.version,
            artifactS3Key: upload.artifactKey,
          },
        ],
        context: {
          os: 'windows',
          arch: 'x64',
          hostname: 'copilot-verifier',
          toolVersion: '10.0.0',
          runtimeVersion: 'v20.0.0',
          registry: 'https://registry.npmjs.org',
          isInteractive: false,
          isCI: true,
        },
        correlationId,
      },
    );

    console.log('Submitting check-packages-stream request...');
    const sseEvents = await postSse(
      `${credentials.apiBaseUrl}/api/v1/packages/check-packages-stream`,
      credentials.apiKey,
      {
        tool: 'npm',
        intent: 'INSTALL',
        targets: [
          {
            name: pkg.name,
            version: pkg.version,
            artifactS3Key: upload.artifactKey,
          },
        ],
        context: {
          os: 'windows',
          arch: 'x64',
          hostname: 'copilot-verifier',
          toolVersion: '10.0.0',
          runtimeVersion: 'v20.0.0',
          registry: 'https://registry.npmjs.org',
          isInteractive: false,
          isCI: true,
        },
        correlationId,
      },
    );

    const allLines = fetchLogs(correlationId, startTimeMs);
    const providerEvent = allLines
      .map((line) => tryParseJsonLine(line))
      .find((entry) => entry?.message === 'LLM call succeeded' && entry?.context?.provider);

    const resultEvent = sseEvents.find((event) => event.event === 'result');
    const pendingSandboxEvent = sseEvents.find((event) => event.event === 'pending_sandbox');
    const finalDecision = resultEvent?.data?.decision || pendingSandboxEvent?.data?.decision || null;

    const summary = {
      correlationId,
      package: `${pkg.name}@${pkg.version}`,
      initialResponse: checkResponse,
      sseEvents,
      finalDecision,
      providerVerified: providerEvent?.context?.provider || null,
      modelVerified: providerEvent?.context?.model || null,
      relevantLogs: summarizeRelevantLogs(allLines),
      recentNemotronWarnings: summarizeRelevantLogs(
        [
          ...fetchLogsByPattern('"Nemotron returned reasoning without final content"', startTimeMs),
          ...fetchLogsByPattern('"Nemotron returned empty content"', startTimeMs),
          ...fetchLogsByPattern('"Nemotron exhausted retries — falling back to Gemini"', startTimeMs),
        ],
      ),
    };

    console.log(JSON.stringify(summary, null, 2));

    if (summary.providerVerified !== 'nemotron') {
      process.exitCode = 2;
    }
  } finally {
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});