// What an account may do. A capability is one action a route can check, a role is a named set of them, and
// an account holds exactly one role (ADR 0169 decision 7). Changing what a role may do is a reviewed edit
// of this file: there is no runtime role editor, and the application's database role cannot write `role`.

/** Every action a route may ask about. There is no `design.edit.any`, and none may be added without the
 *  owner's ruling (Fix 3, Q-F3-4): staff read any design and never change one. */
export const CAPABILITIES = [
  "design.read.own",
  "design.edit.own",
  "design.read.any",
  "design.unhide",
  "contact.read",
  "contact.update-status",
  "note.write",
  "preset.create",
  "preset.manage",
  "price.edit",
  "translation.edit",
  "user.manage",
  "audit.read",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What every account can do with its own designs. Staff hold it too, because a visitor with no account can
 *  already make designs and a staff account must not be able to do less. */
const CLIENT_CAPABILITIES = [
  "design.read.own",
  "design.edit.own",
] as const satisfies readonly Capability[];

const OPERATOR_CAPABILITIES = [
  ...CLIENT_CAPABILITIES,
  "design.read.any",
  "contact.read",
  "contact.update-status",
  "note.write",
  "design.unhide",
] as const satisfies readonly Capability[];

/** The role names are the owner's three. A role is stored as text, so the keys here are the only list. */
export const ROLES = {
  client: CLIENT_CAPABILITIES,
  operator: OPERATOR_CAPABILITIES,
  administrator: CAPABILITIES,
} as const satisfies Readonly<Record<string, readonly Capability[]>>;
export type Role = keyof typeof ROLES;

/** Whether text names a role. Own keys only, so `"constructor"` and `"__proto__"` are not roles. */
export function isRole(text: string): text is Role {
  return Object.hasOwn(ROLES, text);
}

/** An unknown role has no capability: text read from a row that names no role grants nothing. */
export function hasCapability(role: string, capability: Capability): boolean {
  return isRole(role) && ROLES[role].some((held) => held === capability);
}
