import {
  CONTACT_FIELDS,
  validateContactFields,
  type ContactField,
  type ContactFieldCode,
  type ContactFields,
} from "./contact-fields.js";

// The request a contact form sends. Strict at every level: an unknown field is refused, so a client
// cannot add a price, a total or a book version and have it ignored (D6). A refusal names a field and
// a code and never a key or a value the sender chose (ADR 0095; ADR 0146).

/** Q12 (i): a callback request with no design. The link e-mail is not built. */
export const CONTACT_INTENTS = ["callback"] as const;
export type ContactIntent = (typeof CONTACT_INTENTS)[number];

const REQUEST_KEYS = [
  "contact",
  "design",
  "intent",
  "clientRequestId",
  "locale",
  "honeypot",
  "elapsedMs",
] as const;

const DESIGN_REFERENCE_KEYS = ["id", "revision"] as const;

/** `nanoid()` at its default: 21 characters of `A-Za-z0-9_-` (`packages/persistence`'s
 *  `generate-design-id.ts`, which this package cannot import). */
const DESIGN_ID_SHAPE = /^[A-Za-z0-9_-]{21}$/;

/** A digit run with no leading zero, at most nineteen digits: the persistence package's
 *  `DESIGN_REVISION_SHAPE`, which a `bigint` column bounds. Kept a string, never a number. */
const DESIGN_REVISION_SHAPE = /^[1-9][0-9]{0,18}$/;

/** Wide enough for a UUID (36) or a `nanoid` (21); narrow enough that it is a key and not a body. */
const CLIENT_REQUEST_ID_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** A language code as the routing list spells it: two or three lowercase letters. */
const LOCALE_SHAPE = /^[a-z]{2,3}$/;

/** Characters, counted as code points. The honeypot's content has no meaning here. */
const HONEYPOT_MAX_LENGTH = 256;

/** A day, in milliseconds: no honest form is open longer, and it keeps the number a number. */
const ELAPSED_MS_MAX = 86_400_000;

export type SubmissionField =
  | "request"
  | "contact"
  | `contact.${ContactField}`
  | "design"
  | "design.id"
  | "design.revision"
  | "intent"
  | "clientRequestId"
  | "locale"
  | "honeypot"
  | "elapsedMs";

export type SubmissionCode =
  | ContactFieldCode
  | "NOT_AN_OBJECT"
  | "UNKNOWN_FIELD"
  | "DESIGN_AND_INTENT_BOTH"
  | "DESIGN_OR_INTENT_MISSING"
  | "UNKNOWN_INTENT";

export interface SubmissionIssue {
  readonly field: SubmissionField;
  readonly code: SubmissionCode;
}

export interface DesignReference {
  readonly id: string;
  readonly revision: string;
}

/** A design to submit, or no design and an intent: the type holds exactly one. */
export type SubmissionTarget =
  | { readonly kind: "design"; readonly design: DesignReference }
  | { readonly kind: "intent"; readonly intent: ContactIntent };

/** The honeypot and the elapsed time are carried with no meaning; 8K judges them (D9). */
export interface ContactSubmissionRequest {
  readonly contact: ContactFields;
  readonly target: SubmissionTarget;
  readonly clientRequestId: string;
  readonly locale: string;
  readonly honeypot: string;
  readonly elapsedMs: number;
}

export type ContactSubmissionValidation =
  | { readonly ok: true; readonly request: ContactSubmissionRequest }
  | { readonly ok: false; readonly issues: readonly SubmissionIssue[] };

type Outcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issues: readonly SubmissionIssue[] };

type PlainObject = Readonly<Record<string, unknown>>;

interface RequestJudgements {
  readonly contact: Outcome<ContactFields>;
  readonly target: Outcome<SubmissionTarget>;
  readonly clientRequestId: Outcome<string>;
  readonly locale: Outcome<string>;
  readonly honeypot: Outcome<string>;
  readonly elapsedMs: Outcome<number>;
}

/** In the order of the request's fields, which is the order refusals are reported in. */
const JUDGED_PARTS = [
  "contact",
  "target",
  "clientRequestId",
  "locale",
  "honeypot",
  "elapsedMs",
] as const satisfies readonly (keyof RequestJudgements)[];

type AcceptedJudgements = {
  readonly [part in keyof RequestJudgements]: Extract<
    RequestJudgements[part],
    { ok: true }
  >;
};

/** Every failing field is reported once, in field order, with no value in the refusal. */
export function validateContactSubmission(
  input: unknown,
): ContactSubmissionValidation {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [issue("request", "NOT_AN_OBJECT")] };
  }
  const judgements = judgeRequest(input);
  const unknownKeys = unknownKeyIssues(input, REQUEST_KEYS, "request");
  if (unknownKeys.length > 0 || !isAccepted(judgements)) {
    return {
      ok: false,
      issues: [...unknownKeys, ...refusedIssues(judgements)],
    };
  }
  return { ok: true, request: assemble(judgements) };
}

function judgeRequest(request: PlainObject): RequestJudgements {
  return {
    contact: judgeContact(fieldOf(request, "contact")),
    target: judgeTarget(request),
    clientRequestId: judgeToken(
      fieldOf(request, "clientRequestId"),
      CLIENT_REQUEST_ID_SHAPE,
      "clientRequestId",
    ),
    locale: judgeToken(fieldOf(request, "locale"), LOCALE_SHAPE, "locale"),
    honeypot: judgeHoneypot(fieldOf(request, "honeypot")),
    elapsedMs: judgeElapsedMs(fieldOf(request, "elapsedMs")),
  };
}

