import { isUnstorableText } from "@lemnaria/configurator-domain";
import type { SubmissionSnapshot } from "@lemnaria/configurator-domain";

import { refusalOf, requireObject } from "./contact-submission-refusal.js";

/** How many levels of lists and objects a snapshot may nest, the root object counting as the first. A design's and a
 *  price's depths are fixed by their types and are a handful; the bound is far from all of them and does not move
 *  with a runtime's stack, which is where `JSON.parse` and `JSON.stringify` give out. */
const MAX_SNAPSHOT_DEPTH = 64;

/** The two snapshot columns as the statement carries them: the document is the text handed in, and the priced design is
 *  the text its walked value encodes to. */
export interface SnapshotJson {
  readonly document: string;
  readonly priced: string;
}

export function judgeSnapshot(
  snapshot: SubmissionSnapshot | undefined,
): SnapshotJson {
  if (snapshot === undefined) throw refusalOf("snapshot");
  requireObject(snapshot, "snapshot");
  return {
    document: judgedDocument(snapshot.document),
    priced: judgedPriced(snapshot.priced),
  };
}

/** The document's own text, refused unless it is exactly what `JSON.stringify` makes of its parsed value, so that the
 *  text handed in, the text judged and the text sent are one text. A number a double cannot hold, a key written twice,
 *  a needless escape and a space are each refused and never rewritten. Depth is judged on the text, before anything
 *  parses or encodes it. */
function judgedDocument(document: unknown): string {
  if (typeof document !== "string") throw refusalOf("snapshotDocument");
  if (isNestedDeeperThanTheBound(document)) throw refusalOf("snapshotDepth");
  const parsed = parsedObjectOf(document);
  requireStorableJson(parsed, "snapshotDocument");
  if (JSON.stringify(parsed) !== document) throw refusalOf("snapshotDocument");
  return document;
}

/** The priced design is judged as a value, before anything encodes it, and then encoded once. */
function judgedPriced(priced: unknown): string {
  requireStorableJson(priced, "snapshotPriced");
  try {
    const encoded: unknown = JSON.stringify(priced);
    if (typeof encoded === "string") return encoded;
  } catch {
    // Refused below, as any other price the encoder cannot make into text.
  }
  throw refusalOf("snapshotPriced");
}

function parsedObjectOf(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw refusalOf("snapshotDocument");
  }
  if (!isJsonObject(parsed)) throw refusalOf("snapshotDocument");
  return parsed;
}

function isJsonObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Counts the lists and objects the text opens, outside its strings, one pass and no recursion. A text that is not
 *  JSON may count anything; `JSON.parse` refuses it afterwards. */
function isNestedDeeperThanTheBound(text: string): boolean {
  let depth = 0;
  let isInsideAString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (isInsideAString) {
      if (character === "\\") index += 1;
      else if (character === '"') isInsideAString = false;
    } else if (character === '"') isInsideAString = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") depth -= 1;
    if (depth > MAX_SNAPSHOT_DEPTH) return true;
  }
  return false;
}

type Verdict = "storable" | "unstorable" | "too deep";

interface PendingContainer {
  readonly container: object;
  readonly depth: number;
}

function requireStorableJson(
  root: unknown,
  part: "snapshotDocument" | "snapshotPriced",
): void {
  const verdict = verdictOnJson(root);
  if (verdict === "too deep") throw refusalOf("snapshotDepth");
  if (verdict === "unstorable") throw refusalOf(part);
}

/**
 * Whether a value is a plain object holding only plain objects and lists, text the database can hold, finite numbers,
 * booleans and null, no deeper than the bound. An object's member that is `undefined` is left out, as an encoder leaves
 * it; a list's is refused, which an encoder would write as `null`. Walked with a list of containers and not by
 * recursion, and a container met again at no greater depth is not walked again, so a cycle ends at the bound.
 */
function verdictOnJson(root: unknown): Verdict {
  try {
    return walkJson(root);
  } catch {
    // A getter, a proxy or a revoked object may throw anything, and what it throws may hold a value: the walk keeps
    // none of it, and a value that cannot be read is a value that cannot be stored.
    return "unstorable";
  }
}

function walkJson(root: unknown): Verdict {
  if (!isPlainObject(root)) return "unstorable";
  const pending: PendingContainer[] = [{ container: root, depth: 1 }];
  const deepestWalked = new Map<object, number>();
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next.depth > MAX_SNAPSHOT_DEPTH) return "too deep";
    if ((deepestWalked.get(next.container) ?? 0) >= next.depth) continue;
    deepestWalked.set(next.container, next.depth);
    const verdict = walkMembers(next, pending);
    if (verdict !== "storable") return verdict;
  }
  return "storable";
}

function walkMembers(
  { container, depth }: PendingContainer,
  pending: PendingContainer[],
): Verdict {
  if (Array.isArray(container)) {
    for (const member of container as unknown[]) {
      const verdict = judgedMember(member, depth + 1, pending);
      if (verdict !== "storable") return verdict;
    }
    return "storable";
  }
  for (const [key, member] of Object.entries(container)) {
    if (isUnstorableText(key)) return "unstorable";
    if (member === undefined) continue;
    const verdict = judgedMember(member, depth + 1, pending);
    if (verdict !== "storable") return verdict;
  }
  return "storable";
}

/** A leaf is judged here; a container is queued with its depth. */
function judgedMember(
  member: unknown,
  depth: number,
  pending: PendingContainer[],
): Verdict {
  if (typeof member === "string") {
    return isUnstorableText(member) ? "unstorable" : "storable";
  }
  if (typeof member === "number") {
    return Number.isFinite(member) ? "storable" : "unstorable";
  }
  if (typeof member === "boolean" || member === null) return "storable";
  if (!Array.isArray(member) && !isPlainObject(member)) return "unstorable";
  pending.push({ container: member, depth });
  return "storable";
}

function isPlainObject(value: unknown): value is object {
  if (!isJsonObject(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
