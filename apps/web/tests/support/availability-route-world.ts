import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  HandleSchema,
  MATERIALS,
  finishItems,
  listAccessoryIds,
  paletteEntriesOf,
  tierItems,
  type ItemRef,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { setAvailability } from "./price-dashboard-requests";
import {
  ANCHORED_BOOK,
  currentPriceDashboardWorld,
} from "./price-dashboard-world";
import { signedInAs } from "./staff-world";

// What a test of the availability route needs beside the dashboard world: an administrator, the head, writes that bypass the
// route's judgement (the states the route alone cannot reach), and a defaults save the way a staff member makes one.

export interface Administrator {
  readonly cookie: string;
  readonly accountId: string;
  readonly tokenHash: string;
}

const IDLE_LIFETIME_SECONDS = { client: 60, operator: 60, administrator: 60 };

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

export function activationRows() {
  return currentPriceDashboardWorld()
    .ledger.heldEvents()
    .filter(({ action }) => action === CATALOGUE_ACTIVATION_AUDIT_ACTION);
}

export function allRows() {
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

function idOf(item: ItemRef): string {
  switch (item.kind) {
    case "material":
    case "hardware":
      return item.tierId;
    case "finish":
      return item.finishId;
    case "handle":
      return item.handle;
    case "accessory":
      return item.accessoryId;
  }
}

/** Writes through the store with no judgement, so a state the route would have refused can be set up. */
export async function writeWithoutJudgement(
  { tokenHash }: Pick<Administrator, "tokenHash">,
  item: ItemRef,
  active: boolean,
): Promise<void> {
  const { stores } = currentPriceDashboardWorld();
  const written = await stores.availability.setActive({
    item,
    active,
    expectedRevision: await availabilityHead(),
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS,
      },
      entry: {
        action: CATALOGUE_ACTIVATION_AUDIT_ACTION,
        detail: { itemKind: item.kind, itemId: idOf(item), active },
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
  { tokenHash }: Pick<Administrator, "tokenHash">,
  defaults: NewKitchenSettings,
) {
  return currentPriceDashboardWorld().defaults.save({
    expectedRevision: await defaultsRevision(),
    expectedAvailabilityRevision: await availabilityHead(),
    defaults,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS,
      },
      entry: {
        action: "kitchen-defaults-saved",
        detail: { changedFields: ["material"] },
      },
    },
  });
}

/** Saves defaults through the fake store as a staff member would, so the head and the defaults revision both move. */
export async function saveDefaults(
  administrator: Pick<Administrator, "tokenHash">,
  defaults: NewKitchenSettings,
): Promise<void> {
  const saved = await trySaveDefaults(administrator, defaults);
  if (saved.kind !== "ok") throw new Error("the test's defaults save refused");
}

const BOOK = ANCHORED_BOOK;

const HANDLES: readonly ItemRef[] = HandleSchema.options.map((handle) => ({
  kind: "handle",
  handle,
}));

/** Every item the world's book states and the catalogue can switch: tiers, handles, palette colours and accessories. */
export const STATED_ITEMS: readonly ItemRef[] = [
  ...tierItems(BOOK.material, "material"),
  ...tierItems(BOOK.hardware, "hardware"),
  ...HANDLES,
  ...MATERIALS.flatMap((material) => finishItems(paletteEntriesOf(material))),
  ...listAccessoryIds(BOOK).map(
    (accessoryId): ItemRef => ({ kind: "accessory", accessoryId }),
  ),
];

/** Items shaped right and stated nowhere. */
export const UNSTATED_ITEMS: readonly ItemRef[] = [
  { kind: "material", tierId: "material.unheard-of" },
  { kind: "hardware", tierId: "hardware.unheard-of" },
  { kind: "finish", finishId: "unheard-of" },
  { kind: "accessory", accessoryId: "accessory.unheard-of" },
];

/** The groups the customer must always have one active option of. */
export const SWITCHABLE_GROUPS: readonly (readonly ItemRef[])[] = [
  tierItems(BOOK.material, "material"),
  tierItems(BOOK.hardware, "hardware"),
  HANDLES,
  ...MATERIALS.map((material) =>
    finishItems(paletteEntriesOf(material)),
  ).filter((palette) => palette.length > 0),
];

/** Publishes `book` as the next version against the heads as they are now, as an administrator's publish would. */
export async function publishNextVersion(
  { tokenHash }: Pick<Administrator, "tokenHash">,
  book: PriceBook,
) {
  const { stores, priceBook } = currentPriceDashboardWorld();
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("nothing to publish after");
  return priceBook.publish({
    expectedDraftRevision: (await stores.priceBook.readDraft()).draftRevision,
    expectedActiveSequence: active.version.sequenceNumber,
    expectedAvailabilityRevision: await availabilityHead(),
    createdItems: [],
    label: "Next",
    note: "",
    book,
    changeSummary: [],
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS,
      },
      entry: {
        action: "price-published",
        detail: { provisional: book.amountsProvisional },
      },
    },
  });
}
