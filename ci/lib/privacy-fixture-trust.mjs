import { createHash } from 'node:crypto';

// Backend candidates cannot change the trusted workspace runner's reviewed
// pin. The helper has an explicit LF Git attribute; verify the exact bytes
// executed on the host without text decoding or checkout normalization.
export function assertTrustedPrivacyFixtureSource(source, expectedSha256) {
  const actual = createHash('sha256').update(source).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '') || actual !== expectedSha256) {
    throw new Error('Candidate privacy fixture helper differs from the trusted CI pin; review it before host execution');
  }
}

export function privacyFixtureHostEnvironment(environment, scope, network) {
  const selected = {};
  for (const [key, value] of Object.entries(environment)) {
    if (/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|SSL_CERT_FILE|SSL_CERT_DIR)$/i.test(key)) {
      selected[key] = value;
    }
  }
  return { ...selected, PRIVACY_FIXTURE_SCOPE: scope, PRIVACY_FIXTURE_NETWORK: network };
}
