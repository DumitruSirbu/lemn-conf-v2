import type { DraftChange, ItemRef } from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";

import { currentDraftRevision } from "./price-dashboard-requests";
import { currentPriceDashboardWorld } from "./price-dashboard-world";

// A stored draft a test writes straight into the world's store: the changes no draft route accepts yet, such as a
// deletion, planted as the stored-draft reader will read them.

/** One `item-deleted` change per item, as a stored draft holds them. */
export function deleting(...items: ItemRef[]): DraftChange[] {
  return items.map(
    (item) =>
      ({
        address: { kind: "item-deleted", item },
        value: true,
      }) as unknown as DraftChange,
  );
}

/** Replaces the stored draft with `changes`, on behalf of the staff session whose token hash is given. */
export async function plantDraft(
  tokenHash: string,
  changes: readonly DraftChange[],
): Promise<void> {
  const written = await currentPriceDashboardWorld().priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft was not written");
}
