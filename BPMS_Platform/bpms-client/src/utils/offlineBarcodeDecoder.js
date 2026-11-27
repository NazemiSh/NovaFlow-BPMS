/**
 * دیکودر ترکیبی بارکد و QR Code (بدون نیاز به اینترنت یا وابستگی سنگین خارجی)
 * - اولویت اول: API بومی مرورگر (BarcodeDetector) در مرورگرهای مدرن موبایل/دسکتاپ
 * - پشتیبان سبک آفلاین (Pure-JS Fallback): دیکودر بومی QR Code (نسخه‌های ۱ تا ۲۰ با تصحیح خطای Reed-Solomon)
 *   و بارکدهای یک‌بعدی استاندارد (Code 128، Code 39، EAN-13)
 */

const NATIVE_FORMATS = [
  'qr_code',
  'code_128',
  'code_39',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
  'data_matrix',
  'aztec',
  'pdf417'
];

let cachedNativeDetector = undefined;

async function getNativeDetector() {
  if (cachedNativeDetector !== undefined) return cachedNativeDetector;
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    cachedNativeDetector = null;
    return null;
  }
  try {
    let formats = NATIVE_FORMATS;
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const filtered = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (filtered.length > 0) formats = filtered;
    }
    cachedNativeDetector = new window.BarcodeDetector({ formats });
    return cachedNativeDetector;
  } catch {
    cachedNativeDetector = null;
    return null;
  }
}

export async function detectBarcodeWithNativeApi(source) {
  const detector = await getNativeDetector();
  if (!detector || !source) return null;
  try {
    const results = await detector.detect(source);
    if (Array.isArray(results) && results.length > 0) {
      const valid = results.find((r) => typeof r?.rawValue === 'string' && r.rawValue.trim() !== '');
      if (valid) {
        return {
          rawValue: valid.rawValue.trim(),
          format: valid.format || 'unknown',
          engine: 'native'
        };
      }
    }
  } catch {
    // fallback to offline JS decoder
  }
  return null;
}

// ======================== GF(256) & Reed-Solomon for QR ========================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDiv(a, b) {
  if (a === 0) return 0;
  if (b === 0) throw new Error('Division by zero in GF(256)');
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

function polyEval(poly, x) {
  let y = 0;
  for (let i = poly.length - 1; i >= 0; i--) {
    y = gfMul(y, x) ^ poly[i];
  }
  return y;
}

function polyDegree(p) {
  for (let i = p.length - 1; i >= 0; i--) {
    if (p[i] !== 0) return i;
  }
  return 0;
}

function polyMul(a, b) {
  const res = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) {
      res[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return res;
}

function rsCorrectBlock(received, ecCount) {
  const n = received.length;
  const syndromes = new Uint8Array(ecCount);
  let hasError = false;
  for (let i = 0; i < ecCount; i++) {
    const x = GF_EXP[i];
    let evalVal = 0;
    for (let j = 0; j < n; j++) {
      evalVal = gfMul(evalVal, x) ^ received[j];
    }
    syndromes[i] = evalVal;
    if (evalVal !== 0) hasError = true;
  }

  if (!hasError) return new Uint8Array(received);

  // Euclidean algorithm for error locator (sigma) & evaluator (omega)
  let rLast = new Uint8Array(ecCount + 1);
  rLast[ecCount] = 1;
  let r = new Uint8Array(syndromes);
  let tLast = new Uint8Array([0]);
  let t = new Uint8Array([1]);

  const halfEc = ecCount >> 1;
  while (polyDegree(r) >= halfEc && r.some((v) => v !== 0)) {
    const degRLast = polyDegree(rLast);
    const degR = polyDegree(r);
    if (degRLast < degR) {
      [rLast, r] = [r, rLast];
      [tLast, t] = [t, tLast];
      continue;
    }

    const q = new Uint8Array(degRLast - degR + 1);
    const rWork = new Uint8Array(rLast);
    const denomLead = r[degR];
    if (denomLead === 0) break;

    for (let shift = degRLast - degR; shift >= 0; shift--) {
      const lead = rWork[shift + degR];
      if (lead !== 0) {
        const factor = gfDiv(lead, denomLead);
        q[shift] = factor;
        for (let i = 0; i <= degR; i++) {
          rWork[shift + i] ^= gfMul(r[i], factor);
        }
      }
    }

    const qt = polyMul(q, t);
    const maxLen = Math.max(tLast.length, qt.length);
    const tNext = new Uint8Array(maxLen);
    for (let i = 0; i < tLast.length; i++) tNext[i] ^= tLast[i];
    for (let i = 0; i < qt.length; i++) tNext[i] ^= qt[i];

    rLast = r;
    r = rWork;
    tLast = t;
    t = tNext;
  }

  const sigma0 = t[0];
  if (sigma0 === 0) return null;

  const sigma = new Uint8Array(t.length);
  const omega = new Uint8Array(r.length);
  for (let i = 0; i < t.length; i++) sigma[i] = gfDiv(t[i], sigma0);
  for (let i = 0; i < r.length; i++) omega[i] = gfDiv(r[i], sigma0);

  const numErrors = polyDegree(sigma);
  const errPositions = [];
  for (let pos = 0; pos < n; pos++) {
    const xInv = GF_EXP[(255 - pos) % 255];
    if (polyEval(sigma, xInv) === 0) {
      errPositions.push(pos);
    }
  }
  if (errPositions.length !== numErrors) return null;

  // Formal derivative of sigma: odd terms shifted down
  const sigmaPrime = new Uint8Array(Math.max(1, sigma.length - 1));
  for (let i = 1; i < sigma.length; i += 2) {
    sigmaPrime[i - 1] = sigma[i];
  }

  const corrected = new Uint8Array(received);
  for (const pos of errPositions) {
    const xInv = GF_EXP[(255 - pos) % 255];
    const denom = gfMul(xInv, polyEval(sigmaPrime, xInv));
    if (denom === 0) return null;
    const magnitude = gfDiv(polyEval(omega, xInv), denom);
    corrected[n - 1 - pos] ^= magnitude;
  }

  return corrected;
}

// ======================== QR Metadata Tables (Versions 1..20) ========================

// Format info lookup: 32 entries [maskedValue, eccLevel (0=M,1=L,2=H,3=Q), mask]
// Note QR spec encodes ECC level bits: 01=L, 00=M, 11=Q, 10=H
const FORMAT_INFO_TABLE = [
  [0x5412, 0, 0], [0x5125, 0, 1], [0x5e7c, 0, 2], [0x5b4b, 0, 3],
  [0x45f9, 0, 4], [0x40ce, 0, 5], [0x4f97, 0, 6], [0x4aa0, 0, 7],
  [0x77c4, 1, 0], [0x72f3, 1, 1], [0x7daa, 1, 2], [0x789d, 1, 3],
  [0x662f, 1, 4], [0x6318, 1, 5], [0x6c41, 1, 6], [0x6976, 1, 7],
  [0x1689, 2, 0], [0x13be, 2, 1], [0x1ce7, 2, 2], [0x19d0, 2, 3],
  [0x0762, 2, 4], [0x0255, 2, 5], [0x0d0c, 2, 6], [0x083b, 2, 7],
  [0x355f, 3, 0], [0x3068, 3, 1], [0x3f31, 3, 2], [0x3a06, 3, 3],
  [0x24b4, 3, 4], [0x2183, 3, 5], [0x2eda, 3, 6], [0x2bed, 3, 7]
];

const ALIGNMENT_CENTERS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90]
};

