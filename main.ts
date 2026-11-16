import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1048576;
const MAX_DIMENSION = 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_START = Buffer.from([0xff, 0xd8]);

function parsePngDimensions(bytes) {
  if (bytes.length < 33) {
    throw new Error("Invalid PNG: file is too short to contain an IHDR chunk.");
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Invalid PNG: first chunk is not IHDR.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return { width, height };
}

function parseJpegDimensions(bytes) {
  // Walk the marker segments until a Start Of Frame marker gives the size.
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      throw new Error("Invalid JPEG: expected a marker at offset " + offset + ".");
    }
    let marker = bytes[offset + 1];
    // Skip padding 0xFF bytes between markers.
    while (marker === 0xff) {
      offset += 1;
      marker = bytes[offset + 1];
    }
    offset += 2;
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 2 > bytes.length) {
      throw new Error("Invalid JPEG: truncated segment header.");
    }
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) {
      throw new Error("Invalid JPEG: segment length out of bounds.");
    }
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc);
    if (isStartOfFrame) {
      if (length < 7) {
        throw new Error("Invalid JPEG: Start Of Frame segment is too short.");
      }
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      return { width, height };
    }
    offset += length;
  }
  throw new Error("Invalid JPEG: no Start Of Frame marker found.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDir, "entry.png");
const bytes = readFileSync(sourcePath);

if (bytes.length === 0) {
  throw new Error("entry.png is empty.");
}
if (bytes.length > MAX_BYTES) {
  throw new Error(
    "entry.png is " + bytes.length + " bytes, over the 1048576 byte limit."
  );
}

let format;
let dimensions;
if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
  format = "PNG";
  dimensions = parsePngDimensions(bytes);
} else if (bytes.subarray(0, 2).equals(JPEG_START)) {
  format = "JPEG";
  dimensions = parseJpegDimensions(bytes);
} else {
  throw new Error("entry.png is neither a PNG nor a JPEG file.");
}

if (dimensions.width === 0 || dimensions.height === 0) {
  throw new Error("Invalid image: width and height must both be greater than zero.");
}
if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
  throw new Error(
    "Image is " + dimensions.width + "x" + dimensions.height +
    ", exceeding the maximum dimension of " + MAX_DIMENSION + " pixels."
  );
}

const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
if (outputDir.trim() === "") {
  throw new Error("MAKEFUN_OUTPUT_DIR is set but empty; provide a directory path or unset it.");
}
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, "entry.png");
writeFileSync(outputPath, bytes);

const written = readFileSync(outputPath);
if (!written.equals(bytes)) {
  throw new Error("Verification failed: written entry.png does not match the source byte for byte.");
}

console.log(
  "Wrote " + format + " " + dimensions.width + "x" + dimensions.height +
  " (" + bytes.length + " bytes) to " + outputPath + "."
);