function isAccepted(
  judgements: RequestJudgements,
): judgements is AcceptedJudgements {
  return JUDGED_PARTS.every((part) => judgements[part].ok);
}

function refusedIssues(
  judgements: RequestJudgements,
): readonly SubmissionIssue[] {
  return JUDGED_PARTS.flatMap((part) => issuesOf(judgements[part]));
}

function assemble(accepted: AcceptedJudgements): ContactSubmissionRequest {
  return {
    contact: accepted.contact.value,
    target: accepted.target.value,
    clientRequestId: accepted.clientRequestId.value,
    locale: accepted.locale.value,
    honeypot: accepted.honeypot.value,
    elapsedMs: accepted.elapsedMs.value,
  };
}

function judgeContact(raw: unknown): Outcome<ContactFields> {
  if (raw === undefined) return failed(issue("contact", "REQUIRED"));
  if (!isPlainObject(raw)) return failed(issue("contact", "NOT_AN_OBJECT"));
  const unknownKeys = unknownKeyIssues(raw, CONTACT_FIELDS, "contact");
  const validation = validateContactFields(raw);
  if (!validation.ok) {
    return failed(
      ...unknownKeys,
      ...validation.issues.map(({ field, code }) =>
        issue(`contact.${field}`, code),
      ),
    );
  }
  return unknownKeys.length > 0
    ? failed(...unknownKeys)
    : succeeded(validation.contact);
}

function judgeTarget(request: PlainObject): Outcome<SubmissionTarget> {
  const design = fieldOf(request, "design");
  const intent = fieldOf(request, "intent");
  if (design !== undefined && intent !== undefined) {
    return failed(issue("design", "DESIGN_AND_INTENT_BOTH"));
  }
  if (design !== undefined) return judgeDesignTarget(design);
  if (intent !== undefined) return judgeIntentTarget(intent);
  return failed(issue("design", "DESIGN_OR_INTENT_MISSING"));
}

function judgeDesignTarget(raw: unknown): Outcome<SubmissionTarget> {
  const reference = judgeDesignReference(raw);
  return reference.ok
    ? succeeded({ kind: "design", design: reference.value })
    : reference;
}

function judgeDesignReference(raw: unknown): Outcome<DesignReference> {
  if (!isPlainObject(raw)) return failed(issue("design", "NOT_AN_OBJECT"));
  const unknownKeys = unknownKeyIssues(raw, DESIGN_REFERENCE_KEYS, "design");
  const id = judgeToken(fieldOf(raw, "id"), DESIGN_ID_SHAPE, "design.id");
  const revision = judgeToken(
    fieldOf(raw, "revision"),
    DESIGN_REVISION_SHAPE,
    "design.revision",
  );
  if (unknownKeys.length > 0 || !id.ok || !revision.ok) {
    return failed(...unknownKeys, ...issuesOf(id), ...issuesOf(revision));
  }
  return succeeded({ id: id.value, revision: revision.value });
}

function judgeIntentTarget(raw: unknown): Outcome<SubmissionTarget> {
  const intent = CONTACT_INTENTS.find((known) => known === raw);
  return intent === undefined
    ? failed(issue("intent", "UNKNOWN_INTENT"))
    : succeeded({ kind: "intent", intent });
}

function judgeToken(
  raw: unknown,
  shape: RegExp,
  field: SubmissionField,
): Outcome<string> {
  if (raw === undefined) return failed(issue(field, "REQUIRED"));
  if (typeof raw !== "string") return failed(issue(field, "NOT_TEXT"));
  return shape.test(raw) ? succeeded(raw) : failed(issue(field, "MALFORMED"));
}

function judgeHoneypot(raw: unknown): Outcome<string> {
  if (raw === undefined) return succeeded("");
  if (typeof raw !== "string") return failed(issue("honeypot", "NOT_TEXT"));
  return Array.from(raw).length > HONEYPOT_MAX_LENGTH
    ? failed(issue("honeypot", "TOO_LONG"))
    : succeeded(raw);
}

function judgeElapsedMs(raw: unknown): Outcome<number> {
  if (raw === undefined) return failed(issue("elapsedMs", "REQUIRED"));
  return isElapsedMs(raw)
    ? succeeded(raw)
    : failed(issue("elapsedMs", "MALFORMED"));
}

function isElapsedMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= ELAPSED_MS_MAX
  );
}

/** One issue for the object however many keys are unknown, and none names a key: the key is the
 *  sender's text. */
function unknownKeyIssues(
  record: PlainObject,
  knownKeys: readonly string[],
  field: SubmissionField,
): readonly SubmissionIssue[] {
  const hasUnknownKey = Object.keys(record).some(
    (key) => !knownKeys.includes(key),
  );
  return hasUnknownKey ? [issue(field, "UNKNOWN_FIELD")] : [];
}

/** Plain data only: an array, a class instance or a `null` is not a request, and an inherited
 *  property is never read as one the sender wrote. */
function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fieldOf(record: PlainObject, name: string): unknown {
  return Object.hasOwn(record, name) ? record[name] : undefined;
}

function issuesOf(outcome: Outcome<unknown>): readonly SubmissionIssue[] {
  return outcome.ok ? [] : outcome.issues;
}

function issue(field: SubmissionField, code: SubmissionCode): SubmissionIssue {
  return { field, code };
}

function succeeded<Value>(value: Value): Outcome<Value> {
  return { ok: true, value };
}

function failed(...issues: readonly SubmissionIssue[]): Outcome<never> {
  return { ok: false, issues };
}
