#!/usr/bin/env node
/**
 * Download Microsoft Fluent 3D Emoji (animated + static) from lobehub CDN.
 * Saves to assets/anim/ and assets/static/ as WebP files.
 *
 * Usage: node scripts/download-emojis.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANIM_DIR = join(ROOT, 'assets', 'anim');
const STATIC_DIR = join(ROOT, 'assets', 'static');

mkdirSync(ANIM_DIR, { recursive: true });
mkdirSync(STATIC_DIR, { recursive: true });

// Read emoji list from scratch-to-see project
const emojiList = JSON.parse(readFileSync('/tmp/emoji-list.json', 'utf8'));

function emojiToUnicode(emoji) {
  return [...emoji]
    .map((c) => c.codePointAt(0).toString(16))
    .filter(Boolean)
    .join('-');
}

function getAnimPkg(emoji) {
  const main = emojiToUnicode(emoji).split('-')[0];
  if (main < '1f469') return '@lobehub/fluent-emoji-anim-1';
  if (main >= '1f469' && main < '1f620') return '@lobehub/fluent-emoji-anim-2';
  if (main >= '1f620' && main < '1f9a0') return '@lobehub/fluent-emoji-anim-3';
  return '@lobehub/fluent-emoji-anim-4';
}

async function downloadFile(url, dest) {
  if (existsSync(dest)) return 'cached';
  try {
    const res = await fetch(url);
    if (!res.ok) return 'failed';
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return 'ok';
  } catch {
    return 'error';
  }
}

async function main() {
  console.log(`Downloading ${emojiList.length} emojis...`);

  let ok = 0, fail = 0, cached = 0;
  const CONCURRENCY = 10;

  for (let i = 0; i < emojiList.length; i += CONCURRENCY) {
    const batch = emojiList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (emoji) => {
        const unicode = emojiToUnicode(emoji);
        const animPkg = getAnimPkg(emoji);

        const animUrl = `https://registry.npmmirror.com/${animPkg}/latest/files/assets/${unicode}.webp`;
        const staticUrl = `https://registry.npmmirror.com/@lobehub/fluent-emoji-3d/latest/files/assets/${unicode}.webp`;

        const [animResult, staticResult] = await Promise.all([
          downloadFile(animUrl, join(ANIM_DIR, `${unicode}.webp`)),
          downloadFile(staticUrl, join(STATIC_DIR, `${unicode}.webp`)),
        ]);

        return { emoji, unicode, animResult, staticResult };
      }),
    );

    for (const r of results) {
      if (r.animResult === 'cached' && r.staticResult === 'cached') cached++;
      else if (r.animResult === 'ok' || r.staticResult === 'ok') ok++;
      else fail++;
    }

    process.stdout.write(`\r  ${i + batch.length}/${emojiList.length} (${ok} new, ${cached} cached, ${fail} failed)`);
  }

  console.log(`\n\nDone! ${ok} downloaded, ${cached} cached, ${fail} failed.`);
  console.log(`  Animated: ${ANIM_DIR}`);
  console.log(`  Static:   ${STATIC_DIR}`);
}

main();
