// captcha-solver.ts

/** Pairs of column values (current, next) mapped to the digit they encode. */
export const COLUMNS_PAIRS: ReadonlyMap<string, number> = new Map<string, number>([
  ['524287,458759', 0], ['24579,49155', 0],
  ['7,131071', 1],      ['415,111', 1],
  ['126983,258079', 2], ['24591,57371', 2],
  ['519935,462343', 3], ['115459,99075', 3],
  ['63503,524287', 4],  ['227,451', 4],
  ['261951,523903', 5], ['24831,6159', 5],
  ['465927,516095', 6], ['15111,29443', 6],
  ['460799,524287', 7], ['24591,12303', 7],
  ['524287,462343', 8], ['27,15', 8],
  ['459207,459143', 9], ['57731,49347', 9],
]);

const COLUMN_COUNT = 121;
const TOTAL_BYTES = 3630; // 121 * 30
const BYTE_OFFSET = 104;

type CaptchaInput = Uint8Array | ArrayBuffer | ArrayLike<number>;

/**
 * Decode a captcha from its raw byte representation.
 *
 * The input is interpreted as 121 columns of 30 bytes, read with a stride of
 * 121 and a fixed offset of 104 bytes. Each column is collapsed to its
 * highest-set-bit-aligned value (`n >>> ctz(n)`), and consecutive column
 * values are looked up in {@link COLUMNS_PAIRS} to reconstruct the digits.
 */
export function solveCaptcha(captchaBytes: CaptchaInput): string {
  const bytes = captchaBytes instanceof Uint8Array
    ? captchaBytes
    : new Uint8Array(captchaBytes as ArrayBuffer | ArrayLike<number>);

  // Read 121 columns of 30 bytes each, using a stride of 121.
  const numbers = new Array<number>(COLUMN_COUNT);
  for (let i = 0; i < COLUMN_COUNT; i++) {
    let binStr = '';
    for (let j = i; j < TOTAL_BYTES; j += COLUMN_COUNT) {
      binStr += bytes[BYTE_OFFSET + j] ? '1' : '0';
    }
    numbers[i] = parseInt(binStr, 2);
  }

  // Collapse each column by shifting off its lowest set bit.
  const columns = new Array<number>(COLUMN_COUNT);
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const n = numbers[i];
    if (n === 0) {
      columns[i] = 0;
    } else {
      const lowBit = n & -n;           // lowest set bit
      const idx = Math.log2(lowBit);   // bit index
      columns[i] = n >>> idx;
    }
  }

  let solution = '';
  let waitFor0 = false;

  for (let i = 0; i < COLUMN_COUNT - 1; i++) {
    const pair = `${columns[i]},${columns[i + 1]}`;

    if (waitFor0 && columns[i + 1] === 0) {
      waitFor0 = false;
    } else if (COLUMNS_PAIRS.has(pair)) {
      solution += String(COLUMNS_PAIRS.get(pair));
      waitFor0 = true;
    }
  }

  return solution;
}

export default solveCaptcha;