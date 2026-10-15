import "server-only";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  DesignSchema,
  projectDesignForDisplay,
  type ContactFields,
  type Design,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import type { Content } from "@/i18n/content";
import {
  LINE_BREAKING_CHARACTER,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";
import type { BreakdownGroup } from "@/price/price-breakdown-model";
import {
  describeReview,
  rowDetailOf,
  type AvailableReview,
} from "@/review/review-model";

/** The language the shop's notice is written in. Owner-owed: the caller resolves the `Content` it passes in this
 *  locale, whatever the customer's own. */
export const NOTICE_LOCALE = "ro";

/** The purpose of the idempotency key, so a second kind of mail under one provider account cannot meet its keys. */
export const LEAD_NOTIFICATION_KEY_PREFIX = "lead-notification/";

export interface LeadNotificationInput {
  /** The store's answer for the request, as a value. */
  readonly reference: string;
  /** A request the store has accepted, as plain data. */
  readonly submission: ContactSubmissionToRecord;
  readonly content: Content;
}

/** A line of the notice that has no usable value, or would hold a control character or a line separator. Names the
 *  line, never its value. */
export class NoticeLineError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`The notice line "${field}" cannot be written as one line of text`);
    this.name = "NoticeLineError";
    this.field = field;
  }
}

export type NoticeKitchenFailure =
  | "snapshot-missing"
  | "document-unreadable"
  | "review-not-sendable";

/** The request names a design that the notice cannot describe. A stored snapshot exists only for a kitchen that may be
 *  sent, so this is a defect upstream. Holds no value. */
export class NoticeKitchenError extends Error {
  readonly failure: NoticeKitchenFailure;

  constructor(failure: NoticeKitchenFailure) {
    super(`The notice cannot describe the request's kitchen: ${failure}`);
    this.name = "NoticeKitchenError";
    this.failure = failure;
  }
}

interface NoticeLine {
  readonly field: string;
  readonly text: string;
}

/** A line made of a label and one value, with the name of the line for the error that refuses it. */
type LabelledValue = readonly [field: string, label: string, value: string];

const FACT_INDENT = "  ";
const BLANK_LINE: NoticeLine = { field: "blank", text: "" };

/**
 * Pure: the same input gives the same bytes. The subject holds the reference and nothing the customer wrote; a
 * customer's text appears only as the value of a body line, as it was stored and unescaped, with no markup.
 */
export function buildLeadNotification(
  input: LeadNotificationInput,
): MailMessage {
  const { reference, submission, content } = input;
  const subject: NoticeLine = {
    field: "subject",
    text: content.leadNotice.subject(reference),
  };
  const body = [
    ...customerLines(input),
    BLANK_LINE,
    ...kitchenLines(submission, content),
  ];
  assertEachLineIsOneLine([subject, ...body]);
  return {
    key: `${LEAD_NOTIFICATION_KEY_PREFIX}${requestIdOf(submission)}`,
    subject: subject.text,
    text: body.map((line) => line.text).join("\n"),
  };
}

function customerLines(input: LeadNotificationInput): NoticeLine[] {
  const { reference, submission, content } = input;
  const { contact, locale } = submission;
  const { labels, channels } = content.leadNotice;
  const entries: LabelledValue[] = [
    ["reference", labels.reference, reference],
    ["locale", labels.locale, locale],
    ["name", labels.name, contact.name],
    ["phone", labels.phone, contact.phoneNormalForm],
    ["locality", labels.locality, localityValue(contact, content)],
    ["channel", labels.channel, channelWord(channels, contact)],
    ...emailEntries(contact, content),
  ];
  return entries.map((entry) => labelled(content, entry));
}

function localityValue(contact: ContactFields, content: Content): string {
  return contact.locality === ""
    ? content.leadNotice.emptyValue
    : contact.locality;
}

function channelWord(
  channels: Content["leadNotice"]["channels"],
  contact: ContactFields,
): string {
  if (!Object.hasOwn(channels, contact.channel)) {
    throw new NoticeLineError("channel");
  }
  return channels[contact.channel];
}

function requestIdOf(submission: ContactSubmissionToRecord): string {
  const id: unknown = submission.clientRequestId;
  if (typeof id !== "string" || id.length === 0) {
    throw new NoticeLineError("key");
  }
  return id;
}

