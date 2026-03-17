#!/usr/bin/env node
/**
 * Convert animated WebP emoji → frames → SVG (vtracer) → Lottie JSON.
 *
 * Pipeline:
 *   1. magick: extract PNG frames from animated WebP
 *   2. vtracer: trace each frame to SVG (color, stacked, spline)
 *   3. assemble: build Lottie JSON with SVG path data per frame
 *
 * Usage:
 *   node scripts/convert-to-lottie.mjs [--emoji 1f602] [--all]
 *
 * Requires: magick (ImageMagick), vtracer (cargo install vtracer)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANIM_DIR = join(ROOT, 'assets', 'anim');
const LOTTIE_DIR = join(ROOT, 'assets', 'lottie');
const TEMP = join(ROOT, '.tmp');

mkdirSync(LOTTIE_DIR, { recursive: true });
mkdirSync(TEMP, { recursive: true });

const args = process.argv.slice(2);
const singleEmoji = args.includes('--emoji') ? args[args.indexOf('--emoji') + 1] : null;
const doAll = args.includes('--all');

/** Extract frames from animated WebP using ImageMagick */
function extractFrames(webpPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  execSync(`magick "${webpPath}" -coalesce "${join(outDir, 'frame_%04d.png')}"`, {
    stdio: 'pipe',
  });
  return readdirSync(outDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
}

/** Trace a PNG frame to SVG using vtracer */
function traceFrame(pngPath, svgPath) {
  execSync(
    `vtracer --input "${pngPath}" --output "${svgPath}" ` +
      '--colormode color --hierarchical stacked --mode spline ' +
      '--filter_speckle 4 --color_precision 6',
    { stdio: 'pipe' },
  );
}

/** Parse SVG and extract path data */
function parseSvgPaths(svgPath) {
  const svg = readFileSync(svgPath, 'utf8');

  // Extract viewBox dimensions
  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  const [, , , w, h] = vbMatch ? vbMatch[1].split(/\s+/) : [0, 0, 256, 256];

  // Extract all path elements with fill colors
  const paths = [];
  const pathRegex = /<path[^>]*\bd="([^"]+)"[^>]*(?:fill="([^"]*)")?[^>]*\/?>/g;
  const pathRegex2 = /<path[^>]*(?:fill="([^"]*)")?[^>]*\bd="([^"]+)"[^>]*\/?>/g;

  let match;
  // Try both attribute orders
  while ((match = pathRegex.exec(svg)) !== null) {
    paths.push({ d: match[1], fill: match[2] || '#000000' });
  }
  if (paths.length === 0) {
    while ((match = pathRegex2.exec(svg)) !== null) {
      paths.push({ d: match[2], fill: match[1] || '#000000' });
    }
  }

  return { width: Number(w), height: Number(h), paths };
}

/** Convert hex color to Lottie [r,g,b] array (0-1 range) */
function hexToLottieColor(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return [0, 0, 0];
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** Build a Lottie JSON from SVG frame data */
function buildLottie(frames, fps = 24, width = 256, height = 256) {
  const totalFrames = frames.length;

  // Create one shape layer per unique path across all frames
  // For simplicity: use the first frame's paths as the base shapes,
  // with shape keyframes that swap path data per frame
  const firstFrame = frames[0];
  if (!firstFrame || firstFrame.paths.length === 0) {
    return null;
  }

  // Simple approach: one layer per frame, each visible for 1 frame
  const layers = frames.map((frame, i) => ({
    ty: 4, // shape layer
    nm: `frame_${i}`,
    ip: i, // in point
    op: i + 1, // out point (1 frame duration)
    ks: {
      o: { a: 0, k: 100 }, // opacity
      r: { a: 0, k: 0 },
      p: { a: 0, k: [width / 2, height / 2] },
      a: { a: 0, k: [width / 2, height / 2] },
      s: { a: 0, k: [100, 100] },
    },
    shapes: frame.paths.slice(0, 50).map((path) => ({
      // Limit paths per frame to keep file size manageable
      ty: 'gr', // group
      it: [
        {
          ty: 'sh', // shape/path
          ks: { a: 0, k: { c: true, v: [], i: [], o: [] } },
          // Store raw SVG path data as a custom property
          d: path.d,
        },
        {
          ty: 'fl', // fill
          c: { a: 0, k: hexToLottieColor(path.fill) },
          o: { a: 0, k: 100 },
        },
      ],
    })),
  }));

  return {
    v: '5.7.4',
    fr: fps,
    ip: 0,
    op: totalFrames,
    w: width,
    h: height,
    nm: 'fluent-emoji',
    layers,
  };
}

/** Convert one emoji */
function convertEmoji(unicode) {
  const webpPath = join(ANIM_DIR, `${unicode}.webp`);
  if (!existsSync(webpPath)) {
    console.error(`  ${unicode}: WebP not found`);
    return false;
  }

  const lottiePath = join(LOTTIE_DIR, `${unicode}.json`);
  if (existsSync(lottiePath)) {
    return 'cached';
  }

  const frameDir = join(TEMP, unicode, 'frames');
  const svgDir = join(TEMP, unicode, 'svg');
  mkdirSync(svgDir, { recursive: true });

  try {
    // 1. Extract frames
    const frameFiles = extractFrames(webpPath, frameDir);

    // 2. Trace each frame to SVG
    for (const f of frameFiles) {
      const svgFile = f.replace('.png', '.svg');
      traceFrame(join(frameDir, f), join(svgDir, svgFile));
    }

    // 3. Parse SVG paths
    const frames = readdirSync(svgDir)
      .filter((f) => f.endsWith('.svg'))
      .sort()
      .map((f) => parseSvgPaths(join(svgDir, f)));

    // 4. Build Lottie JSON
    const lottie = buildLottie(frames);
    if (!lottie) {
      console.error(`  ${unicode}: no paths found`);
      return false;
    }

    writeFileSync(lottiePath, JSON.stringify(lottie));
    const sizeKB = (readFileSync(lottiePath).length / 1024).toFixed(0);
    console.log(`  ${unicode}: ${frameFiles.length} frames → ${sizeKB}KB Lottie`);
    return true;
  } catch (err) {
    console.error(`  ${unicode}: ${err.message}`);
    return false;
  } finally {
    // Cleanup temp files
    rmSync(join(TEMP, unicode), { recursive: true, force: true });
  }
}

// Main
if (singleEmoji) {
  console.log(`Converting ${singleEmoji}...`);
  convertEmoji(singleEmoji);
} else if (doAll) {
  const files = readdirSync(ANIM_DIR).filter((f) => f.endsWith('.webp'));
  console.log(`Converting ${files.length} emojis to Lottie...`);
  let ok = 0,
    fail = 0;
  for (let i = 0; i < files.length; i++) {
    const unicode = basename(files[i], '.webp');
    const result = convertEmoji(unicode);
    if (result === true) ok++;
    else if (result !== 'cached') fail++;
    process.stdout.write(`\r  ${i + 1}/${files.length} (${ok} ok, ${fail} fail)`);
  }
  console.log(`\n\nDone! ${ok} converted, ${fail} failed.`);
} else {
  console.log('Usage:');
  console.log('  node scripts/convert-to-lottie.mjs --emoji 1f602');
  console.log('  node scripts/convert-to-lottie.mjs --all');
}
