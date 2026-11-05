import { CHANGE_REFUSAL_CODES } from "@lemnaria/configurator-domain";
import type { ItemRef } from "@lemnaria/configurator-domain";

import { ownValueOf } from "@/staff/staff-kitchens-wire-reading";

import type {
  CandidateRefusalWire,
  PriceVersionListWire,
  PriceVersionSummaryWire,
  PublishedWire,
  RestoredWire,
} from "./price-dashboard-wire-contract";
import {
  isReadableInstant,
  readDraftWire,
} from "./price-dashboard-wire-reading";

// What the publish, history and restore routes answer, read before it is believed: each body is rebuilt from the
// members its wire declares, and one that is not exactly that is `undefined`, which the client counts as a failure.

export function readPublishedWire(body: unknown): PublishedWire | undefined {
  const versionId = ownValueOf(body, "versionId");
  const sequenceNumber = ownValueOf(body, "sequenceNumber");
  const availabilityRevision = ownValueOf(body, "availabilityRevision");
  if (
    typeof versionId !== "string" ||
    typeof sequenceNumber !== "number" ||
    typeof availabilityRevision !== "string"
  ) {
    return undefined;
  }
  return { versionId, sequenceNumber, availabilityRevision };
}

export function readRestoredWire(body: unknown): RestoredWire | undefined {
  const draft = readDraftWire(ownValueOf(body, "draft"));
  const addedChangeCount = ownValueOf(body, "addedChangeCount");
  if (draft === undefined || typeof addedChangeCount !== "number") {
    return undefined;
  }
  return { draft, addedChangeCount };
}

export function readVersionListWire(
  body: unknown,
): PriceVersionListWire | undefined {
  const total = ownValueOf(body, "total");
  const page = ownValueOf(body, "page");
  const pageSize = ownValueOf(body, "pageSize");
  const declared = ownValueOf(body, "versions");
  if (
    typeof total !== "number" ||
    typeof page !== "number" ||
    typeof pageSize !== "number" ||
    !Array.isArray(declared)
  ) {
    return undefined;
  }
  const versions: PriceVersionSummaryWire[] = [];
  for (const entry of declared as readonly unknown[]) {
    const summary = readSummary(entry);
    if (summary === undefined) return undefined;
    versions.push(summary);
  }
  return { total, page, pageSize, versions };
}

function readSummary(entry: unknown): PriceVersionSummaryWire | undefined {
  const versionId = ownValueOf(entry, "versionId");
  const sequenceNumber = ownValueOf(entry, "sequenceNumber");
  const label = ownValueOf(entry, "label");
  const state = ownValueOf(entry, "state");
  const publishedAt = ownValueOf(entry, "publishedAt");
  const changeCount = ownValueOf(entry, "changeCount");
  if (
    typeof versionId !== "string" ||
    typeof sequenceNumber !== "number" ||
    typeof label !== "string" ||
    (state !== "active" && state !== "archived") ||
    !isReadableInstant(publishedAt) ||
    typeof changeCount !== "number"
  ) {
    return undefined;
  }
  return {
    versionId,
    sequenceNumber,
    label,
    state,
    publishedAt,
    changeCount,
  };
}

const REFUSAL_SOURCES = ["changes", "pricing", "catalogue"] as const;

/**
 * The reasons of a `409 candidate-refused`. An entry that is not one of the three sources, or lacks the members of
 * its source, is left out; of the others only the members that are text or numbers are kept, so nothing nested
 * reaches a screen.
 */
export function readCandidateRefusals(
  body: unknown,
): readonly CandidateRefusalWire[] {
  const declared = ownValueOf(body, "refusals");
  if (!Array.isArray(declared)) return [];
  return (declared as readonly unknown[]).flatMap((entry) => {
    const refusal = readRefusal(entry);
    return refusal === undefined ? [] : [refusal];
  });
}

function readRefusal(entry: unknown): CandidateRefusalWire | undefined {
  const source = ownValueOf(entry, "source");
  const code = ownValueOf(entry, "code");
  if (!REFUSAL_SOURCES.some((known) => known === source)) return undefined;
  if (typeof code !== "string") return undefined;
  if (source === "changes") return readChangeRefusal(entry, code);
  return { ...primitiveMembersOf(entry), source, code } as CandidateRefusalWire;
}

function readChangeRefusal(
  entry: unknown,
  code: string,
): CandidateRefusalWire | undefined {
  const index = ownValueOf(entry, "index");
  const known = CHANGE_REFUSAL_CODES.find((candidate) => candidate === code);
  if (typeof index !== "number" || known === undefined) return undefined;
  return { source: "changes", index, code: known };
}

function primitiveMembersOf(
  entry: unknown,
): Readonly<Record<string, string | number>> {
  const members: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(entry as object)) {
    if (typeof value === "string" || typeof value === "number") {
      members[name] = value;
    }
  }
  return members;
}

/** The item a `409 item-is-default` names. */
export function readWireItemRef(declared: unknown): ItemRef | undefined {
  const kind = ownValueOf(declared, "kind");
  const tierId = ownValueOf(declared, "tierId");
  const accessoryId = ownValueOf(declared, "accessoryId");
  if (
    (kind === "material" || kind === "hardware") &&
    typeof tierId === "string"
  ) {
    return { kind, tierId };
  }
  if (kind === "accessory" && typeof accessoryId === "string") {
    return { kind, accessoryId };
  }
  return undefined;
}
