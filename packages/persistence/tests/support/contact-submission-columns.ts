/** The seven columns the application role may read (the owner's grant, with update narrowed to notified-at), in the table's order. */
export const READABLE_COLUMNS: readonly string[] = [
  "client_request_id",
  "reference",
  "design_id",
  "design_revision",
  "payload_digest",
  "created_at",
  "notified_at",
];

/**
 * The one column the owner's grant adds to those seven, in the same step as migration `0026` (ADR 0178 F2, M10 wave S4):
 * `GRANT SELECT (priced) ON TABLE public.contact_submissions TO app_designs;`. `0008`'s header classes it as not
 * personal. The staff kitchen page reads the total and the currency from it, and the store of contact requests reads it
 * nowhere, so `READABLE_COLUMNS` above stays the list of what the contact store's own statements may name.
 */
export const COLUMNS_ADDED_BY_0026: readonly string[] = ["priced"];

/** What the application role may select once the `0026` grant is issued: the seven, then `priced`, and nothing wider. */
export const READABLE_COLUMNS_WITH_0026: readonly string[] = [
  ...READABLE_COLUMNS,
  ...COLUMNS_ADDED_BY_0026,
];

/** Written once and read by nobody: a person's name and the ways to reach them. */
export const PERSONAL_COLUMNS: readonly string[] = [
  "name",
  "phone",
  "phone_normal_form",
  "locality",
  "channel",
  "email",
];

/** Not personal, and not read by any statement of the contact store. `priced` is the exception since `0026`: the staff
 *  kitchen statement reads it, under `COLUMNS_ADDED_BY_0026`; no statement of the contact store does. */
export const OTHER_UNREAD_COLUMNS: readonly string[] = [
  "consent_text_version",
  "locale",
  "intent",
  "design_document",
  "priced",
];

export const ALL_COLUMNS: readonly string[] = [
  ...READABLE_COLUMNS,
  ...PERSONAL_COLUMNS,
  ...OTHER_UNREAD_COLUMNS,
];

/** The one column the role may update: the mark. */
export const UPDATABLE_COLUMNS: readonly string[] = ["notified_at"];

export const UNREADABLE_COLUMNS: readonly string[] = [
  ...PERSONAL_COLUMNS,
  ...OTHER_UNREAD_COLUMNS,
];
