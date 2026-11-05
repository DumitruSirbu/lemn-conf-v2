import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { ACCOUNT_KIND } from "../../../src/lib/server/rate-limit/bucket-subject";
import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY,
  STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
} from "../../../src/lib/server/rate-limit/limit-policy";
import { bucketKeyOfBlock, secretOfThisRun } from "./e2e-rate-limit-run";
import type { SignedInAdministrator } from "./staff-world";

// What the price dashboard's specs share: the draft that every test starts and ends by emptying, the counters the
// price routes leave behind, a page that fails its test on a console error, and the two layout measures. The
// assertions about a screen stay in the specs; the ones here are about the page as a whole.
//
// The draft lives in the e2e server's memory (the fake price book) and is ONE draft for the whole server: it is not
// kept per account. Two spec files that edit it therefore cannot run in two workers at once; CI runs one worker to a
// shard, and a local run of more than one file of the dashboard wants `--workers=1`.

export const STATE_ROUTE = "/api/staff/prices";
export const DRAFT_ROUTE = "/api/staff/prices/draft";
export const OK = 200;
export const MINIMUM_TARGET_PX = 44;

/** A page error or a console error of the page is a failure of the test that caused it. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use(errors);
      expect(errors, "console errors and page errors").toEqual([]);
    },
    { auto: true },
  ],
});

/** The keys of the counters the administrator's reads and writes of the price routes leave in the database. */
export function priceRateLimitKeysOf(
  signedIn: SignedInAdministrator,
): readonly string[] {
  const subject = {
    kind: ACCOUNT_KIND,
    subject: signedIn.administrator.accountId,
  } as const;
  return [
    STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
    STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
    STAFF_PRICE_USAGE_BY_ACCOUNT_POLICY,
  ].map((policy) => bucketKeyOfBlock(secretOfThisRun(), policy.name, subject));
}

/** Empties the in-memory draft through the routes the dashboard uses, so no test leaves a pending price behind. */
export async function discardDraft(context: BrowserContext): Promise<void> {
  const state = await context.request.get(STATE_ROUTE);
  expect(
    state.status(),
    "the dashboard's state, read to discard the draft",
  ).toBe(OK);
  const { draft } = (await state.json()) as {
    draft: { draftRevision: string; changes: readonly unknown[] };
  };
  if (draft.changes.length === 0) return;
  const discarded = await context.request.delete(DRAFT_ROUTE, {
    data: { expectedDraftRevision: draft.draftRevision, scope: "all" },
  });
  expect(discarded.status(), "the draft is discarded").toBe(OK);
}

export async function expectNoSidewaysScroll(
  page: Page,
  when: string,
): Promise<void> {
  const overflow = await page.evaluate(() => ({
    page:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow, `sideways scroll with ${when}`).toEqual({
    page: 0,
    body: 0,
  });
}

/**
 * Every visible control inside the scope is at least 44 px either way; a label around a box is its target, and so is the
 * box a link stretches over (a card whose name link covers the card): the link's own text box is not what a finger hits.
 */
export async function expectTargetsLargeEnough(
  page: Page,
  scope: string,
  when: string,
): Promise<void> {
  const { checked, small } = await measureTargets(page, scope);
  expect(checked, `controls measured with ${when}`).toBeGreaterThan(0);
  expect(
    small,
    `controls under ${String(MINIMUM_TARGET_PX)} px with ${when}`,
  ).toEqual([]);
}

/** The visible controls inside the scope, and those under 44 px either way, named. */
export function measureTargets(
  page: Page,
  scope: string,
): Promise<{ checked: number; small: string[] }> {
  return page.evaluate(
    ({ scopeSelector, minimum }) => {
      const controls = document.querySelectorAll(
        `${scopeSelector} :is(button, a[href], input:not([type=hidden]), select, textarea, summary)`,
      );
      const small: string[] = [];
      let checked = 0;
      for (const control of controls) {
        const target = targetOf(control);
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        checked += 1;
        if (rect.width >= minimum - 0.5 && rect.height >= minimum - 0.5)
          continue;
        const name =
          control.getAttribute("aria-label") ??
          control.textContent.trim().slice(0, 40);
        small.push(
          `${control.tagName.toLowerCase()} "${name}" ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`,
        );
      }
      return { checked, small };

      function targetOf(control: Element): Element {
        const isBox =
          control instanceof HTMLInputElement &&
          (control.type === "checkbox" || control.type === "radio");
        if (isBox) return control.closest("label") ?? control;
        return stretchedOver(control) ?? control;
      }

      /** The box a link's `::after` covers, where it is laid over its positioned ancestor and a point of that box hits it. */
      function stretchedOver(control: Element): Element | undefined {
        const after = getComputedStyle(control, "::after");
        const container =
          control instanceof HTMLElement ? control.offsetParent : null;
        if (
          control.tagName !== "A" ||
          after.position !== "absolute" ||
          after.content === "none" ||
          container === null
        ) {
          return undefined;
        }
        container.scrollIntoView({ block: "center" });
        const box = container.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height - 2,
        );
        return hit === control ? container : undefined;
      }
    },
    { scopeSelector: scope, minimum: MINIMUM_TARGET_PX },
  );
}
