import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  itemIdOf,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { HeldDashboardAuditEvent } from "@lemnaria/persistence";

import { setAvailability } from "./price-dashboard-requests";
import { currentPriceDashboardWorld } from "./price-dashboard-world";
import { signedInAs } from "./staff-world";

// What a test of the availability route needs beside the dashboard world: an administrator, the head, writes that bypass the
// route's judgement (the states the route alone cannot reach), and a defaults save the way a staff member makes one.

export interface Administrator {
  readonly cookie: string;
  readonly accountId: string;
  readonly tokenHash: string;
}

const IDLE_LIFETIME_SECONDS = { client: 60, operator: 60, administrator: 60 };

/** The staff member an audit record is made on behalf of, as the stores take it. */
function auditSessionOf({ tokenHash }: Pick<Administrator, "tokenHash">) {
  return {
    sessionTokenHash: tokenHash,
    idleLifetimeSeconds: IDLE_LIFETIME_SECONDS,
  };
}

export async function administrator(
  email = "administrator@example.test",
): Promise<Administrator> {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return {
    cookie: session.cookie,
    accountId: account.id,
    tokenHash: session.tokenHash,
  };
}

export async function availabilityHead(): Promise<string> {
  const { stores } = currentPriceDashboardWorld();
  return (await stores.availability.readCurrent()).revision;
}

export async function disabledNow(): Promise<readonly ItemRef[]> {
  const { stores } = currentPriceDashboardWorld();
  return (await stores.availability.readCurrent()).disabled;
}

export function activationRows(): readonly HeldDashboardAuditEvent[] {
  return currentPriceDashboardWorld()
    .ledger.heldEvents()
    .filter(({ action }) => action === CATALOGUE_ACTIVATION_AUDIT_ACTION);
}

export function allRows(): readonly HeldDashboardAuditEvent[] {
  return currentPriceDashboardWorld().ledger.heldEvents();
}

export async function switchItem(
  cookie: string,
  item: unknown,
  active: boolean,
  expectedRevision?: string,
) {
  return setAvailability({
    cookie,
    json: {
      expectedRevision: expectedRevision ?? (await availabilityHead()),
      item,
      active,
    },
  });
}

/** Writes through the store with no judgement, so a state the route would have refused can be set up. */
export async function writeWithoutJudgement(
  staff: Pick<Administrator, "tokenHash">,
  item: ItemRef,
  active: boolean,
): Promise<void> {
  const { stores } = currentPriceDashboardWorld();
  const written = await stores.availability.setActive({
    item,
    active,
    expectedRevision: await availabilityHead(),
    audit: {
      session: auditSessionOf(staff),
      entry: {
        action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
        detail: { itemKind: item.kind, itemId: itemIdOf(item), active },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("the unjudged write refused");
}

export async function defaultsRevision(): Promise<string> {
  const read = await currentPriceDashboardWorld().defaults.read();
  return read.kind === "saved" ? read.saved.revision : "0";
}

/** Asks the defaults store to save, against the heads as they are now, and answers whatever it answers. */
export async function trySaveDefaults(
  staff: Pick<Administrator, "tokenHash">,
  defaults: NewKitchenSettings,
) {
  return currentPriceDashboardWorld().defaults.save({
    expectedRevision: await defaultsRevision(),
    expectedAvailabilityRevision: await availabilityHead(),
    defaults,
    audit: {
      session: auditSessionOf(staff),
      entry: {
        action: "kitchen-defaults-saved",
        detail: { changedFields: ["material"] },
      },
    },
  });
}

/** Saves defaults through the fake store as a staff member would, so the head and the defaults revision both move. */
export async function saveDefaults(
  staff: Pick<Administrator, "tokenHash">,
  defaults: NewKitchenSettings,
): Promise<void> {
  const saved = await trySaveDefaults(staff, defaults);
  if (saved.kind !== "ok") throw new Error("the test's defaults save refused");
}

/** Publishes `book` as the next version against the heads as they are now, as an administrator's publish would. */
export async function publishNextVersion(
  staff: Pick<Administrator, "tokenHash">,
  book: PriceBook,
  createdItems: readonly ItemRef[] = [],
) {
  const { stores, priceBook } = currentPriceDashboardWorld();
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("nothing to publish after");
  return priceBook.publish({
    expectedDraftRevision: (await stores.priceBook.readDraft()).draftRevision,
    expectedActiveSequence: active.version.sequenceNumber,
    expectedAvailabilityRevision: await availabilityHead(),
    createdItems,
    deletedItems: [],
    label: "Next",
    note: "",
    book,
    changeSummary: [],
    audit: {
      session: auditSessionOf(staff),
      entry: {
        action: "price-published",
        detail: { provisional: book.amountsProvisional },
      },
    },
  });
}