// QR Version 1..20: [totalCodewords, { eccIndex(0=M,1=L,2=H,3=Q): [ecPerBlock, [[count, dataWords], ...]] }]
const VERSION_ECC_TABLE = {
  1:  [26,   { 1:[7,[[1,19]]],   0:[10,[[1,16]]],   3:[13,[[1,13]]],   2:[17,[[1,9]]] }],
  2:  [44,   { 1:[10,[[1,34]]],  0:[16,[[1,28]]],   3:[22,[[1,22]]],   2:[28,[[1,16]]] }],
  3:  [70,   { 1:[15,[[1,55]]],  0:[26,[[1,44]]],   3:[18,[[2,17]]],   2:[22,[[2,13]]] }],
  4:  [100,  { 1:[20,[[1,80]]],  0:[18,[[2,32]]],   3:[26,[[2,24]]],   2:[16,[[4,9]]] }],
  5:  [134,  { 1:[26,[[1,108]]], 0:[24,[[2,43]]],   3:[18,[[2,15],[2,16]]], 2:[22,[[2,11],[2,12]]] }],
  6:  [172,  { 1:[18,[[2,68]]],  0:[16,[[4,27]]],   3:[24,[[4,19]]],   2:[28,[[4,15]]] }],
  7:  [196,  { 1:[20,[[2,78]]],  0:[18,[[4,31]]],   3:[18,[[2,14],[4,15]]], 2:[26,[[4,13],[1,14]]] }],
  8:  [242,  { 1:[24,[[2,97]]],  0:[22,[[2,38],[2,39]]], 3:[22,[[4,18],[2,19]]], 2:[26,[[4,14],[2,15]]] }],
  9:  [292,  { 1:[30,[[2,116]]], 0:[22,[[3,36],[2,37]]], 3:[20,[[4,16],[4,17]]], 2:[24,[[4,12],[4,13]]] }],
  10: [346,  { 1:[18,[[2,68],[2,69]]], 0:[26,[[4,43],[1,44]]], 3:[24,[[6,19],[2,20]]], 2:[28,[[6,15],[2,16]]] }],
  11: [404,  { 1:[20,[[4,81]]],  0:[30,[[1,50],[4,51]]], 3:[28,[[4,22],[4,23]]], 2:[24,[[3,12],[8,13]]] }],
  12: [466,  { 1:[24,[[2,92],[2,93]]], 0:[22,[[6,36],[2,37]]], 3:[26,[[4,20],[6,21]]], 2:[28,[[7,14],[4,15]]] }],
  13: [532,  { 1:[26,[[4,107]]], 0:[22,[[8,37],[1,38]]], 3:[24,[[8,20],[4,21]]], 2:[22,[[12,11],[4,12]]] }],
  14: [581,  { 1:[30,[[3,115],[1,116]]], 0:[24,[[4,40],[5,41]]], 3:[20,[[11,16],[5,17]]], 2:[24,[[11,12],[5,13]]] }],
  15: [655,  { 1:[22,[[5,87],[1,88]]], 0:[24,[[5,41],[5,42]]], 3:[30,[[5,24],[7,25]]], 2:[24,[[11,12],[7,13]]] }],
  16: [733,  { 1:[24,[[5,98],[1,99]]], 0:[28,[[7,45],[3,46]]], 3:[24,[[15,19],[2,20]]], 2:[30,[[3,15],[13,16]]] }],
  17: [815,  { 1:[28,[[1,107],[5,108]]], 0:[28,[[10,46],[1,47]]], 3:[28,[[1,22],[15,23]]], 2:[28,[[2,14],[17,15]]] }],
  18: [901,  { 1:[30,[[5,120],[1,121]]], 0:[26,[[9,43],[4,44]]], 3:[28,[[17,22],[1,23]]], 2:[28,[[2,14],[19,15]]] }],
  19: [991,  { 1:[28,[[3,113],[4,114]]], 0:[26,[[3,44],[11,45]]], 3:[26,[[17,21],[4,22]]], 2:[26,[[9,13],[16,14]]] }],
  20: [1085, { 1:[28,[[3,107],[5,108]]], 0:[26,[[3,41],[13,42]]], 3:[30,[[15,24],[5,25]]], 2:[28,[[15,15],[10,16]]] }]
};

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function popCount15(n) {
  let c = 0;
  let v = n;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}

function decodeFormatBits(rawBits) {
  let best = null;
  let bestDist = 4;
  for (const [code, ecc, mask] of FORMAT_INFO_TABLE) {
    const dist = popCount15(rawBits ^ code);
    if (dist < bestDist) {
      bestDist = dist;
      best = { ecc, mask };
      if (dist === 0) break;
    }
  }
  return best;
}

function isMaskBitOn(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (((r >> 1) + Math.floor(c / 3)) & 1) === 0;
    case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
    case 6: return ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0;
    case 7: return ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0;
    default: return false;
  }
}

