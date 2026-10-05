// Builds src/core/equity/preflop-hu.bin: the exact heads-up preflop equity of all 47,008 matchup
// classes (src/core/equity/preflopKey.ts), each over every possible board (1,712,304).
// A one-time job (about 15 minutes on 8 threads); the result is committed.
//
//   node scripts/build-preflop-table.mjs
//
// File layout (little-endian): "LSPF", u32 version = 2, u32 count, i32 keys[count] (ascending),
// u16 equity[count] = the first hand's equity * 65534 (ties count half). An even scale keeps
// 50 % and every 1 - x exact, so both sides of a matchup always add up to 1.

import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

const KEYS_MODULE = new URL('../src/core/equity/preflopKey.ts', import.meta.url).href;
const EVAL_MODULE = new URL('../src/core/fastEval.ts', import.meta.url).href;
const TARGET = fileURLToPath(new URL('../src/core/equity/preflop-hu.bin', import.meta.url));

if (isMainThread) {
  const { allClassKeys } = await import(KEYS_MODULE);
  const keys = allClassKeys();
  const threads = availableParallelism();
  const equities = new Uint16Array(keys.length);
  const started = Date.now();
  let done = 0;
  console.log(`${keys.length} matchups on ${threads} threads`);

  await Promise.all(
    Array.from({ length: threads }, (_, w) => {
      const indices = [];
      for (let i = w; i < keys.length; i += threads) indices.push(i);
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { keys: indices.map((i) => keys[i]) } });
        worker.on('message', (m) => {
          if (m.type === 'progress') {
            done += m.count;
            const elapsed = (Date.now() - started) / 1000;
            const eta = (elapsed / done) * (keys.length - done);
            process.stdout.write(`\r${done}/${keys.length}  ${elapsed.toFixed(0)} s elapsed, ~${eta.toFixed(0)} s left   `);
          } else {
            m.values.forEach((v, j) => (equities[indices[j]] = v));
            resolve();
          }
        });
        worker.on('error', reject);
      });
    }),
  );

  const header = new Uint32Array([0x4650534c, 2, keys.length]); // "LSPF"
  const out = Buffer.concat([
    Buffer.from(header.buffer),
    Buffer.from(keys.buffer, keys.byteOffset, keys.byteLength),
    Buffer.from(equities.buffer),
  ]);
  writeFileSync(TARGET, out);
  console.log(`\nwrote ${out.length} bytes to ${TARGET} in ${((Date.now() - started) / 60000).toFixed(1)} min`);
} else {
  const { classCards } = await import(KEYS_MODULE);
  const { CARD_HI, CARD_LO, evalPacked } = await import(EVAL_MODULE);

  /** Exact equity of hand (a, b) against hand (c, d) over every board. */
  function equity(a, b, c, d) {
    const lo = new Int32Array(48);
    const hi = new Int32Array(48);
    let n = 0;
    for (let x = 0; x < 52; x++) {
      if (x === a || x === b || x === c || x === d) continue;
      lo[n] = CARD_LO[x];
      hi[n] = CARD_HI[x];
      n++;
    }
    const h1 = CARD_LO[a] | CARD_LO[b], h2 = CARD_HI[a] | CARD_HI[b];
    const v1 = CARD_LO[c] | CARD_LO[d], v2 = CARD_HI[c] | CARD_HI[d];
    let wins = 0;
    let ties = 0;
    let total = 0;
    for (let i = 0; i < 44; i++) {
      const l1 = lo[i], g1 = hi[i];
      for (let j = i + 1; j < 45; j++) {
        const l2 = l1 | lo[j], g2 = g1 | hi[j];
        for (let k = j + 1; k < 46; k++) {
          const l3 = l2 | lo[k], g3 = g2 | hi[k];
          for (let m = k + 1; m < 47; m++) {
            const l4 = l3 | lo[m], g4 = g3 | hi[m];
            for (let p = m + 1; p < 48; p++) {
              const bl = l4 | lo[p], bh = g4 | hi[p];
              const hs = evalPacked(h1 | bl, h2 | bh);
              const vs = evalPacked(v1 | bl, v2 | bh);
              if (hs > vs) wins++;
              else if (hs === vs) ties++;
              total++;
            }
          }
        }
      }
    }
    return (wins + ties / 2) / total;
  }

  const values = new Uint16Array(workerData.keys.length);
  let pending = 0;
  workerData.keys.forEach((key, i) => {
    const [a, b, c, d] = classCards(key);
    values[i] = Math.round(equity(a, b, c, d) * 65534);
    if (++pending === 50) {
      parentPort.postMessage({ type: 'progress', count: pending });
      pending = 0;
    }
  });
  parentPort.postMessage({ type: 'progress', count: pending });
  parentPort.postMessage({ type: 'done', values });
}
