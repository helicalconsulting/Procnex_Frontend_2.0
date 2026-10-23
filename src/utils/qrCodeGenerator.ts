/**
 * Self-contained, zero-dependency QR Code Generator (ISO/IEC 18004)
 * Generates vector SVG / module matrix for crisp, high-resolution printing.
 */

// ── Galois Field GF(256) Math ────────────────────────────────────────────────
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
    }
  }
})();

function gMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gMul(poly[j], factor);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsCalculateEcc(data: Uint8Array, eccLen: number): Uint8Array {
  const gen = rsGeneratorPoly(eccLen);
  const res = new Uint8Array(eccLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[eccLen - 1] = 0;
    for (let j = 0; j < eccLen; j++) {
      res[j] ^= gMul(gen[j], factor);
    }
  }
  return res;
}

// ── QR Versions & Capacity (Byte Mode with Medium Error Correction) ──────────
// [Version, Total Data Codewords, ECC Codewords Per Block, Blocks in Group 1, Data CW in G1, Blocks in G2, Data CW in G2]
interface VersionInfo {
  version: number;
  totalDataCw: number;
  eccPerBlock: number;
  g1Blocks: number;
  g1DataCw: number;
  g2Blocks: number;
  g2DataCw: number;
  alignment: number[];
}

const VERSION_TABLE: VersionInfo[] = [
  { version: 1, totalDataCw: 16, eccPerBlock: 10, g1Blocks: 1, g1DataCw: 16, g2Blocks: 0, g2DataCw: 0, alignment: [] },
  { version: 2, totalDataCw: 28, eccPerBlock: 16, g1Blocks: 1, g1DataCw: 28, g2Blocks: 0, g2DataCw: 0, alignment: [6, 18] },
  { version: 3, totalDataCw: 44, eccPerBlock: 26, g1Blocks: 1, g1DataCw: 44, g2Blocks: 0, g2DataCw: 0, alignment: [6, 22] },
  { version: 4, totalDataCw: 64, eccPerBlock: 18, g1Blocks: 2, g1DataCw: 32, g2Blocks: 0, g2DataCw: 0, alignment: [6, 26] },
  { version: 5, totalDataCw: 86, eccPerBlock: 24, g1Blocks: 2, g1DataCw: 43, g2Blocks: 0, g2DataCw: 0, alignment: [6, 30] },
  { version: 6, totalDataCw: 108, eccPerBlock: 16, g1Blocks: 4, g1DataCw: 27, g2Blocks: 0, g2DataCw: 0, alignment: [6, 34] },
  { version: 7, totalDataCw: 124, eccPerBlock: 18, g1Blocks: 4, g1DataCw: 31, g2Blocks: 0, g2DataCw: 0, alignment: [6, 22, 38] },
  { version: 8, totalDataCw: 154, eccPerBlock: 22, g1Blocks: 2, g1DataCw: 38, g2Blocks: 2, g2DataCw: 39, alignment: [6, 24, 42] },
  { version: 9, totalDataCw: 182, eccPerBlock: 22, g1Blocks: 3, g1DataCw: 36, g2Blocks: 2, g2DataCw: 37, alignment: [6, 26, 46] },
  { version: 10, totalDataCw: 216, eccPerBlock: 26, g1Blocks: 4, g1DataCw: 43, g2Blocks: 1, g2DataCw: 44, alignment: [6, 28, 50] },
];

function selectVersion(dataLen: number): VersionInfo {
  // Byte mode overhead: 4-bit mode indicator + 8-bit character count indicator = 12 bits = ~2 bytes
  const neededCw = dataLen + 2;
  for (const v of VERSION_TABLE) {
    if (v.totalDataCw >= neededCw) return v;
  }
  return VERSION_TABLE[VERSION_TABLE.length - 1];
}

