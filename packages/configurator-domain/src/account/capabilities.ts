// What an account may do. A capability is one action a route can check, a role is a named set of them, and
// an account holds exactly one role (ADR 0172 decision 7). Changing what a role may do is a reviewed edit
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
  "account.manage.own",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What a client can do with its own designs. The client alone holds these: a staff account that browses as a
 *  visitor keeps its designs as a visitor's, and one that signs in does not claim, own or read-by-account any
 *  (ADR 0172 D8, Amendment B). Claiming and owning are therefore decided by this capability, not by a role name. */
const CLIENT_DESIGN_CAPABILITIES = [
  "design.read.own",
  "design.edit.own",
] as const satisfies readonly Capability[];

/** What every signed-in account may do to its own sign-in details (profile, password, e-mail): every role holds it,
 *  staff included. It is held apart from the client's design pair so the administrator's set, which drops that pair,
 *  keeps it. */
const SELF_SERVICE_CAPABILITIES = [
  "account.manage.own",
] as const satisfies readonly Capability[];

const CLIENT_CAPABILITIES = [
  ...CLIENT_DESIGN_CAPABILITIES,
  ...SELF_SERVICE_CAPABILITIES,
] as const satisfies readonly Capability[];

const OPERATOR_CAPABILITIES = [
  "design.read.any",
  "contact.read",
  "contact.update-status",
  "note.write",
  "design.unhide",
  ...SELF_SERVICE_CAPABILITIES,
] as const satisfies readonly Capability[];

/** Every capability but the client's own-design pair: an administrator holds all of staff's, none of the client's. */
const ADMINISTRATOR_CAPABILITIES = CAPABILITIES.filter(
  (capability) => !CLIENT_DESIGN_CAPABILITIES.some((own) => own === capability),
);

/** The role names are the owner's three. A role is stored as text, so the keys here are the only list. */
export const ROLES = {
  client: CLIENT_CAPABILITIES,
  operator: OPERATOR_CAPABILITIES,
  administrator: ADMINISTRATOR_CAPABILITIES,
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
