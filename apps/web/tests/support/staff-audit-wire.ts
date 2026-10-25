// The audit log as a browser meets it: rows as `GET /api/staff/audit` writes them, the page around them, and the
// accounts they name. Every member of a row can be replaced, so a test names only what it varies. The stand-in for
// `fetch` is the staff kitchens list's (`installStaffKitchensServer`), which serves any address.
import { staffKitchenIdOf } from "./staff-kitchens-wire";

export const STAFF_AUDIT_WIRE_PAGE_SIZE = 25;
const ACCOUNT_ID_LENGTH = 21;
const FIRST_OCCURRED_AT_MS = Date.UTC(2026, 9, 19, 11, 32, 0);

/** A 21-character account id of the shape the page accepts, distinct for each `serial`. */
export function auditAccountIdOf(serial: number): string {
  return `a${String(serial).padStart(ACCOUNT_ID_LENGTH - 1, "0")}`;
}

/** A 21-character event id, distinct for each `serial`. */
export function auditEventIdOf(serial: number): string {
  return `e${String(serial).padStart(ACCOUNT_ID_LENGTH - 1, "0")}`;
}

export const OPERATOR_ADDRESS = "mihai.rusu@lemnaria.md";
export const ADMINISTRATOR_ADDRESS = "elena.munteanu@lemnaria.md";
export const CLIENT_ADDRESS = "ana.popescu@mail.md";

export interface WireAuditEventOverrides {
  readonly id?: unknown;
  readonly occurredAt?: unknown;
  readonly entry?: unknown;
  readonly actor?: unknown;
  readonly subject?: unknown;
  readonly kitchen?: unknown;
}

export const OPENED_ENTRY = {
  kind: "recognised",
  action: "kitchen-opened",
  detail: null,
} as const;

/** One row as the server writes it: the operator opened a client's kitchen, a minute older for each `serial`. */
export function wireAuditEvent(
  serial: number,
  overrides: WireAuditEventOverrides = {},
): Record<string, unknown> {
  const event: Record<string, unknown> = {
    id: auditEventIdOf(serial),
    occurredAt: new Date(FIRST_OCCURRED_AT_MS - serial * 60_000).toISOString(),
    entry: OPENED_ENTRY,
    actor: { id: auditAccountIdOf(1), email: OPERATOR_ADDRESS },
    subject: { email: CLIENT_ADDRESS },
    kitchen: {
      id: staffKitchenIdOf(serial),
      name: `Bucatarie ${String(serial)}`,
    },
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined),
  );
}

export interface WireAuditPageOverrides {
  readonly total?: unknown;
  readonly page?: unknown;
  readonly pageSize?: unknown;
}

export function wireAuditPage(
  events: readonly unknown[],
  overrides: WireAuditPageOverrides = {},
): Record<string, unknown> {
  return {
    total: events.length,
    page: 1,
    pageSize: STAFF_AUDIT_WIRE_PAGE_SIZE,
    events,
    ...overrides,
  };
}

/** The rows `first` to `first + count - 1`, as a page of the log would carry them. */
export function auditEventsFrom(first: number, count: number): unknown[] {
  return Array.from({ length: count }, (_, index) =>
    wireAuditEvent(first + index),
  );
}
