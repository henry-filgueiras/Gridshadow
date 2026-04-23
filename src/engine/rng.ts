// Deterministic seedable PRNG. Mulberry32: small, fast, good enough for
// generation tasks where we need reproducibility, not cryptographic quality.
//
// The engine and any content it drives must go through this RNG — never
// Math.random — so that a seed fully determines the board.

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash → 32-bit unsigned int. Lets seeds be strings.
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}
