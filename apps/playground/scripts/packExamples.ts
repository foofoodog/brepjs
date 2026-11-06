/**
 * Generates `dist/examples.zip` containing standalone `.ts` and `.js` scripts
 * for every playground example organized by category:
 *   examples/<category>/<id>.ts
 *   examples/<category>/<id>.js
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { transform } from 'sucrase';
import { CATEGORIES } from '../src/lib/examples/index.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultOut = resolve(scriptDir, '../dist/examples.zip');
const outPath = process.argv[2] ? resolve(process.argv[2]) : defaultOut;

function toJs(tsCode: string): string {
  return transform(tsCode, {
    transforms: ['typescript'],
    disableESTransforms: true,
    preserveDynamicImport: true,
  }).code;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressedSize = entry.data.length;
    const crc = crc32(entry.data);
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const compressedSize = compressed.length;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0x21, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressedSize;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDir, eocd]);
}

const entries: ZipEntry[] = [];

for (const category of CATEGORIES) {
  for (const ex of category.examples) {
    const tsCode = ex.code.trimStart();
    entries.push({
      name: `examples/${category.id}/${ex.id}.ts`,
      data: Buffer.from(tsCode, 'utf8'),
    });
    entries.push({
      name: `examples/${category.id}/${ex.id}.js`,
      data: Buffer.from(toJs(tsCode), 'utf8'),
    });
  }
}

await mkdir(dirname(outPath), { recursive: true });
const zipBuf = buildZip(entries);
await writeFile(outPath, zipBuf);
console.warn(
  `packed ${entries.length} example files (${(zipBuf.length / 1024).toFixed(1)} kB) into ${outPath}`
);
