/** The seven columns the application role may read (Q14 (i), narrowed by 8I's R1), in the table's order. */
export const READABLE_COLUMNS: readonly string[] = [
  "client_request_id",
  "reference",
  "design_id",
  "design_revision",
  "payload_digest",
  "created_at",
  "notified_at",
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

/** Not personal, and not read by any application statement either. */
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
