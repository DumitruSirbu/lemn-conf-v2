import "server-only";

import {
  HandleSchema,
  MAX_IDENTIFIER_LENGTH,
  type CatalogueAvailability,
  type ItemRef,
} from "@lemnaria/configurator-domain";

/** How many items may be switched off at once. The book offers fewer than this many items in all; a larger answer is a
 *  store that cannot be believed, not a catalogue. */
export const MAX_DISABLED_ITEMS = 500;

/** The widest a revision can be: the digits of a `bigint`. */
const MAX_REVISION_LENGTH = 19;

/** Why an availability answer was not handed on: too large to serialise into every page, or not the shape it declares. */
export type AvailabilityRefusal = "too-large" | "unreadable";

export type ProjectedAvailability =
  | { readonly ok: true; readonly availability: CatalogueAvailability }
  | { readonly ok: false; readonly refusal: AvailabilityRefusal };

/** The one member that names an item's id, for each kind of item the catalogue can switch off. */
const ID_MEMBER_OF_KIND = {
  material: "tierId",
  hardware: "tierId",
  finish: "finishId",
  handle: "handle",
  accessory: "accessoryId",
} as const;

type ItemKind = keyof typeof ID_MEMBER_OF_KIND;

/**
 * The availability answer as the catalogue declares it and nothing more: a revision, and a list of items each of a known
 * kind holding one id, as text of a bounded length (a handle from its closed list). The answer is serialised into every
 * page, so a value that is not text, an extra member, or a size nobody bounded would be a free multiplier on all of them;
 * anything that is not exactly this is refused, and a list that is not a list is refused rather than failing a request.
 */
export function projectAvailability(answer: unknown): ProjectedAvailability {
  if (typeof answer !== "object" || answer === null) return unreadable();
  const revision = ownMemberOf(answer, "revision");
  const disabled = ownMemberOf(answer, "disabled");
  if (typeof revision !== "string" || !Array.isArray(disabled)) {
    return unreadable();
  }
  if (revision.length > MAX_REVISION_LENGTH) return tooLarge();
  if (disabled.length > MAX_DISABLED_ITEMS) return tooLarge();
  const items: ItemRef[] = [];
  for (const item of disabled as unknown[]) {
    const projected = projectItem(item);
    if (projected === "too-large") return tooLarge();
    if (projected === undefined) return unreadable();
    items.push(projected);
  }
  return { ok: true, availability: { revision, disabled: items } };
}

function projectItem(item: unknown): ItemRef | "too-large" | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const kind = ownMemberOf(item, "kind");
  if (typeof kind !== "string" || !Object.hasOwn(ID_MEMBER_OF_KIND, kind)) {
    return undefined;
  }
  const member = ID_MEMBER_OF_KIND[kind as ItemKind];
  const id = ownMemberOf(item, member);
  if (typeof id !== "string" || id.length === 0) return undefined;
  if (id.length > MAX_IDENTIFIER_LENGTH) return "too-large";
  if (kind === "handle" && !HandleSchema.safeParse(id).success) {
    return undefined;
  }
  return { kind, [member]: id } as ItemRef;
}

/** A member the object owns, and nothing it merely inherits: a stored answer is data, and a prototype is not part of it. */
function ownMemberOf(source: object, member: string): unknown {
  return Object.hasOwn(source, member)
    ? (source as Record<string, unknown>)[member]
    : undefined;
}

function unreadable(): ProjectedAvailability {
  return { ok: false, refusal: "unreadable" };
}

function tooLarge(): ProjectedAvailability {
  return { ok: false, refusal: "too-large" };
}
