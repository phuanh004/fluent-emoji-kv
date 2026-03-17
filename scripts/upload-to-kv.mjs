#!/usr/bin/env node
/**
 * Upload emoji WebP files to Cloudflare KV as base64.
 * Key format: anim:<unicode> or static:<unicode>
 *
 * Usage: node scripts/upload-to-kv.mjs
 * Requires: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars
 *           KV namespace ID configured in wrangler.jsonc
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANIM_DIR = join(ROOT, 'assets', 'anim');
const STATIC_DIR = join(ROOT, 'assets', 'static');

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const KV_NAMESPACE = process.env.KV_NAMESPACE_ID;

if (!CF_TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN env var');
  process.exit(1);
}
if (!CF_ACCOUNT) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID env var');
  process.exit(1);
}
if (!KV_NAMESPACE) {
  console.error('Set KV_NAMESPACE_ID env var');
  process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/storage/kv/namespaces/${KV_NAMESPACE}`;

async function uploadBatch(entries) {
  const res = await fetch(`${API}/bulk`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(entries),
  });
  const data = await res.json();
  return data.success;
}

async function main() {
  const animFiles = readdirSync(ANIM_DIR).filter((f) => f.endsWith('.webp'));
  const staticFiles = readdirSync(STATIC_DIR).filter((f) => f.endsWith('.webp'));

  console.log(`Uploading ${animFiles.length} animated + ${staticFiles.length} static emojis to KV...`);

  // Build KV entries (bulk API accepts max 10000 per request, 25MB total)
  const BATCH_SIZE = 100;
  let uploaded = 0;

  // Upload animated
  for (let i = 0; i < animFiles.length; i += BATCH_SIZE) {
    const batch = animFiles.slice(i, i + BATCH_SIZE).map((file) => {
      const unicode = basename(file, '.webp');
      const buf = readFileSync(join(ANIM_DIR, file));
      return {
        key: `anim:${unicode}`,
        value: buf.toString('base64'),
        base64: true,
      };
    });

    const ok = await uploadBatch(batch);
    uploaded += batch.length;
    process.stdout.write(`\r  Animated: ${uploaded}/${animFiles.length} ${ok ? '✓' : '✗'}`);
  }
  console.log();

  // Upload static
  uploaded = 0;
  for (let i = 0; i < staticFiles.length; i += BATCH_SIZE) {
    const batch = staticFiles.slice(i, i + BATCH_SIZE).map((file) => {
      const unicode = basename(file, '.webp');
      const buf = readFileSync(join(STATIC_DIR, file));
      return {
        key: `static:${unicode}`,
        value: buf.toString('base64'),
        base64: true,
      };
    });

    const ok = await uploadBatch(batch);
    uploaded += batch.length;
    process.stdout.write(`\r  Static: ${uploaded}/${staticFiles.length} ${ok ? '✓' : '✗'}`);
  }
  console.log();

  console.log(`\nDone! Total: ${animFiles.length + staticFiles.length} emojis uploaded to KV.`);
}

main();
