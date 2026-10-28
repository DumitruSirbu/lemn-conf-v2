import {
  readBulk,
  type DraftBulk,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { readAppliedAddress } from "@/lib/server/price-dashboard/draft-address";
import {
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";

// A stored draft is jsonb: it was written by this build, but the database is not part of its type system, so every change
// is rebuilt member by member before anything judges or serves it. A change that is not exactly what a draft holds makes the
// whole draft unreadable; a route never serves, and never applies, a part of it.

export type StoredDraftReading =
  | { readonly ok: true; readonly changes: readonly DraftChange[] }
  | { readonly ok: false };

/** `stored` is whatever the store answered: a draft that is not a list at all is unreadable, never a thrown error. */
export function readStoredDraft(stored: unknown): StoredDraftReading {
  if (!Array.isArray(stored)) return { ok: false };
  const changes: DraftChange[] = [];
  for (const declared of stored as readonly unknown[]) {
    const change = readStoredChange(declared);
    if (change === undefined) return { ok: false };
    changes.push(change);
  }
  return { ok: true, changes };
}

function readStoredChange(declared: unknown): DraftChange | undefined {
  if (!isPlainRecord(declared)) return undefined;
  const members = declared;
  const address = readAppliedAddress(members.address);
  const value = members.value;
  if (address.kind !== "address" || !isStoredValue(value)) return undefined;
  const grouping = readGrouping(members);
  if (grouping === undefined) return undefined;
  return { address: address.address, value, ...grouping } as DraftChange;
}

function isStoredValue(value: unknown): value is number | boolean {
  return typeof value === "number" || typeof value === "boolean";
}

interface Grouping {
  readonly groupId?: string;
  readonly bulk?: DraftBulk;
}

/** `groupId` and `bulk` come together or not at all; `undefined` is a pair that does not. */
function readGrouping(
  members: Readonly<Record<string, unknown>>,
): Grouping | undefined {
  const groupId = members.groupId;
  const declaredBulk = members.bulk;
  if (groupId === undefined && declaredBulk === undefined) return {};
  const bulk = readBulk(declaredBulk);
  if (!isIdentifier(groupId) || bulk === undefined) return undefined;
  return { groupId, bulk: copiedBulk(bulk) };
}

function copiedBulk(bulk: DraftBulk): DraftBulk {
  const { percent, scope, groupCode } = bulk;
  return groupCode === undefined
    ? { percent, scope }
    : { percent, scope, groupCode };
}