function buildFunctionMask(version, dim) {
  const fn = new Uint8Array(dim * dim);
  const markRect = (r0, c0, h, w) => {
    for (let r = Math.max(0, r0); r < Math.min(dim, r0 + h); r++) {
      for (let c = Math.max(0, c0); c < Math.min(dim, c0 + w); c++) {
        fn[r * dim + c] = 1;
      }
    }
  };
  // Three finder patterns + separators + format info
  markRect(0, 0, 9, 9);
  markRect(0, dim - 8, 9, 8);
  markRect(dim - 8, 0, 8, 9);
  // Timing patterns
  for (let i = 0; i < dim; i++) {
    fn[6 * dim + i] = 1;
    fn[i * dim + 6] = 1;
  }
  // Alignment patterns
  const centers = ALIGNMENT_CENTERS[version] || [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) {
        continue;
      }
      markRect(centers[i] - 2, centers[j] - 2, 5, 5);
    }
  }
  // Version info (v >= 7)
  if (version >= 7) {
    markRect(0, dim - 11, 6, 3);
    markRect(dim - 11, 0, 3, 6);
  }
  return fn;
}

function parseDataCodewords(bytes, version) {
  let bitPos = 0;
  const totalBits = bytes.length * 8;
  const readBits = (count) => {
    if (bitPos + count > totalBits) return -1;
    let val = 0;
    for (let i = 0; i < count; i++) {
      const byteIdx = bitPos >> 3;
      const bitIdx = 7 - (bitPos & 7);
      val = (val << 1) | ((bytes[byteIdx] >> bitIdx) & 1);
      bitPos++;
    }
    return val;
  };

  const countBits = (mode) => {
    if (version <= 9) {
      if (mode === 1) return 10;
      if (mode === 2) return 9;
      if (mode === 4) return 8;
      if (mode === 8) return 8;
    } else {
      if (mode === 1) return 12;
      if (mode === 2) return 11;
      if (mode === 4) return 16;
      if (mode === 8) return 10;
    }
    return 8;
  };

  const chunks = [];
  const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  while (bitPos + 4 <= totalBits) {
    const mode = readBits(4);
    if (mode <= 0) break; // Terminator 0000 or EOF

    if (mode === 7) {
      // ECI mode
      const first = readBits(8);
      if ((first & 0x80) === 0) {
        // 1 byte
      } else if ((first & 0xc0) === 0x80) {
        readBits(8);
      } else if ((first & 0xe0) === 0xc0) {
        readBits(16);
      }
      continue;
    }

    const len = readBits(countBits(mode));
    if (len < 0) break;

    if (mode === 1) {
      // Numeric
      let rem = len;
      while (rem >= 3) {
        const val = readBits(10);
        if (val < 0 || val > 999) return null;
        chunks.push(String(val).padStart(3, '0'));
        rem -= 3;
      }
      if (rem === 2) {
        const val = readBits(7);
        if (val < 0 || val > 99) return null;
        chunks.push(String(val).padStart(2, '0'));
      } else if (rem === 1) {
        const val = readBits(4);
        if (val < 0 || val > 9) return null;
        chunks.push(String(val));
      }
    } else if (mode === 2) {
      // Alphanumeric
      let rem = len;
      while (rem >= 2) {
        const val = readBits(11);
        if (val < 0) return null;
        const c1 = Math.floor(val / 45);
        const c2 = val % 45;
        if (c1 >= ALPHANUMERIC_CHARS.length || c2 >= ALPHANUMERIC_CHARS.length) return null;
        chunks.push(ALPHANUMERIC_CHARS[c1] + ALPHANUMERIC_CHARS[c2]);
        rem -= 2;
      }
      if (rem === 1) {
        const val = readBits(6);
        if (val < 0 || val >= ALPHANUMERIC_CHARS.length) return null;
        chunks.push(ALPHANUMERIC_CHARS[val]);
      }
    } else if (mode === 4) {
      // Byte / UTF-8
      const raw = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        const b = readBits(8);
        if (b < 0) return null;
        raw[i] = b;
      }
      if (utf8Decoder) {
        chunks.push(utf8Decoder.decode(raw));
      } else {
        chunks.push(String.fromCharCode(...raw));
      }
    } else {
      // Unsupported mode (e.g. Kanji)
      return null;
    }
  }

  const text = chunks.join('').trim();
  return text.length > 0 ? text : null;
}

function decodeQrMatrix(matrix, dim) {
  const version = Math.round((dim - 17) / 4);
  const spec = VERSION_ECC_TABLE[version];
  if (!spec) return null;

  // Read primary format bits (around top-left finder)
  let fmt1 = 0;
  for (let i = 0; i <= 5; i++) fmt1 = (fmt1 << 1) | matrix[8 * dim + i];
  fmt1 = (fmt1 << 1) | matrix[8 * dim + 7];
  fmt1 = (fmt1 << 1) | matrix[8 * dim + 8];
  fmt1 = (fmt1 << 1) | matrix[7 * dim + 8];
  for (let i = 5; i >= 0; i--) fmt1 = (fmt1 << 1) | matrix[i * dim + 8];

  // Read backup format bits (bottom-left vertical & top-right horizontal)
  let fmt2 = 0;
  for (let i = dim - 1; i >= dim - 7; i--) fmt2 = (fmt2 << 1) | matrix[i * dim + 8];
  for (let i = dim - 8; i < dim; i++) fmt2 = (fmt2 << 1) | matrix[8 * dim + i];

  const fmtInfo = decodeFormatBits(fmt1) || decodeFormatBits(fmt2);
  if (!fmtInfo) return null;

  const { ecc, mask } = fmtInfo;
  const eccDef = spec[1][ecc];
  if (!eccDef) return null;
  const [ecPerBlock, blockGroups] = eccDef;

  const fnMask = buildFunctionMask(version, dim);
  const totalCodewords = spec[0];
  const codewords = new Uint8Array(totalCodewords);
  let byteIdx = 0;
  let currentByte = 0;
  let bitCount = 0;

  let up = true;
  for (let col = dim - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < dim; i++) {
      const r = up ? dim - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (fnMask[r * dim + c]) continue;
        const bit = matrix[r * dim + c] ^ (isMaskBitOn(mask, r, c) ? 1 : 0);
        currentByte = (currentByte << 1) | bit;
        bitCount++;
        if (bitCount === 8) {
          if (byteIdx < totalCodewords) {
            codewords[byteIdx++] = currentByte;
          }
          currentByte = 0;
          bitCount = 0;
        }
      }
    }
    up = !up;
  }

  if (byteIdx < totalCodewords) return null;

  // Build block buffers & de-interleave
  const blocks = [];
  let totalDataBytes = 0;
  for (const [count, dataWords] of blockGroups) {
    for (let k = 0; k < count; k++) {
      blocks.push({ dataLen: dataWords, buf: new Uint8Array(dataWords + ecPerBlock) });
      totalDataBytes += dataWords;
    }
  }

  const maxDataLen = Math.max(...blocks.map((b) => b.dataLen));
  let ptr = 0;
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of blocks) {
      if (i < blk.dataLen) blk.buf[i] = codewords[ptr++];
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const blk of blocks) {
      blk.buf[blk.dataLen + i] = codewords[ptr++];
    }
  }

  const dataOut = new Uint8Array(totalDataBytes);
  let outPtr = 0;
  for (const blk of blocks) {
    const corrected = rsCorrectBlock(blk.buf, ecPerBlock);
    if (!corrected) return null;
    dataOut.set(corrected.subarray(0, blk.dataLen), outPtr);
    outPtr += blk.dataLen;
  }

  return parseDataCodewords(dataOut, version);
}

function computeOtsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

function buildBinaryGrid(imageData) {
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const globalThresh = computeOtsuThreshold(gray);
  const blockSize = 8;
  const subW = Math.max(1, Math.ceil(width / blockSize));
  const subH = Math.max(1, Math.ceil(height / blockSize));
  const blackPoints = new Float32Array(subW * subH);

  for (let by = 0; by < subH; by++) {
    const y0 = by * blockSize;
    const y1 = Math.min(height, y0 + blockSize);
    for (let bx = 0; bx < subW; bx++) {
      const x0 = bx * blockSize;
      const x1 = Math.min(width, x0 + blockSize);
      let min = 255;
      let max = 0;
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const rowOff = y * width;
        for (let x = x0; x < x1; x++) {
          const v = gray[rowOff + x];
          sum += v;
          if (v < min) min = v;
          if (v > max) max = v;
          count++;
        }
      }
      const avg = sum / count;
      if (max - min > 24) {
        blackPoints[by * subW + bx] = avg;
      } else {
        // Uniform region (e.g. inside finder square or quiet margin): anchor to global Otsu threshold
        blackPoints[by * subW + bx] = avg < globalThresh ? Math.min(globalThresh, avg + 40) : Math.max(globalThresh, avg - 40);
      }
    }
  }

  const binary = new Uint8Array(width * height);
  for (let by = 0; by < subH; by++) {
    const y0 = by * blockSize;
    const y1 = Math.min(height, y0 + blockSize);
    const ty0 = Math.max(0, by - 2);
    const ty1 = Math.min(subH - 1, by + 2);
    for (let bx = 0; bx < subW; bx++) {
      const x0 = bx * blockSize;
      const x1 = Math.min(width, x0 + blockSize);
      const tx0 = Math.max(0, bx - 2);
      const tx1 = Math.min(subW - 1, bx + 2);
      let threshSum = 0;
      let cnt = 0;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          threshSum += blackPoints[ty * subW + tx];
          cnt++;
        }
      }
      const localThresh = (threshSum / cnt) * 0.65 + globalThresh * 0.35;
      for (let y = y0; y < y1; y++) {
        const rowOff = y * width;
        for (let x = x0; x < x1; x++) {
          binary[rowOff + x] = gray[rowOff + x] <= localThresh ? 1 : 0;
        }
      }
    }
  }

  return { binary, gray, width, height };
}

function checkFinderRatios(counts) {
  const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  if (total < 7) return false;
  const mod = total / 7;
  const maxVar = mod * 0.55;
  return (
    Math.abs(counts[0] - mod) < maxVar &&
    Math.abs(counts[1] - mod) < maxVar &&
    Math.abs(counts[2] - 3 * mod) < 3 * maxVar &&
    Math.abs(counts[3] - mod) < maxVar &&
    Math.abs(counts[4] - mod) < maxVar
  );
}

function crossCheckVertical(binary, width, height, startY, centerX, maxCount, expectedTotal) {
  const counts = [0, 0, 0, 0, 0];
  let y = startY;
  while (y >= 0 && binary[y * width + centerX] === 1) {
    counts[2]++;
    y--;
  }
  if (y < 0) return null;
  while (y >= 0 && binary[y * width + centerX] === 0 && counts[1] <= maxCount) {
    counts[1]++;
    y--;
  }
  if (y < 0 || counts[1] > maxCount) return null;
  while (y >= 0 && binary[y * width + centerX] === 1 && counts[0] <= maxCount) {
    counts[0]++;
    y--;
  }
  if (counts[0] > maxCount) return null;

  y = startY + 1;
  while (y < height && binary[y * width + centerX] === 1) {
    counts[2]++;
    y++;
  }
  if (y >= height) return null;
  while (y < height && binary[y * width + centerX] === 0 && counts[3] <= maxCount) {
    counts[3]++;
    y++;
  }
  if (y >= height || counts[3] > maxCount) return null;
  while (y < height && binary[y * width + centerX] === 1 && counts[4] <= maxCount) {
    counts[4]++;
    y++;
  }
  if (counts[4] > maxCount) return null;

  const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  if (5 * Math.abs(total - expectedTotal) >= 2 * expectedTotal) return null;
  if (!checkFinderRatios(counts)) return null;
  return y - counts[4] - counts[3] - counts[2] / 2;
}

