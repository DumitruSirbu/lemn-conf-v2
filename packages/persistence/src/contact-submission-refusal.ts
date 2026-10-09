// The sentences of the contact submission store's refusals and the one place they are made. A refusal names a part and
// never a value.

/** The parts of a request the table constrains, each with the one sentence that says what it must be. A refusal names
 *  a part and never a value. */
const REFUSED_PARTS = {
  clientRequestId:
    "the client request id must be 16 to 64 letters, digits, underscores or hyphens",
  payloadDigest:
    "the payload digest must be a 64-character lowercase hex SHA-256 digest",
  reference: "the reference must be 6 to 32 capital letters, digits or hyphens",
  contact: "the contact must be an object",
  contactName: "the contact's name must be text the database can hold",
  contactPhone: "the contact's phone must be text the database can hold",
  contactPhoneNormalForm:
    "the contact's phone normal form must be text the database can hold",
  contactLocality:
    "the contact's locality must be text the database can hold, and may be empty",
  contactChannel: "the contact's channel must be text the database can hold",
  contactConsentTextVersion:
    "the contact's consent text version must be text the database can hold",
  email:
    "the e-mail must be text the database can hold, and present exactly when the channel is e-mail",
  locale: "the locale must be text the database can hold",
  target: "the target must name a design or an intent, and exactly one of them",
  designReference:
    "the target's design must be an object holding a design id and a revision",
  designId: "the design id must be text the database can hold, and not empty",
  revision:
    "the design revision must be a whole number from 1 to 9223372036854775807",
  snapshot:
    "a design is stored with its snapshot, an object, and a callback without one",
  request: "the request must be plain data whose members can be read",
  snapshotDocument:
    "the snapshot's document must be a JSON object of finite numbers and text the database can hold, written " +
    "exactly as JSON.stringify writes it, with nothing in it written twice",
  snapshotPriced:
    "the snapshot's priced design must be a JSON object of plain objects, lists, text the database can hold, " +
    "finite numbers, booleans and null",
  snapshotDepth:
    "the snapshot's document and its priced design must each be no deeper than 64 levels of lists and objects",
} as const;

export type RefusedPart = keyof typeof REFUSED_PARTS;

/** The refusals this check made, by identity: a message can be copied by anything that throws, an identity cannot. */
const ownRefusals = new WeakSet();

export function registeredAsOurs(refusal: unknown): unknown {
  if (typeof refusal === "object" && refusal !== null) {
    ownRefusals.add(refusal);
  }
  return refusal;
}

/** Whether a caught value is one of this check's refusals. It asks nothing of the value but its identity: no
 *  `instanceof`, no property, so a proxy whose every trap throws is answered without running one. */
export function isOwnRefusal(thrown: unknown): boolean {
  return (
    typeof thrown === "object" && thrown !== null && ownRefusals.has(thrown)
  );
}

export function requireObject(value: unknown, part: RefusedPart): void {
  if (typeof value !== "object" || value === null) throw refusalOf(part);
}

export function refusalOf(part: RefusedPart): Error {
  const refusal = new Error(
    `Refusing to use the contact submission store: ${REFUSED_PARTS[part]}.`,
  );
  ownRefusals.add(refusal);
  return refusal;
}