function emailEntries(
  contact: ContactFields,
  content: Content,
): LabelledValue[] {
  if (contact.channel !== "email") return [];
  const { labels, emptyValue } = content.leadNotice;
  return [["email", labels.email, contact.email ?? emptyValue]];
}

function labelled(content: Content, entry: LabelledValue): NoticeLine {
  const [field, label, value] = entry;
  return { field, text: content.leadNotice.line(label, value) };
}

function kitchenLines(
  submission: ContactSubmissionToRecord,
  content: Content,
): NoticeLine[] {
  if (submission.target.kind === "intent") {
    return [{ field: "callback", text: content.leadNotice.callbackLine }];
  }
  const { snapshot } = submission;
  if (snapshot === undefined) throw new NoticeKitchenError("snapshot-missing");
  const design = parseDocument(snapshot.document);
  return keepingNothingOfAnyOtherError(() =>
    reviewLines(reviewOfSnapshot(design, snapshot, content), content),
  );
}

/**
 * The review model's own errors quote placement ids, which are the client's text and may hold a line break, so
 * whatever the catalogue, the projection, the model or the lines made from them throw leaves as one value-free error.
 * Nothing is asked of what was caught: even a prototype lookup on it could run code of its own.
 */
function keepingNothingOfAnyOtherError<Built>(build: () => Built): Built {
  try {
    return build();
  } catch {
    throw new NoticeKitchenError("review-not-sendable");
  }
}

function reviewOfSnapshot(
  design: Design,
  snapshot: SubmissionSnapshot,
  content: Content,
): AvailableReview {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const review = describeReview({
    content,
    design,
    pricing: { ok: true, priced: snapshot.priced },
    groups: projectDesignForDisplay(design, catalog),
  });
  if (review.kind !== "available" || review.submit.kind !== "allowed") {
    throw new NoticeKitchenError("review-not-sendable");
  }
  return review;
}

/** The parse's own errors can quote the text they failed on, so none is kept. */
function parseDocument(document: string): Design {
  try {
    return DesignSchema.parse(JSON.parse(document));
  } catch {
    throw new NoticeKitchenError("document-unreadable");
  }
}

function reviewLines(review: AvailableReview, content: Content): NoticeLine[] {
  return [
    labelled(content, [
      "roomLine",
      content.leadNotice.labels.room,
      review.roomLine,
    ]),
    ...review.groups.flatMap((group) =>
      groupLines(group, { content, rowDetails: review.rowDetails }),
    ),
    ...review.wholeKitchenRows.map((row) =>
      labelled(content, ["wholeKitchenRow", row.label, row.amountText]),
    ),
    BLANK_LINE,
    ...closingLines(review, content),
  ];
}

/** What a group's lines are made from besides the group: the words and each body's own facts. */
interface GroupSource {
  readonly content: Content;
  readonly rowDetails: AvailableReview["rowDetails"];
}

function groupLines(group: BreakdownGroup, source: GroupSource): NoticeLine[] {
  const { content, rowDetails } = source;
  return [
    { field: "groupHeading", text: group.heading },
    ...group.rows.flatMap((row) => [
      labelled(content, ["row", row.label, row.amountText]),
      ...factLines(rowDetailOf(rowDetails, row.key).facts),
    ]),
  ];
}

/** The review's own facts of a body, in its order, one to a line and set in under the row. */
function factLines(facts: readonly string[]): NoticeLine[] {
  return facts.map((fact) => ({
    field: "rowFact",
    text: `${FACT_INDENT}${fact}`,
  }));
}

/** The review's own figure and its two disclaimer sentences; the notice adds no sentence about the price. */
function closingLines(review: AvailableReview, content: Content): NoticeLine[] {
  const { figure, disclaimer } = review;
  const { labels, figure: composeFigure } = content.leadNotice;
  return [
    labelled(content, [
      "figure",
      labels.price,
      composeFigure(figure.label, figure.amountText),
    ]),
    { field: "rounding", text: disclaimer.rounding },
    { field: "disclaimer", text: disclaimer.notice },
  ];
}

function assertEachLineIsOneLine(lines: readonly NoticeLine[]): void {
  for (const { field, text } of lines) {
    if (LINE_BREAKING_CHARACTER.test(text)) throw new NoticeLineError(field);
  }
}