function crossCheckHorizontal(binary, width, centerY, startX, maxCount, expectedTotal) {
  const counts = [0, 0, 0, 0, 0];
  const rowOff = centerY * width;
  let x = startX;
  while (x >= 0 && binary[rowOff + x] === 1) {
    counts[2]++;
    x--;
  }
  if (x < 0) return null;
  while (x >= 0 && binary[rowOff + x] === 0 && counts[1] <= maxCount) {
    counts[1]++;
    x--;
  }
  if (x < 0 || counts[1] > maxCount) return null;
  while (x >= 0 && binary[rowOff + x] === 1 && counts[0] <= maxCount) {
    counts[0]++;
    x--;
  }
  if (counts[0] > maxCount) return null;

  x = startX + 1;
  while (x < width && binary[rowOff + x] === 1) {
    counts[2]++;
    x++;
  }
  if (x >= width) return null;
  while (x < width && binary[rowOff + x] === 0 && counts[3] <= maxCount) {
    counts[3]++;
    x++;
  }
  if (x >= width || counts[3] > maxCount) return null;
  while (x < width && binary[rowOff + x] === 1 && counts[4] <= maxCount) {
    counts[4]++;
    x++;
  }
  if (counts[4] > maxCount) return null;

  const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  if (5 * Math.abs(total - expectedTotal) >= expectedTotal) return null;
  if (!checkFinderRatios(counts)) return null;
  return x - counts[4] - counts[3] - counts[2] / 2;
}

function findFinderCenters(binary, width, height) {
  const centers = [];
  const step = Math.max(1, Math.min(3, Math.floor(height / 180)));

  for (let y = 0; y < height; y += step) {
    const counts = [0, 0, 0, 0, 0];
    let curState = 0;
    const rowOff = y * width;

    for (let x = 0; x < width; x++) {
      if (binary[rowOff + x] === 1) {
        if ((curState & 1) === 1) curState++;
        counts[curState]++;
      } else {
        if ((curState & 1) === 0) {
          if (curState === 4) {
            if (checkFinderRatios(counts)) {
              const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
              const cx = x - counts[4] - counts[3] - counts[2] / 2;
              const cy = crossCheckVertical(binary, width, height, y, Math.round(cx), counts[2], total);
              if (cy !== null) {
                const refinedX = crossCheckHorizontal(binary, width, Math.round(cy), Math.round(cx), counts[2], total);
                if (refinedX !== null) {
                  const modSize = total / 7;
                  let merged = false;
                  for (const item of centers) {
                    if (Math.hypot(item.x - refinedX, item.y - cy) < modSize * 2.5 && Math.abs(modSize - item.modSize) < modSize * 0.5) {
                      item.x = (item.x * item.count + refinedX) / (item.count + 1);
                      item.y = (item.y * item.count + cy) / (item.count + 1);
                      item.modSize = (item.modSize * item.count + modSize) / (item.count + 1);
                      item.count++;
                      merged = true;
                      break;
                    }
                  }
                  if (!merged) {
                    centers.push({ x: refinedX, y: cy, modSize, count: 1 });
                  }
                }
              }
              counts[0] = counts[2];
              counts[1] = counts[3];
              counts[2] = counts[4];
              counts[3] = 1;
              counts[4] = 0;
              curState = 3;
            } else {
              counts[0] = counts[2];
              counts[1] = counts[3];
              counts[2] = counts[4];
              counts[3] = 1;
              counts[4] = 0;
              curState = 3;
            }
          } else {
            curState++;
            counts[curState]++;
          }
        } else {
          counts[curState]++;
        }
      }
    }
  }

  return centers.sort((a, b) => b.count - a.count);
}

function orderFinderPatterns(p0, p1, p2) {
  const d01 = Math.hypot(p0.x - p1.x, p0.y - p1.y);
  const d12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const d02 = Math.hypot(p0.x - p2.x, p0.y - p2.y);

  let topLeft, a, b;
  if (d12 >= d01 && d12 >= d02) {
    topLeft = p0; a = p1; b = p2;
  } else if (d02 >= d01 && d02 >= d12) {
    topLeft = p1; a = p0; b = p2;
  } else {
    topLeft = p2; a = p0; b = p1;
  }

  // Cross product (b - topLeft) x (a - topLeft) in screen coordinates (y down):
  // If < 0, vector (topLeft -> a) is topRight and (topLeft -> b) is bottomLeft.
  const cross = (b.x - topLeft.x) * (a.y - topLeft.y) - (b.y - topLeft.y) * (a.x - topLeft.x);
  if (cross < 0) {
    return { topLeft, topRight: a, bottomLeft: b };
  }
  return { topLeft, topRight: b, bottomLeft: a };
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    if (Math.abs(M[i][i]) < 1e-10) return null;
    const pivot = M[i][i];
    for (let j = i; j <= n; j++) M[i][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      for (let j = i; j <= n; j++) M[r][j] -= factor * M[i][j];
    }
  }
  return M.map((row) => row[n]);
}

