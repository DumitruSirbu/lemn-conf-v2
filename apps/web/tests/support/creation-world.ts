import { vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  parsePriceBook,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { freshAccountWorld, jsonOf } from "./account-world";
import {
  changeDraft,
  createAccessoryInDraft,
  createHardwareClassInDraft,
  currentDraftRevision,
  revertDraft,
} from "./price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "./price-dashboard-world";
import { freshStaffWorld, signedInAs } from "./staff-world";

// A signed-in administrator over the price dashboard world, and the requests of a creation as a person's page sends
// them. A test file mocks the session, audit and price stores itself and calls `startCreationWorld` in `beforeEach`.

export interface CreationWorld {
  readonly prices: PriceDashboardWorld;
  readonly cookie: string;
  readonly tokenHash: string;
}

export const CLASS_WORDS = {
  name: "GTV Economic",
  description: "Mecanisme simple",
};
export const LINKED_BUILD_ID = "base-3drawer";
export const ACCESSORY_VALUE = {
  linkedBuildId: LINKED_BUILD_ID,
  perUnitMinor: 1_000,
  name: "Soclu luminos",
};

export async function startCreationWorld(
  book: PriceBook,
): Promise<CreationWorld> {
  freshAccountWorld();
  freshStaffWorld();
  const prices = await freshPriceDashboardWorld({ book });
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  return { prices, cookie: session.cookie, tokenHash: session.tokenHash };
}

export type RatesOfAClass = Record<
  (typeof HARDWARE_RATE_FIELDS)[number],
  number
>;

export function ratesOf(amountMinor: number): RatesOfAClass {
  return Object.fromEntries(
    HARDWARE_RATE_FIELDS.map((field) => [field, amountMinor]),
  ) as RatesOfAClass;
}

/** The book of the version the world serves, parsed as a reader of the store parses it. */
export async function activeBookOf(
  prices: PriceDashboardWorld,
): Promise<PriceBook> {
  const active = await prices.stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the world has no version");
  const parsed = parsePriceBook(active.version.book);
  if (!parsed.ok) throw new Error("the active version holds no book");
  return parsed.book;
}

export async function createClassAs(
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return createHardwareClassInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
      ...body,
    },
  });
}

export async function createAccessoryAs(
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return createAccessoryInDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      value: ACCESSORY_VALUE,
      ...body,
    },
  });
}

export async function putChangeAs(
  cookie: string,
  change: { readonly address: unknown; readonly value: unknown },
): Promise<Response> {
  return changeDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), change },
  });
}

export async function revertAs(
  cookie: string,
  target: unknown,
): Promise<Response> {
  return revertDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), target },
  });
}

export async function storedChangesOf(
  prices: PriceDashboardWorld,
): Promise<readonly DraftChange[]> {
  return (await prices.stores.priceBook.readDraft())
    .changes as readonly DraftChange[];
}

/** Writes `changes` as the draft, past every boundary: what a store could hold that no route would write. */
export async function plantDraft(
  world: CreationWorld,
  changes: readonly unknown[],
): Promise<void> {
  const written = await world.prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes: changes as readonly DraftChange[],
    audit: {
      session: {
        sessionTokenHash: world.tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft not written");
}

/** The id the server minted, from the body of a creation's `200`. */
export async function mintedIdOf(answer: Response): Promise<string> {
  const body = (await jsonOf(answer)) as {
    created: { tierId?: string; accessoryId?: string };
  };
  const id = body.created.tierId ?? body.created.accessoryId;
  if (id === undefined) throw new Error("the answer names no created row");
  return id;
}
