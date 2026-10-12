// How much of the two 8K2 sweeps an ordinary run plays. Each enumerates every case; the ordinary run plays every
// case of the short kind and a stated share of the long kind, a different share for each state so the nine states
// between them cover the long kind widely. The whole enumeration is played when the variable below is "1":
//
//   QA_8K2_WHOLE_SWEEP=1 pnpm exec vitest run --config vitest.config.ts tests/persistence/qa-8k2-order-of-answers.adversarial.test.ts tests/persistence/qa-8k2-round-trip.adversarial.test.ts
export const WHOLE_SWEEP_VARIABLE = "QA_8K2_WHOLE_SWEEP";

export const isWholeSweep = process.env[WHOLE_SWEEP_VARIABLE] === "1";

/** The ordinary run's number, or the whole sweep's when it is asked for. */
export function runsFor(sizes: { ordinary: number; whole: number }): number {
  return isWholeSweep ? sizes.whole : sizes.ordinary;
}

/**
 * Every `stride`-th case, starting at `offset`, in the ordinary run; all of them in the whole one. The offset is the
 * state's place in its list, so two states do not play the same share.
 */
export function shareOf<Case>(
  cases: readonly Case[],
  { stride, offset }: { stride: number; offset: number },
): Case[] {
  if (isWholeSweep) return [...cases];
  return cases.filter((_, index) => index % stride === offset % stride);
}