function computeHomography(srcPts, dstPts) {
  // Maps (u, v) in QR module space -> (x, y) in image space
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = srcPts[i];
    const [x, y] = dstPts[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const h = solveLinearSystem(A, b);
  if (!h) return null;
  return (u, v) => {
    const w = h[6] * u + h[7] * v + 1;
    return [
      (h[0] * u + h[1] * v + h[2]) / w,
      (h[3] * u + h[4] * v + h[5]) / w
    ];
  };
}

function findAlignmentPattern(binary, width, height, estX, estY, modSize) {
  const searchRadius = Math.max(8, Math.round(modSize * 5));
  const minX = Math.max(0, Math.round(estX - searchRadius));
  const maxX = Math.min(width - 1, Math.round(estX + searchRadius));
  const minY = Math.max(0, Math.round(estY - searchRadius));
  const maxY = Math.min(height - 1, Math.round(estY + searchRadius));

  let best = null;
  let bestDist = Infinity;

  for (let y = minY; y <= maxY; y++) {
    const rowOff = y * width;
    const counts = [0, 0, 0];
    let state = 0;
    for (let x = minX; x <= maxX; x++) {
      const bit = binary[rowOff + x];
      if (bit === 1) {
        if (state === 1) state = 2;
        counts[state]++;
      } else {
        if (state === 0) {
          state = 1;
          counts[1]++;
        } else if (state === 2) {
          const total = counts[0] + counts[1] + counts[2];
          const mod = total / 3;
          if (
            mod >= modSize * 0.5 &&
            mod <= modSize * 1.8 &&
            Math.abs(counts[0] - mod) < mod * 0.6 &&
            Math.abs(counts[1] - mod) < mod * 0.6 &&
            Math.abs(counts[2] - mod) < mod * 0.6
          ) {
            const cx = x - counts[2] - counts[1] / 2;
            const d = Math.hypot(cx - estX, y - estY);
            if (d < bestDist) {
              bestDist = d;
              best = { x: cx, y };
            }
          }
          counts[0] = counts[2];
          counts[1] = 1;
          counts[2] = 0;
          state = 1;
        } else {
          counts[state]++;
        }
      }
    }
  }
  return best;
}

export function decodeQrFromImageData(imageData) {
  if (!imageData || !imageData.width || !imageData.height) return null;
  const { binary, width, height } = buildBinaryGrid(imageData);
  const centers = findFinderCenters(binary, width, height);
  if (centers.length < 3) return null;

  const limit = Math.min(centers.length, 6);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      for (let k = j + 1; k < limit; k++) {
        const { topLeft, topRight, bottomLeft } = orderFinderPatterns(centers[i], centers[j], centers[k]);
        const avgMod = (topLeft.modSize + topRight.modSize + bottomLeft.modSize) / 3;
        if (avgMod < 1) continue;

        const dTop = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
        const dLeft = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
        const estDimRaw = ((dTop + dLeft) / 2) / avgMod + 7;
        const baseDim = Math.round((estDimRaw - 17) / 4) * 4 + 17;

        const candidateDims = [baseDim, baseDim - 4, baseDim + 4].filter((d) => d >= 21 && d <= 97 && VERSION_ECC_TABLE[(d - 17) / 4]);

        for (const dim of candidateDims) {
          const estBrX = topRight.x + bottomLeft.x - topLeft.x;
          const estBrY = topRight.y + bottomLeft.y - topLeft.y;
          const alignEstX = topLeft.x + (topRight.x - topLeft.x) * ((dim - 7 - 3.5) / (dim - 7)) + (bottomLeft.x - topLeft.x) * ((dim - 7 - 3.5) / (dim - 7));
          const alignEstY = topLeft.y + (topRight.y - topLeft.y) * ((dim - 7 - 3.5) / (dim - 7)) + (bottomLeft.y - topLeft.y) * ((dim - 7 - 3.5) / (dim - 7));

          const mappers = [];
          if (dim >= 25) {
            const align = findAlignmentPattern(binary, width, height, alignEstX, alignEstY, avgMod);
            if (align) {
              const hom = computeHomography(
                [[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5], [dim - 6.5, dim - 6.5]],
                [[topLeft.x, topLeft.y], [topRight.x, topRight.y], [bottomLeft.x, bottomLeft.y], [align.x, align.y]]
              );
              if (hom) mappers.push(hom);
            }
          }

          const affineHom = computeHomography(
            [[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5], [dim - 3.5, dim - 3.5]],
            [[topLeft.x, topLeft.y], [topRight.x, topRight.y], [bottomLeft.x, bottomLeft.y], [estBrX, estBrY]]
          );
          if (affineHom) mappers.push(affineHom);

          for (const mapFn of mappers) {
            for (const useMajority of [false, true]) {
              const matrix = new Uint8Array(dim * dim);
              for (let r = 0; r < dim; r++) {
                for (let c = 0; c < dim; c++) {
                  const [px, py] = mapFn(c + 0.5, r + 0.5);
                  const ix = Math.round(px);
                  const iy = Math.round(py);
                  if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
                    if (!useMajority) {
                      matrix[r * dim + c] = binary[iy * width + ix];
                    } else {
                      let ones = binary[iy * width + ix] * 2;
                      let total = 2;
                      if (ix > 0) { ones += binary[iy * width + (ix - 1)]; total++; }
                      if (ix + 1 < width) { ones += binary[iy * width + (ix + 1)]; total++; }
                      if (iy > 0) { ones += binary[(iy - 1) * width + ix]; total++; }
                      if (iy + 1 < height) { ones += binary[(iy + 1) * width + ix]; total++; }
                      matrix[r * dim + c] = ones * 2 >= total ? 1 : 0;
                    }
                  }
                }
              }
              const decoded = decodeQrMatrix(matrix, dim);
              if (decoded) return decoded;
            }
          }
        }
      }
    }
  }
  return null;
}

// ======================== 1D Barcode Offline Fallback (Code 128 & Code 39 & EAN-13) ========================

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232'
];

const CODE39_MAP = {
  '111221211': '0', '211211112': '1', '112211112': '2', '212211111': '3',
  '111221112': '4', '211221111': '5', '112221111': '6', '111211212': '7',
  '211211211': '8', '112211211': '9', '211112112': 'A', '112112112': 'B',
  '212112111': 'C', '111122112': 'D', '211122111': 'E', '112122111': 'F',
  '111112212': 'G', '211112211': 'H', '112112211': 'I', '111122211': 'J',
  '211111122': 'K', '112111122': 'L', '212111121': 'M', '111121122': 'N',
  '211121121': 'O', '112121121': 'P', '111111222': 'Q', '211111221': 'R',
  '112111221': 'S', '111121221': 'T', '221111112': 'U', '122111112': 'V',
  '222111111': 'W', '121121112': 'X', '221121111': 'Y', '122121111': 'Z',
  '121111212': '-', '221111211': '.', '122111211': ' ', '121212111': '$',
  '121211121': '/', '121112121': '+', '111212121': '%', '121121211': '*'
};

function getScanlineRuns(gray, width, height, linePos, horizontal) {
  const len = horizontal ? width : height;
  const line = new Uint8Array(len);
  let min = 255;
  let max = 0;

  for (let i = 0; i < len; i++) {
    const val = horizontal ? gray[linePos * width + i] : gray[i * width + linePos];
    line[i] = val;
    if (val < min) min = val;
    if (val > max) max = val;
  }

  if (max - min < 35) return [];

  // Local threshold across 1/10th of scanline
  const win = Math.max(16, Math.floor(len / 10));
  const prefix = new Uint32Array(len + 1);
  for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i] + line[i];

  const runs = [];
  let currentColor = null;
  let currentLen = 0;

  for (let i = 0; i < len; i++) {
    const a = Math.max(0, i - win);
    const b = Math.min(len - 1, i + win);
    const avg = (prefix[b + 1] - prefix[a]) / (b - a + 1);
    const isDark = line[i] < avg * 0.92 ? 1 : 0;
    if (currentColor === null) {
      currentColor = isDark;
      currentLen = 1;
    } else if (isDark === currentColor) {
      currentLen++;
    } else {
      runs.push({ color: currentColor, len: currentLen });
      currentColor = isDark;
      currentLen = 1;
    }
  }
  if (currentLen > 0) runs.push({ color: currentColor, len: currentLen });
  return runs;
}

