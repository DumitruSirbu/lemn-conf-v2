// The E1 wire (`GET /api/account/kitchens`) as the account tests build it: one kitchen of the page, with the stored
// document the domain ships, and the page around it. Every member can be replaced, so a test names only what it varies.
import {
  KITCHEN_L_DESIGN,
  kitchenSummaryOf,
  type Design,
  type KitchenSummary,
} from "@lemnaria/configurator-domain";

import type { ListedKitchen } from "@/account/kitchens/kitchens-answer";

const DESIGN_ID_LENGTH = 21;
const FIRST_UPDATED_AT_MS = Date.UTC(2026, 9, 19, 12, 0, 0);

/** A 21-character id of the shape `isDesignId` accepts, distinct for each `serial`. */
export function designIdOf(serial: number): string {
  return `k${String(serial).padStart(DESIGN_ID_LENGTH - 1, "0")}`;
}

export interface WireKitchenOverrides {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly updatedAt?: unknown;
  readonly isSent?: unknown;
  readonly summary?: unknown;
  readonly document?: unknown;
}

/** One kitchen of the page as the server writes it. A member given as `undefined` is left out of the object. */
export function wireKitchen(
  serial: number,
  overrides: WireKitchenOverrides = {},
): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    id: designIdOf(serial),
    name: null,
    updatedAt: new Date(FIRST_UPDATED_AT_MS - serial * 1000).toISOString(),
    isSent: false,
    summary: kitchenSummaryOf(KITCHEN_L_DESIGN),
    document: KITCHEN_L_DESIGN,
    ...overrides,
  };
  return withoutUndefinedMembers(wire);
}

export interface WirePageOverrides {
  readonly total?: unknown;
  readonly kitchens?: unknown;
  readonly nextCursor?: unknown;
}

export function wirePage(
  kitchens: readonly unknown[],
  overrides: WirePageOverrides = {},
): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    total: kitchens.length,
    kitchens,
    nextCursor: null,
    ...overrides,
  };
  return withoutUndefinedMembers(wire);
}

/** A kitchen as the screen holds it once the page is read, for tests that start from a listing. */
export function listedKitchen(
  serial: number,
  overrides: Partial<ListedKitchen> = {},
): ListedKitchen {
  const summary: KitchenSummary = kitchenSummaryOf(KITCHEN_L_DESIGN);
  const document: Design = KITCHEN_L_DESIGN;
  return {
    id: designIdOf(serial),
    name: undefined,
    updatedAtMs: FIRST_UPDATED_AT_MS - serial * 1000,
    updatedAtIso: new Date(FIRST_UPDATED_AT_MS - serial * 1000).toISOString(),
    isSent: false,
    summary,
    document,
    ...overrides,
  };
}

/** The object without its members whose value is `undefined`, which is how a test leaves a member out of a body. */
function withoutUndefinedMembers(
  wire: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(wire).filter(([, value]) => value !== undefined),
  );
}
