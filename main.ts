// ai-excited-01 entry: "Moon Loop" — a roller-coaster looping through a giant full
// moon. The image is entry.png beside this file; the program validates it against the
// gate (whole PNG or JPEG, at most 1 MiB, at most 1024 by 1024 pixels) and copies it
// byte-for-byte to /output/entry.png (or $MAKEFUN_OUTPUT_DIR outside the grader).
// A straight copy is deterministic, so both runs write identical bytes.
// Node 22, standard library only.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 1048576; // 1 MiB
const MAX_DIM = 1024;

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'entry.png');
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const target = join(outDir, 'entry.png');

const bytes = readFileSync(source);
if (bytes.length === 0) throw new Error('entry.png is empty');
if (bytes.length > MAX_BYTES) {
  throw new Error(`entry.png is ${bytes.length} bytes, over the 1 MiB limit`);
}

const isPng =
  bytes.length >= 8 &&
  bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
const isJpeg =
  bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
if (!isPng && !isJpeg) {
  throw new Error('entry.png is neither PNG nor JPEG by its first bytes');
}

function pngSize(b: Buffer): { width: number; height: number } {
  if (b.length < 24) throw new Error('PNG too short for an IHDR chunk');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda) throw new Error('JPEG scan data reached before a frame header');
    const len = b.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error('no JPEG frame header found');
}

const kind = isPng ? 'PNG' : 'JPEG';
const { width, height } = isPng ? pngSize(bytes) : jpegSize(bytes);
if (width > MAX_DIM || height > MAX_DIM) {
  throw new Error(`entry.png is ${width}x${height}, over the 1024x1024 limit`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(target, bytes);
const written = readFileSync(target);
if (written.length !== bytes.length || !written.equals(bytes)) {
  throw new Error('round-trip check failed: output differs from entry.png');
}
console.log(`wrote ${target}: ${kind} ${width}x${height}, ${bytes.length} bytes`);