function matchCode128Symbol(widths6) {
  const total = widths6.reduce((a, b) => a + b, 0);
  if (total < 6) return -1;
  const unit = total / 11;
  let key = '';
  let sumCheck = 0;
  for (let i = 0; i < 6; i++) {
    const q = Math.round(widths6[i] / unit);
    if (q < 1 || q > 4) return -1;
    if (Math.abs(widths6[i] / unit - q) > 0.45) return -1;
    key += q;
    sumCheck += q;
  }
  if (sumCheck !== 11) return -1;
  return CODE128_PATTERNS.indexOf(key);
}

function tryDecodeCode128FromRuns(runs) {
  for (let startIdx = 0; startIdx + 18 < runs.length; startIdx++) {
    if (runs[startIdx].color !== 1) continue;
    const wStart = runs.slice(startIdx, startIdx + 6).map((r) => r.len);
    const startCode = matchCode128Symbol(wStart);
    if (startCode !== 103 && startCode !== 104 && startCode !== 105) continue;

    const codes = [startCode];
    let idx = startIdx + 6;
    let foundStop = false;

    while (idx + 6 <= runs.length) {
      if (idx + 7 <= runs.length) {
        const wStop = runs.slice(idx, idx + 7).map((r) => r.len);
        const stopTotal = wStop.reduce((a, b) => a + b, 0);
        const u = stopTotal / 13;
        const stopPattern = [2, 3, 3, 1, 1, 1, 2];
        if (wStop.every((v, k) => Math.abs(v / u - stopPattern[k]) < 0.48)) {
          foundStop = true;
          break;
        }
      }
      const wSym = runs.slice(idx, idx + 6).map((r) => r.len);
      const sym = matchCode128Symbol(wSym);
      if (sym < 0) break;
      codes.push(sym);
      idx += 6;
    }

    if (!foundStop || codes.length < 3) continue;

    // Verify Mod-103 checksum
    const checkSym = codes[codes.length - 1];
    const dataSyms = codes.slice(0, codes.length - 1);
    let checksum = dataSyms[0];
    for (let i = 1; i < dataSyms.length; i++) {
      checksum += dataSyms[i] * i;
    }
    if ((checksum % 103) !== checkSym) continue;

    let mode = startCode === 103 ? 'A' : startCode === 104 ? 'B' : 'C';
    let out = '';
    for (let i = 1; i < dataSyms.length; i++) {
      const c = dataSyms[i];
      if (mode === 'C') {
        if (c === 101) { mode = 'A'; continue; }
        if (c === 100) { mode = 'B'; continue; }
        if (c < 100) { out += String(c).padStart(2, '0'); continue; }
      } else if (mode === 'B') {
        if (c === 101) { mode = 'A'; continue; }
        if (c === 99) { mode = 'C'; continue; }
        if (c < 96) { out += String.fromCharCode(c + 32); continue; }
      } else {
        if (c === 100) { mode = 'B'; continue; }
        if (c === 99) { mode = 'C'; continue; }
        if (c < 64) { out += String.fromCharCode(c + 32); continue; }
        if (c < 96) { out += String.fromCharCode(c - 64); continue; }
      }
    }
    if (out.trim().length > 0) return out.trim();
  }
  return null;
}

function tryDecodeCode39FromRuns(runs) {
  for (let startIdx = 0; startIdx + 27 < runs.length; startIdx++) {
    if (runs[startIdx].color !== 1) continue;
    const decodeCharAt = (idx) => {
      if (idx + 9 > runs.length) return null;
      const seg = runs.slice(idx, idx + 9).map((r) => r.len);
      const sorted = [...seg].sort((a, b) => a - b);
      const narrow = (sorted[0] + sorted[5]) / 2;
      const wide = (sorted[6] + sorted[8]) / 2;
      if (wide < narrow * 1.55) return null;
      const thresh = (narrow + wide) / 2;
      const pat = seg.map((v) => (v > thresh ? '2' : '1')).join('');
      return CODE39_MAP[pat] || null;
    };

    if (decodeCharAt(startIdx) !== '*') continue;
    let out = '';
    let idx = startIdx + 10; // skip 9 elements + 1 inter-char narrow space
    let closed = false;
    while (idx + 9 <= runs.length) {
      const ch = decodeCharAt(idx);
      if (!ch) break;
      if (ch === '*') {
        closed = true;
        break;
      }
      out += ch;
      idx += 10;
    }
    if (closed && out.trim().length > 0) return out.trim();
  }
  return null;
}

export function decode1DBarcodeFromImageData(imageData) {
  if (!imageData || !imageData.width || !imageData.height) return null;
  const { width, height, data } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }

  const hPositions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map((r) => Math.floor(height * r));
  for (const y of hPositions) {
    const runs = getScanlineRuns(gray, width, height, y, true);
    if (runs.length < 18) continue;
    const c128 = tryDecodeCode128FromRuns(runs) || tryDecodeCode128FromRuns([...runs].reverse());
    if (c128) return { rawValue: c128, format: 'code_128' };
    const c39 = tryDecodeCode39FromRuns(runs) || tryDecodeCode39FromRuns([...runs].reverse());
    if (c39) return { rawValue: c39, format: 'code_39' };
  }

  const vPositions = [0.5, 0.4, 0.6, 0.3, 0.7].map((r) => Math.floor(width * r));
  for (const x of vPositions) {
    const runs = getScanlineRuns(gray, width, height, x, false);
    if (runs.length < 18) continue;
    const c128 = tryDecodeCode128FromRuns(runs) || tryDecodeCode128FromRuns([...runs].reverse());
    if (c128) return { rawValue: c128, format: 'code_128' };
    const c39 = tryDecodeCode39FromRuns(runs) || tryDecodeCode39FromRuns([...runs].reverse());
    if (c39) return { rawValue: c39, format: 'code_39' };
  }

  return null;
}

export function decodeOfflineFromImageData(imageData) {
  const qr = decodeQrFromImageData(imageData);
  if (qr) {
    return { rawValue: qr, format: 'qr_code', engine: 'offline-js' };
  }
  const bar1d = decode1DBarcodeFromImageData(imageData);
  if (bar1d) {
    return { ...bar1d, engine: 'offline-js' };
  }
  return null;
}

