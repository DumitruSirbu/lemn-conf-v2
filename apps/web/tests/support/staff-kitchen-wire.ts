// One staff kitchen as `GET /api/staff/kitchens/{id}` writes it. Every member can be replaced, so a test names only what it
// varies; a member given as `undefined` is left out of the object. The server and its refusals are
// `staff-kitchens-wire.ts`'s (`installStaffKitchensServer`, `RATE_LIMITED_ANSWER`, and the rest).
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";

import { staffKitchenIdOf } from "./staff-kitchens-wire";

export const STAFF_KITCHEN_ID = staffKitchenIdOf(1);

/** The document as it travels: the server answers JSON, so no `undefined` and no class instance survives. */
export const WIRE_DESIGN: unknown = JSON.parse(
  JSON.stringify(KITCHEN_L_DESIGN),
);

const SENT_AT = "2026-10-17T11:08:00.000Z";
const UPDATED_AT = "2026-10-19T09:00:00.000Z";
const CHANGED_AT = "2026-10-18T11:22:00.000Z";

export interface WireKitchenOverrides {
  readonly kitchen?: Record<string, unknown>;
  readonly client?: unknown;
  readonly request?: unknown;
  readonly status?: unknown;
  readonly notes?: unknown;
  readonly notesTruncated?: unknown;
}

/** A sent kitchen of a client with a profile: the document as sent, a request, status "new" never changed, no notes. */
export function wireKitchen({
  kitchen,
  ...members
}: WireKitchenOverrides = {}): Record<string, unknown> {
  return withoutUndefinedMembers({
    kitchen: withoutUndefinedMembers({
      id: STAFF_KITCHEN_ID,
      name: "Casa din Orhei",
      design: WIRE_DESIGN,
      asSent: WIRE_DESIGN,
      isSent: true,
      isHidden: false,
      sentAt: SENT_AT,
      updatedAt: UPDATED_AT,
      ...kitchen,
    }),
    client: {
      email: "ana.popescu@mail.md",
      name: "Ana Popescu",
      phone: "078900555",
    },
    request: { reference: "LEM-2026-0417", sentAt: SENT_AT },
    status: { value: "new", changedBy: null, changedAt: null },
    notes: [],
    notesTruncated: false,
    ...members,
  });
}

/** A draft: no request, no status, no as-sent copy. */
export function wireDraftKitchen({
  kitchen,
  ...members
}: WireKitchenOverrides = {}): Record<string, unknown> {
  return wireKitchen({
    kitchen: { isSent: false, sentAt: null, asSent: null, ...kitchen },
    request: null,
    status: null,
    ...members,
  });
}

/** A status somebody saved: who and when. */
export function wireChangedStatus(
  value: unknown,
  changedBy: unknown = { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
): Record<string, unknown> {
  return { value, changedBy, changedAt: CHANGED_AT };
}

function withoutUndefinedMembers(
  wire: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(wire).filter(([, value]) => value !== undefined),
  );
}
