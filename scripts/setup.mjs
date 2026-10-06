#!/usr/bin/env node
// One-time setup: generates the workflow RSA key pair.
// Public key is committed; private key goes into the WORKFLOW_PRIVATE_KEY secret.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateWorkflowKeyPair } from '../shared/crypto.js';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: resolve(import.meta.dirname, '../keys') },
    force: { type: 'boolean', default: false },
  },
});

const file = join(values.out, 'workflow-public.jwk');
const exists = await access(file).then(() => true, () => false);
if (exists && !values.force) {
  console.error(`${file} already exists. Re-run with --force to replace it.`);
  console.error('Replacing keys does not affect existing reports, but runs started before the secret is updated will fail.');
  process.exit(1);
}

const { publicJwk, privateJwk } = await generateWorkflowKeyPair();
await mkdir(values.out, { recursive: true });
await writeFile(file, JSON.stringify(publicJwk, null, 2) + '\n');

console.log(`Wrote ${file} — commit this file.`);
console.log('\nAdd the line below as the GitHub secret WORKFLOW_PRIVATE_KEY (Settings → Secrets and variables → Actions).');
console.log('Do not save it anywhere else.\n');
console.log('-----BEGIN WORKFLOW_PRIVATE_KEY-----');
console.log(JSON.stringify(privateJwk));
console.log('-----END WORKFLOW_PRIVATE_KEY-----');