class BitBuffer {
  buffer: number[] = [];
  length = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// ── QR Code Matrix Construction ──────────────────────────────────────────────
export interface QRCodeMatrix {
  size: number;
  modules: boolean[][];
  toSvg(options?: { size?: number; foreground?: string; background?: string; margin?: number }): string;
}

export function generateQRCode(text: string): QRCodeMatrix {
  const utf8Bytes = new TextEncoder().encode(text);
  const versionInfo = selectVersion(utf8Bytes.length);
  const version = versionInfo.version;
  const size = version * 4 + 17;

  // 1. Bit Stream Encoding (Byte Mode: 0100)
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // Byte mode
  bb.put(utf8Bytes.length, version <= 9 ? 8 : 16); // Count
  for (let i = 0; i < utf8Bytes.length; i++) {
    bb.put(utf8Bytes[i], 8);
  }

  // Terminator (up to 4 bits of 0)
  const totalDataBits = versionInfo.totalDataCw * 8;
  const termBits = Math.min(4, totalDataBits - bb.length);
  if (termBits > 0) bb.put(0, termBits);

  // Align to byte boundary
  while (bb.length % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes: alternating 0xEC (11101100) and 0x11 (00010001)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bb.length < totalDataBits) {
    bb.put(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = bb.getBytes();

  // 2. Block division and Reed-Solomon Error Correction
  const blocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let byteOffset = 0;

  for (let b = 0; b < versionInfo.g1Blocks; b++) {
    const slice = dataBytes.slice(byteOffset, byteOffset + versionInfo.g1DataCw);
    blocks.push(slice);
    eccBlocks.push(rsCalculateEcc(slice, versionInfo.eccPerBlock));
    byteOffset += versionInfo.g1DataCw;
  }
  for (let b = 0; b < versionInfo.g2Blocks; b++) {
    const slice = dataBytes.slice(byteOffset, byteOffset + versionInfo.g2DataCw);
    blocks.push(slice);
    eccBlocks.push(rsCalculateEcc(slice, versionInfo.eccPerBlock));
    byteOffset += versionInfo.g2DataCw;
  }

  // 3. Interleaving data and ECC codewords
  const interleaved: number[] = [];
  const maxDataLen = Math.max(versionInfo.g1DataCw, versionInfo.g2DataCw || 0);

  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blocks[b].length) {
        interleaved.push(blocks[b][i]);
      }
    }
  }

  for (let i = 0; i < versionInfo.eccPerBlock; i++) {
    for (let b = 0; b < eccBlocks.length; b++) {
      interleaved.push(eccBlocks[b][i]);
    }
  }

  // 4. Matrix Initialization
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunction(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // Finder Patterns
  function placeFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setFunction(nr, nc, isBlack);
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment Patterns
  const alignCoords = versionInfo.alignment;
  for (const ar of alignCoords) {
    for (const ac of alignCoords) {
      if (isFunction[ar][ac]) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setFunction(ar + r, ac + c, isBlack);
        }
      }
    }
  }

  // Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (!isFunction[6][i]) setFunction(6, i, val);
    if (!isFunction[i][6]) setFunction(i, 6, val);
  }

  // Dark module
  setFunction(4 * version + 9, 8, true);

  // Reserve Format Info Area
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunction(8, i, false);
    if (!isFunction[i][8]) setFunction(i, 8, false);
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8][i]) setFunction(8, i, false);
    if (!isFunction[i][8]) setFunction(i, 8, false);
  }

  // 5. Place Interleaved Data Bits (Zig-zag)
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column

    const rows = [];
    for (let r = 0; r < size; r++) rows.push(upwards ? size - 1 - r : r);

    for (const r of rows) {
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (!isFunction[r][col]) {
          let bit = false;
          if (bitIdx < totalBits) {
            const byte = interleaved[Math.floor(bitIdx / 8)];
            bit = ((byte >>> (7 - (bitIdx % 8))) & 1) === 1;
            bitIdx++;
          }
          // Mask 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0;
          modules[r][col] = mask ? !bit : bit;
        }
      }
    }
    upwards = !upwards;
  }

  // 6. Format Information (Medium ECC = 00, Mask 0 = 000 => Format Bits: 00000)
  // Masked with 101010000010010 (0x5412) => 101010000010010
  const formatBits = [true, false, true, false, true, false, false, false, false, false, true, false, false, true, false];

  // Top-left
  for (let i = 0; i < 6; i++) modules[8][i] = formatBits[i];
  modules[8][7] = formatBits[6];
  modules[8][8] = formatBits[7];
  modules[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) modules[14 - i][8] = formatBits[i];

  // Top-right & Bottom-left
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = formatBits[i];
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = formatBits[i];

  return {
    size,
    modules,
    toSvg({ size: outSize = 140, foreground = '#000000', background = '#ffffff', margin = 2 } = {}) {
      const fullSize = size + margin * 2;
      let d = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (modules[r][c]) {
            d += `M${c + margin},${r + margin}h1v1h-1z `;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullSize} ${fullSize}" width="${outSize}" height="${outSize}">
        <rect width="${fullSize}" height="${fullSize}" fill="${background}"/>
        <path d="${d}" fill="${foreground}"/>
      </svg>`;
    },
  };
}
