// Builds SYNTHETIC secret fixtures for the Codex prompt lane. Rule 5 of the stage-1 brief:
// test secrets must be synthetic - never AWS's documented example key, which the detector
// deliberately grades non-enforcing. The shared corpus' "secret egress: AWS key pair"
// fixture DOES use the documented example key, so it can never block; this file replaces it.
const fs = require('fs');
const crypto = require('crypto');
const b = (s) => Buffer.from(s, 'utf8').toString('base64');
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const B64 = UP + 'abcdefghijklmnopqrstuvwxyz0123456789+/';
const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
const AKIA = 'AK' + 'IA' + pick(UP, 16);
const SECRET = pick(B64, 40);
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const items = [
  { name: 'SYNTHETIC secret egress: AWS key pair', lane: 'prompt',
    expect: 'aws-access-key=block + aws-credential-pair=block per the org policy',
    p: b('deploy config: AWS_ACCESS_KEY_ID=' + AKIA + ' AWS_SECRET_ACCESS_KEY=' + SECRET + ' please debug') },
  { name: 'SYNTHETIC secret egress: AWS access key alone', lane: 'prompt',
    expect: 'aws-access-key=block per the org policy',
    p: b('my key is ' + AKIA + ' - is it valid?') },
  { name: 'SYNTHETIC secret egress: freshly generated RSA private key', lane: 'prompt',
    expect: 'malicious-floor private-key class: never allowed',
    p: b(PEM + '\nwhy does ssh reject this') },
  { name: 'benign twin: an AKIA-shaped word that is not a key', lane: 'prompt',
    expect: 'allow - negative control',
    p: b('the AKIAsomething naming convention in our docs is confusing, rename it?') },
  { name: 'benign twin: prose about credentials with no secret', lane: 'prompt',
    expect: 'allow - negative control',
    p: b('where should AWS access keys be stored for a CI job? no key pasted here.') },
];
const out = process.argv[2];
fs.writeFileSync(out, JSON.stringify(items, null, 2));
console.log('wrote ' + items.length + ' synthetic fixtures -> ' + out);
console.log('AKIA prefix len ' + AKIA.length + ', secret len ' + SECRET.length + ', PEM bytes ' + PEM.length);
