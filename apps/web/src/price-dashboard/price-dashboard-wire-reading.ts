import {
  readBulk,
  type DraftBulk,
  type DraftChange,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import type {
  DashboardBookPayload,
  DashboardDraftWire,
  DashboardStateWire,
  DraftChangeCreatedWire,
} from "./price-dashboard-wire-contract";

// What the dashboard's routes answer, read before it is believed: the draft and the state, each rebuilt from the
// members its wire declares, so that nothing else the answer carried reaches a screen. Used by the browser's client
// and by the server's source of the cabinet list.

/** A date the wire states as text that a screen can format: `Intl` throws on one it cannot read. */
export function isReadableInstant(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof ownValueOf(ownValueOf(value, "address"), "kind") === "string"
  );
}

/** The draft as the routes send it: a revision, changes that name an address. `applyChanges` judges the rest. */
export function readDraftWire(body: unknown): DashboardDraftWire | undefined {
  const draftRevision = ownValueOf(body, "draftRevision");
  const declared = ownValueOf(body, "changes");
  if (typeof draftRevision !== "string" || !Array.isArray(declared)) {
    return undefined;
  }
  const changes: DraftChange[] = [];
  for (const change of declared as readonly unknown[]) {
    const read = readChange(change);
    if (read === undefined) return undefined;
    changes.push(read);
  }
  return { draftRevision, changes };
}

/** The answer to a creation: the draft, and the hardware class or accessory whose id the server minted. */
export function readDraftChangeCreatedWire(
  body: unknown,
): DraftChangeCreatedWire | undefined {
  const draft = readDraftWire(ownValueOf(body, "draft"));
  const created = readCreatedRow(ownValueOf(body, "created"));
  return draft === undefined || created === undefined
    ? undefined
    : { draft, created };
}

/** The row a creation made, rebuilt from its kind and the one id that kind names; no other kind is a created row. */
function readCreatedRow(declared: unknown): ItemRef | undefined {
  const kind = ownValueOf(declared, "kind");
  if (kind === "hardware") {
    const tierId = ownValueOf(declared, "tierId");
    return typeof tierId === "string" ? { kind, tierId } : undefined;
  }
  const accessoryId = ownValueOf(declared, "accessoryId");
  return kind === "accessory" && typeof accessoryId === "string"
    ? { kind, accessoryId }
    : undefined;
}

/** A change rebuilt from the members a draft change declares, so nothing else the answer carried reaches the screen. */
function readChange(declared: unknown): DraftChange | undefined {
  if (!isChange(declared)) return undefined;
  const declaredBulk = ownValueOf(declared, "bulk");
  const bulk =
    declaredBulk === undefined ? undefined : readBulkOf(declaredBulk);
  const groupId = ownValueOf(declared, "groupId");
  const isBulkUnreadable = declaredBulk !== undefined && bulk === undefined;
  const isGroupIdUnreadable =
    groupId !== undefined && typeof groupId !== "string";
  if (isBulkUnreadable || isGroupIdUnreadable) return undefined;
  return {
    address: ownValueOf(declared, "address"),
    value: ownValueOf(declared, "value"),
    ...(groupId === undefined ? {} : { groupId }),
    ...(bulk === undefined ? {} : { bulk }),
  } as DraftChange;
}

/** The bulk action's own three members, judged by the domain; a member beside them is dropped. */
function readBulkOf(declared: unknown): DraftBulk | undefined {
  const groupCode = ownValueOf(declared, "groupCode");
  return readBulk({
    percent: ownValueOf(declared, "percent"),
    scope: ownValueOf(declared, "scope"),
    ...(groupCode === undefined ? {} : { groupCode }),
  });
}

/** The dashboard's state as `GET /api/staff/prices` sends it; the book is judged by whoever applies the draft to it. */
export function readDashboardStateWire(
  body: unknown,
): DashboardStateWire | undefined {
  const active = ownValueOf(body, "active");
  const draft = readDraftWire(ownValueOf(body, "draft"));
  if (draft === undefined || !isRecord(active)) return undefined;
  const book = ownValueOf(active, "book");
  const availability = ownValueOf(active, "availability");
  const versionId = ownValueOf(active, "versionId");
  const sequenceNumber = ownValueOf(active, "sequenceNumber");
  const label = ownValueOf(active, "label");
  const publishedAt = ownValueOf(active, "publishedAt");
  if (!isRecord(book) || !isRecord(availability)) return undefined;
  if (typeof versionId !== "string" || typeof sequenceNumber !== "number") {
    return undefined;
  }
  if (typeof label !== "string" || !isReadableInstant(publishedAt)) {
    return undefined;
  }
  return {
    active: {
      versionId,
      sequenceNumber,
      label,
      publishedAt,
      book: book as DashboardBookPayload["book"],
      availability: availability as DashboardBookPayload["availability"],
    },
    draft,
  };
}
