/**
 * Pure TypeScript FIPS 46-3 DES-ECB implementation for RFC 6143 (VNC / RFB) challenge-response authentication.
 *
 * Replaces the previous Windows-only `powershell.exe` subprocess hack with a constant-structure,
 * zero-dependency, cross-platform implementation that runs in <0.1ms without blocking the Node.js event loop.
 */

const IP: readonly number[] = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

const FP: readonly number[] = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

const E_TABLE: readonly number[] = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
  8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
  24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

const P_TABLE: readonly number[] = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

const PC1: readonly number[] = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];

const PC2: readonly number[] = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

const SHIFTS: readonly number[] = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

const S_BOXES: readonly (readonly number[])[] = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

function bytesToBits(buf: Uint8Array, offset: number, length: number): Uint8Array {
  const bits = new Uint8Array(length * 8);
  for (let i = 0; i < length; i++) {
    const byte = buf[offset + i] ?? 0;
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (byte >>> (7 - b)) & 1;
    }
  }
  return bits;
}

function bitsToBytes(bits: Uint8Array): Buffer {
  const out = Buffer.alloc(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    out[i] = val;
  }
  return out;
}

function permute(input: Uint8Array, table: readonly number[]): Uint8Array {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) {
    out[i] = input[table[i] - 1];
  }
  return out;
}

function rotateLeft(half: Uint8Array, shift: number): Uint8Array {
  const len = half.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = half[(i + shift) % len];
  }
  return out;
}

function generateSubkeys(key8: Uint8Array): Uint8Array[] {
  const keyBits = bytesToBits(key8, 0, 8);
  const pc1 = permute(keyBits, PC1);
  let C = pc1.subarray(0, 28);
  let D = pc1.subarray(28, 56);

  const subkeys: Uint8Array[] = [];
  const combined = new Uint8Array(56);
  for (let r = 0; r < 16; r++) {
    C = rotateLeft(C, SHIFTS[r]);
    D = rotateLeft(D, SHIFTS[r]);
    combined.set(C, 0);
    combined.set(D, 28);
    subkeys.push(permute(combined, PC2));
  }
  return subkeys;
}

function feistel(right: Uint8Array, subkey: Uint8Array): Uint8Array {
  const expanded = permute(right, E_TABLE);
  for (let i = 0; i < 48; i++) {
    expanded[i] ^= subkey[i];
  }

  const sOut = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const off = i * 6;
    const row = (expanded[off] << 1) | expanded[off + 5];
    const col =
      (expanded[off + 1] << 3) |
      (expanded[off + 2] << 2) |
      (expanded[off + 3] << 1) |
      expanded[off + 4];
    const val = S_BOXES[i][row * 16 + col];
    const outOff = i * 4;
    sOut[outOff] = (val >>> 3) & 1;
    sOut[outOff + 1] = (val >>> 2) & 1;
    sOut[outOff + 2] = (val >>> 1) & 1;
    sOut[outOff + 3] = val & 1;
  }

  return permute(sOut, P_TABLE);
}

/** Encrypts a single 8-byte block with standard DES-ECB using an 8-byte key. */
export function desEncryptBlock(block8: Uint8Array, key8: Uint8Array, blockOffset = 0): Buffer {
  const subkeys = generateSubkeys(key8);
  const blockBits = bytesToBits(block8, blockOffset, 8);
  const ip = permute(blockBits, IP);
  let L = new Uint8Array(ip.subarray(0, 32));
  let R = new Uint8Array(ip.subarray(32, 64));

  for (let r = 0; r < 16; r++) {
    const f = feistel(R, subkeys[r]);
    const nextR = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      nextR[i] = L[i] ^ f[i];
    }
    L = R;
    R = nextR;
  }

  const preFinal = new Uint8Array(64);
  preFinal.set(R, 0);
  preFinal.set(L, 32);
  return bitsToBytes(permute(preFinal, FP));
}

/** Reverses the bit order of each byte as mandated by RFC 6143 Section 7.2.2 (VNC Authentication). */
export function deriveVncDesKey(password: string): Buffer {
  const raw = Buffer.from(password || '', 'latin1');
  const key = Buffer.alloc(8, 0);
  for (let i = 0; i < 8 && i < raw.length; i++) {
    const b = raw[i];
    let rev = 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((b & (1 << bit)) !== 0) {
        rev |= 1 << (7 - bit);
      }
    }
    key[i] = rev;
  }
  return key;
}

/**
 * Encrypts a 16-byte RFB VNC challenge using bit-reversed 8-byte DES-ECB (RFC 6143 §7.2.2).
 */
export function encryptVncChallengeDes(challenge: Buffer, password: string): Buffer {
  if (challenge.length < 16) {
    throw new Error('VNC challenge must be at least 16 bytes');
  }
  const key = deriveVncDesKey(password);
  const firstHalf = desEncryptBlock(challenge, key, 0);
  const secondHalf = desEncryptBlock(challenge, key, 8);
  return Buffer.concat([firstHalf, secondHalf]);
}