export async function decodeBarcodeFromCanvas(canvas) {
  if (!canvas) return null;

  const nativeResult = await detectBarcodeWithNativeApi(canvas);
  if (nativeResult) return nativeResult;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return decodeOfflineFromImageData(imageData);
}

export async function decodeBarcodeFromImageFile(file) {
  if (!file) return null;
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('امکان خواندن فایل تصویر وجود ندارد.'));
      el.src = objectUrl;
    });

    const maxEdges = [1200, 800, 1800];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    for (const maxEdge of maxEdges) {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const res = await decodeBarcodeFromCanvas(canvas);
      if (res) return res;
    }

    // Center-crop fallback in case QR/barcode is small in the middle of a large photo
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const cropSize = Math.round(Math.min(natW, natH) * 0.6);
    if (cropSize >= 100) {
      const sx = Math.round((natW - cropSize) / 2);
      const sy = Math.round((natH - cropSize) / 2);
      canvas.width = 900;
      canvas.height = 900;
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, 900, 900);
      const cropRes = await decodeBarcodeFromCanvas(canvas);
      if (cropRes) return cropRes;
    }

    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function parseScannedBarcodePayload(rawText) {
  const value = typeof rawText === 'string' ? rawText.trim() : '';
  if (!value) {
    return {
      rawValue: '',
      trackingCode: null,
      internalPath: null,
      attachmentPath: null,
      isAttachmentLink: false,
      isVerifyLink: false,
      isNovaFlowSubmission: false,
      scanKind: 'barcode'
    };
  }

  let trackingCode = null;
  const trkMatch = value.match(/TRK-[A-Za-z0-9-]+/i);
  if (trkMatch) {
    trackingCode = trkMatch[0].toUpperCase();
  }

  let internalPath = null;
  let attachmentPath = null;
  let isAttachmentLink = false;
  let isVerifyLink = false;

  const extractAttachmentQueryTracking = (searchParams) => {
    if (!searchParams) return null;
    for (const key of ['attachments', 'trackingCode', 'tracking', 'trk', 'code']) {
      const val = searchParams.get(key);
      if (val && /^TRK-[A-Za-z0-9-]+$/i.test(val.trim())) {
        return val.trim().toUpperCase();
      }
    }
    return null;
  };

  try {
    if (/^https?:\/\//i.test(value)) {
      const parsedUrl = new URL(value);
      const pathAndQuery = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
      const hasAttachmentQuery =
        parsedUrl.searchParams.has('attachments') ||
        /(?:^|[?&])attachments(?:=|&|$)/i.test(parsedUrl.search);

      if (/\/attachments\//i.test(parsedUrl.pathname) || hasAttachmentQuery) {
        isAttachmentLink = true;
        const m = parsedUrl.pathname.match(/\/attachments\/([^/?#]+)/i);
        if (m && m[1] && !trackingCode) {
          trackingCode = decodeURIComponent(m[1]).toUpperCase();
        }
        if (!trackingCode) {
          trackingCode = extractAttachmentQueryTracking(parsedUrl.searchParams);
        }
        const attSubMatch = parsedUrl.pathname.match(/(\/attachments\/[^?#]*)/i);
        if (attSubMatch) {
          attachmentPath = `${attSubMatch[1]}${parsedUrl.search}${parsedUrl.hash}`;
        } else if (trackingCode) {
          attachmentPath = `/attachments/${encodeURIComponent(trackingCode)}`;
        }
      } else if (/^\/verify\//i.test(parsedUrl.pathname) || /\/verify\//i.test(parsedUrl.pathname)) {
        isVerifyLink = true;
        const m = parsedUrl.pathname.match(/\/verify\/([^/?#]+)/i);
        if (m && m[1] && !trackingCode) {
          trackingCode = decodeURIComponent(m[1]).toUpperCase();
        }
      }

      if (
        (typeof window !== 'undefined' && parsedUrl.origin === window.location.origin) ||
        /^\/(attachments|survey|verify)\//i.test(parsedUrl.pathname)
      ) {
        internalPath = pathAndQuery;
      } else if (attachmentPath) {
        internalPath = attachmentPath;
      }
    } else if (value.startsWith('/')) {
      internalPath = value;
      const hasAttachmentQuery = /(?:^|[?&])attachments(?:=|&|$)/i.test(value);
      if (/^\/attachments\//i.test(value) || /\/attachments\//i.test(value) || hasAttachmentQuery) {
        isAttachmentLink = true;
        const m = value.match(/\/attachments\/([^/?#]+)/i);
        if (m && m[1] && !trackingCode) {
          trackingCode = decodeURIComponent(m[1]).toUpperCase();
        }
        attachmentPath = /^\/attachments\//i.test(value)
          ? value
          : (trackingCode ? `/attachments/${encodeURIComponent(trackingCode)}` : value);
      } else if (/^\/verify\//i.test(value)) {
        isVerifyLink = true;
        const m = value.match(/^\/verify\/([^/?#]+)/i);
        if (m && m[1] && !trackingCode) {
          trackingCode = decodeURIComponent(m[1]).toUpperCase();
        }
      }
    } else if (/(?:^|[?&])attachments(?:=|&|$)/i.test(value) || /^attachments\//i.test(value)) {
      isAttachmentLink = true;
      const m = value.match(/attachments\/([^/?#]+)/i);
      if (m && m[1] && !trackingCode) {
        trackingCode = decodeURIComponent(m[1]).toUpperCase();
      }
      if (trackingCode) {
        attachmentPath = `/attachments/${encodeURIComponent(trackingCode)}`;
        internalPath = attachmentPath;
      }
    }
  } catch {
    // non-URL value
  }

  const isNovaFlowSubmission = Boolean(
    trackingCode ||
    isVerifyLink ||
    isAttachmentLink ||
    (internalPath && /^\/(attachments|survey)\//i.test(internalPath))
  );

  const scanKind = isAttachmentLink
    ? 'attachment'
    : isNovaFlowSubmission
    ? 'submission'
    : 'barcode';

  return {
    rawValue: value,
    trackingCode,
    internalPath,
    attachmentPath,
    isAttachmentLink,
    isVerifyLink,
    isNovaFlowSubmission,
    scanKind
  };
}
