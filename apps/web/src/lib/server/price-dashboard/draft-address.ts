import {
  BOOK_FIELD_ADDRESS_KINDS,
  type AppliedAddress,
  type AppliedAddressKind,
  type BookFieldAddress,
} from "@lemnaria/configurator-domain";

import {
  isIdentifier,
  isPlainRecord,
} from "@/lib/server/price-dashboard/identifier-shape";

// An address read from outside TypeScript, a request's or a stored draft's: rebuilt member by member from the members its
// kind names, so nothing a crafted body adds ever reaches the draft's jsonb. Only the kinds `applyChanges` applies are read;
// the creation, text and deletion kinds arrive with M4 and R4a.

export type AddressReading =
  | { readonly kind: "address"; readonly address: AppliedAddress }
  /** A known kind that `applyChanges` does not apply yet. */
  | { readonly kind: "not-applied" }
  /** Not an object, a kind no address has, or a member missing or of another type. */
  | { readonly kind: "unknown" }
  /** A member the kind does not name. The request is one this route does not read. */
  | { readonly kind: "extra-member" };

const MEMBERS_OF_KIND: Readonly<Record<AppliedAddressKind, readonly string[]>> =
  {
    cabinet: ["ruleId", "field"],
    "cabinet-size": ["ruleId", "widthMm"],
    hardware: ["tierId", "field"],
    material: ["tierId", "field"],
    "depth-rule": [],
    accessory: ["accessoryId", "field"],
    provisional: [],
  };

const NUMBER_MEMBERS: readonly string[] = ["widthMm"];

export function readAppliedAddress(declared: unknown): AddressReading {
  if (!isPlainRecord(declared)) return { kind: "unknown" };
  const kind = declared.kind;
  if (!isAddressKind(kind)) return { kind: "unknown" };
  if (!isAppliedKind(kind)) return { kind: "not-applied" };
  const names = MEMBERS_OF_KIND[kind];
  const hasExtraMember = Object.keys(declared).some(
    (member) => member !== "kind" && !names.includes(member),
  );
  if (hasExtraMember) return { kind: "extra-member" };
  const members: Record<string, unknown> = { kind };
  for (const name of names) {
    const member = declared[name];
    if (!isMemberOfRightType(name, member)) return { kind: "unknown" };
    members[name] = member;
  }
  return { kind: "address", address: members as unknown as AppliedAddress };
}

function isMemberOfRightType(name: string, member: unknown): boolean {
  if (NUMBER_MEMBERS.includes(name)) {
    return typeof member === "number" && Number.isFinite(member);
  }
  return isIdentifier(member);
}

function isAddressKind(kind: unknown): kind is BookFieldAddress["kind"] {
  return (BOOK_FIELD_ADDRESS_KINDS as readonly unknown[]).includes(kind);
}

function isAppliedKind(
  kind: BookFieldAddress["kind"],
): kind is AppliedAddressKind {
  return Object.hasOwn(MEMBERS_OF_KIND, kind);
}
