import type { Page } from "@playwright/test";

/**
 * M7 wave 7E3b S5, criterion 1 (the headline criterion, ADR 0114 Amendment H4) — in the shape QA's
 * own `r3.mjs` measured: three pre-existing designs from one browser, then two in-flight mints
 * racing from its current value, over `ROUNDS` rounds. Two real requests reading the same jar
 * always carry the *same* `O`, so this drives every round entirely inside one `page.evaluate` — no
 * Playwright navigation between requests — the same way two tabs' concurrent `fetch`es would race
 * in a real browser.
 *
 * Every mint is same-origin (D6) and carries the jar's current cookie automatically
 * (`credentials: "same-origin"`); the visitor value itself is `HttpOnly` and unreadable from here,
 * exactly as production requires — this only ever reads back through `GET /api/designs/{id}`, the
 * same probe the editor itself uses to decide `canWrite`.
 */
const ROUNDS = 30;

interface RoundFailure {
  readonly round: number;
  readonly reason: string;
}

interface ConvergenceResult {
  readonly mintedIds: readonly string[];
  readonly failure: RoundFailure | null;
}

export async function runConvergenceRounds(
  page: Page,
): Promise<ConvergenceResult> {
  await page.goto("/ro/configurator/room");
  return page.evaluate(async (rounds: number) => {
    const mintedIds: string[] = [];

    async function mint(): Promise<{ id: string }> {
      const response = await fetch("/api/designs", {
        method: "POST",
        credentials: "same-origin",
      });
      return (await response.json()) as { id: string };
    }

    async function isReachable(id: string): Promise<boolean> {
      const response = await fetch(`/api/designs/${id}`, {
        credentials: "same-origin",
      });
      return response.status === 200;
    }

    for (let round = 0; round < rounds; round += 1) {
      const ids: string[] = [];

      // Three pre-existing designs — sequential, so each rotates the browser's own value forward
      // (H1) with nothing to race it.
      for (let k = 0; k < 3; k += 1) {
        ids.push((await mint()).id);
      }

      // Two in-flight mints, both racing from the jar's current value — dispatched together, so
      // both requests carry the same cookie header before either response lands.
      const [first, second] = await Promise.all([mint(), mint()]);
      ids.push(first.id, second.id);
      mintedIds.push(...ids);

      // The jar ends holding whichever of the two responses the browser applied last — under H4
      // both answer the same N, so it does not matter which. Every design, the three earlier ones
      // and both new ones, must open under it.
      for (const id of ids) {
        if (!(await isReachable(id))) {
          return {
            mintedIds,
            failure: { round, reason: `design ${id} did not open` },
          };
        }
      }
    }

    return { mintedIds, failure: null };
  }, ROUNDS);
}
