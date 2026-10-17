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
import { endonymOf } from "@/i18n/locale-endonyms";
import { routing, type AppLocale } from "@/i18n/routing";
import {
  isKitchenLinkHref,
  renderLeadNoticeHtml,
  type ContactAction,
  type LabelledValue,
  type LeadNoticeView,
  type NoticeAppendixGroup,
  type NoticeAppendixView,
  type NoticeBody,
  type NoticeClientView,
  type NoticeKitchenSections,
  type NoticeKitchenView,
  type NoticeSummaryView,
} from "@/lib/server/mail/lead-notification-html";
import {
  LINE_BREAKING_CHARACTER,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";
import { asciiDomainOfPlainMailbox } from "@/lib/server/mail/plain-mailbox";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";
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

/** The view-only link to the kitchen as sent, or that there is none. A link of any other shape, or under any origin but
 *  the configured one, is shown as none. */
export type NoticeKitchenLink =
  | { readonly kind: "link"; readonly url: string }
  | { readonly kind: "unavailable" };

export interface LeadNoticeInput extends LeadNotificationInput {
  readonly kitchenLink: NoticeKitchenLink;
  /** The public origin as it was read for this attempt, the one the link was minted under. */
  readonly publicOrigin: PublicOriginOutcome;
}

/** UTF-8 bytes. Gmail clips an HTML part past about 102 KB, so a notice whose HTML is longer is sent as its text part
 *  alone, which carries the same link first: the shop is told either way, and the HTML is never cut off mid-kitchen. */
export const NOTICE_HTML_BUDGET_BYTES = 90_000;

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

/**
 * Pure: the same input gives the same bytes. One view of the request makes both parts, the plain text and its HTML
 * alternative, so they cannot disagree. The subject holds the reference and nothing the customer wrote; a customer's
 * text appears only as a value, unescaped in the text and escaped in the HTML. An HTML part past
 * `NOTICE_HTML_BUDGET_BYTES` is left out, so the message is its text part alone.
 * @throws NoticeLineError for a value that cannot be one line; NoticeKitchenError for a kitchen it cannot describe.
 */
export function composeLeadNotice(input: LeadNoticeInput): MailMessage {
  const { content, reference, submission } = input;
  const subject = oneLine("subject", content.leadNotice.subject(reference));
  const customer = customerValuesOf(input);
  const body = noticeBodyOf(input);
  const view = viewOf({ input, subject, customer, body: body.view });
  const html = renderLeadNoticeHtml(view);
  const message = {
    key: `${LEAD_NOTIFICATION_KEY_PREFIX}${requestIdOf(submission)}`,
    subject,
    text: [
      ...body.leadingLines,
      ...customerLinesOf(customer, content),
      ...body.trailingLines,
    ].join("\n"),
  };
  return isWithinTheHtmlBudget(html) ? { ...message, html } : message;
}

function isWithinTheHtmlBudget(html: string): boolean {
  return new TextEncoder().encode(html).byteLength <= NOTICE_HTML_BUDGET_BYTES;
}

/** The customer's values behind their labels, each one line, in the text part's order. */
interface CustomerValues {
  readonly reference: LabelledValue;
  readonly locale: LabelledValue;
  readonly name: LabelledValue;
  readonly phone: LabelledValue;
  readonly locality: LabelledValue;
  readonly channel: LabelledValue;
  readonly email: LabelledValue | undefined;
}

function customerValuesOf(input: LeadNotificationInput): CustomerValues {
  const { reference, submission, content } = input;
  const { contact } = submission;
  const { labels, channels } = content.leadNotice;
  return {
    reference: labelled("reference", labels.reference, reference),
    locale: labelled(
      "locale",
      labels.locale,
      languageNameOf(submission.locale),
    ),
    name: labelled("name", labels.name, contact.name),
    phone: labelled("phone", labels.phone, contact.phoneNormalForm),
    locality: labelled(
      "locality",
      labels.locality,
      localityValue(contact, content),
    ),
    channel: labelled(
      "channel",
      labels.channel,
      channelWord(channels, contact),
    ),
    email: emailValue(contact, content),
  };
}

function labelled(
  field: string,
  label: string,
  value: string,
  line: OneLine = oneLine,
): LabelledValue {
  return { label, value: line(field, value) };
}

/** The client's language in its own name; a language the site does not serve is shown as it was stored. */
function languageNameOf(locale: string): string {
  return isServedLocale(locale) ? endonymOf(locale) : locale;
}

function isServedLocale(locale: string): locale is AppLocale {
  return (routing.locales as readonly string[]).includes(locale);
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

function emailValue(
  contact: ContactFields,
  content: Content,
): LabelledValue | undefined {
  if (contact.channel !== "email") return undefined;
  const { labels, emptyValue } = content.leadNotice;
  return labelled("email", labels.email, contact.email ?? emptyValue);
}

function requestIdOf(submission: ContactSubmissionToRecord): string {
  const id: unknown = submission.clientRequestId;
  if (typeof id !== "string" || id.length === 0) {
    throw new NoticeLineError("key");
  }
  return id;
}

function customerLinesOf(customer: CustomerValues, content: Content): string[] {
  const { reference, locale, name, phone, locality, channel, email } = customer;
  return [
    reference,
    locale,
    name,
    phone,
    locality,
    channel,
    ...(email === undefined ? [] : [email]),
  ].map((entry) => textLine(content, entry));
}

/** The body as the HTML shows it, and the text part's lines before and after the customer's. */
interface NoticeBodyPart {
  readonly view: NoticeBody;
  readonly leadingLines: readonly string[];
  readonly trailingLines: readonly string[];
}

function noticeBodyOf(input: LeadNoticeInput): NoticeBodyPart {
  const { submission, content } = input;
  if (submission.target.kind === "intent") {
    const callbackLine = oneLine("callback", content.leadNotice.callbackLine);
    return {
      view: { kind: "callback", callbackLine },
      leadingLines: [],
      trailingLines: ["", callbackLine],
    };
  }
  const { snapshot } = submission;
  if (snapshot === undefined) throw new NoticeKitchenError("snapshot-missing");
  const design = parseDocument(snapshot.document);
  return keepingNothingOfAnyOtherError((line) =>
    kitchenPartOf(reviewOfSnapshot(design, snapshot, content), {
      input,
      line,
    }),
  );
}

type OneLine = (field: string, text: string) => string;

/**
 * The review model's own errors quote placement ids, which are the client's text and may hold a line break, so
 * whatever the catalogue, the projection, the model or the lines made from them throw leaves as one value-free error.
 * Nothing is asked of what was caught: even a prototype lookup on it could run code of its own. A line this module
 * refused is told apart by the field it recorded, so it still leaves by its name.
 */
function keepingNothingOfAnyOtherError<Built>(
  build: (line: OneLine) => Built,
): Built {
  let refusedField: string | undefined;
  const line: OneLine = (field, text) => {
    if (LINE_BREAKING_CHARACTER.test(text)) refusedField = field;
    return oneLine(field, text);
  };
  try {
    return build(line);
  } catch {
    throw refusedField === undefined
      ? new NoticeKitchenError("review-not-sendable")
      : new NoticeLineError(refusedField);
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

/** What every line of the kitchen part is made from: the request's words, and the check each line passes. */
interface KitchenSource {
  readonly input: LeadNoticeInput;
  readonly line: OneLine;
}

function kitchenPartOf(
  review: AvailableReview,
  source: KitchenSource,
): NoticeBodyPart {
  const kitchen: NoticeKitchenSections = {
    roomLine: source.line("roomLine", review.roomLine),
    link: kitchenLinkViewOf(source),
    summary: summaryOf(review, source),
    appendix: appendixOf(review, source),
  };
  return {
    view: { kind: "design", kitchen },
    leadingLines: [kitchenLinkLine(kitchen.link, source), ""],
    trailingLines: [
      "",
      ...summaryLines(kitchen, source),
      "",
      ...appendixLines(kitchen.appendix, source),
    ],
  };
}

function kitchenLinkViewOf({ input, line }: KitchenSource): NoticeKitchenView {
  const { kitchenLink, publicOrigin, content } = input;
  const { kitchen } = content.leadNotice;
  if (
    kitchenLink.kind === "link" &&
    publicOrigin.status === "configured" &&
    isKitchenLinkHref(kitchenLink.url, {
      origin: publicOrigin.origin,
      lang: NOTICE_LOCALE,
    })
  ) {
    return {
      kind: "link",
      href: kitchenLink.url,
      origin: publicOrigin.origin,
      buttonLabel: line("kitchenButton", kitchen.button),
      note: line("kitchenNote", kitchen.note),
    };
  }
  return {
    kind: "unavailable",
    sentence: line("kitchenUnavailable", kitchen.unavailable),
  };
}

/** The room, how many bodies each group holds, and the stored figure: nothing is priced again. */
function summaryOf(
  review: AvailableReview,
  { input, line }: KitchenSource,
): NoticeSummaryView {
  const { leadNotice } = input.content;
  const { figure, disclaimer } = review;
  return {
    heading: line("summaryHeading", leadNotice.summaryHeading),
    groupCounts: review.groups.map((group) =>
      line(
        "groupCount",
        leadNotice.groupCount(group.heading, group.rows.length),
      ),
    ),
    figure: line(
      "figure",
      leadNotice.line(
        leadNotice.labels.price,
        leadNotice.figure(figure.label, figure.amountText),
      ),
    ),
    rounding: line("rounding", disclaimer.rounding),
    disclaimer: line("disclaimer", disclaimer.notice),
  };
}

/** Every group, row and fact the review shows, in its order: the record of what was sent, whatever the link does. */
function appendixOf(
  review: AvailableReview,
  source: KitchenSource,
): NoticeAppendixView {
  const { input, line } = source;
  return {
    heading: line("appendixHeading", input.content.leadNotice.appendixHeading),
    groups: review.groups.map((group) =>
      appendixGroupOf(group, { review, line }),
    ),
    wholeKitchenRows: review.wholeKitchenRows.map((row) =>
      labelled(
        "wholeKitchenRow",
        line("wholeKitchenRow", row.label),
        row.amountText,
        line,
      ),
    ),
  };
}

function appendixGroupOf(
  group: BreakdownGroup,
  {
    review,
    line,
  }: { readonly review: AvailableReview; readonly line: OneLine },
): NoticeAppendixGroup {
  return {
    heading: line("groupHeading", group.heading),
    rows: group.rows.map((row) => ({
      label: line("row", row.label),
      value: line("row", row.amountText),
      facts: rowDetailOf(review.rowDetails, row.key).facts.map((fact) =>
        line("rowFact", fact),
      ),
    })),
  };
}

function kitchenLinkLine(
  link: NoticeKitchenView,
  { input, line }: KitchenSource,
): string {
  if (link.kind === "unavailable") return link.sentence;
  const { leadNotice } = input.content;
  return line(
    "kitchenLink",
    leadNotice.line(leadNotice.kitchen.linkLabel, link.href),
  );
}

function summaryLines(
  kitchen: NoticeKitchenSections,
  { input, line }: KitchenSource,
): string[] {
  const { leadNotice } = input.content;
  const { summary } = kitchen;
  return [
    line("roomLine", leadNotice.line(leadNotice.labels.room, kitchen.roomLine)),
    ...summary.groupCounts,
    summary.figure,
    summary.rounding,
    summary.disclaimer,
  ];
}

/** Two spaces set a body's facts in under its row. */
const FACT_INDENT = "  ";

function appendixLines(
  appendix: NoticeAppendixView,
  { input, line }: KitchenSource,
): string[] {
  const { leadNotice } = input.content;
  const rowLine = ({ label, value }: LabelledValue) =>
    line("row", leadNotice.line(label, value));
  return [
    appendix.heading,
    ...appendix.groups.flatMap((group) => [
      group.heading,
      ...group.rows.flatMap((row) => [
        rowLine(row),
        ...row.facts.map((fact) => `${FACT_INDENT}${fact}`),
      ]),
    ]),
    ...appendix.wholeKitchenRows.map(rowLine),
  ];
}

interface ViewSource {
  readonly input: LeadNoticeInput;
  readonly subject: string;
  readonly customer: CustomerValues;
  readonly body: NoticeBody;
}

function viewOf({
  input,
  subject,
  customer,
  body,
}: ViewSource): LeadNoticeView {
  const { leadNotice, brand } = input.content;
  return {
    lang: NOTICE_LOCALE,
    title: subject,
    preheader: oneLine("preheader", preheaderOf(input, body)),
    wordmark: oneLine("wordmark", brand),
    tagline: oneLine("tagline", leadNotice.tagline),
    heading: oneLine("heading", leadNotice.heading),
    body,
    client: clientViewOf(input, customer),
    footer: {
      lines: footerLinesOf(input, customer),
      noReply: oneLine("noReply", leadNotice.noReply),
    },
  };
}

function preheaderOf(input: LeadNoticeInput, body: NoticeBody): string {
  const { contact } = input.submission;
  const { leadNotice } = input.content;
  const lead =
    body.kind === "design" && body.kitchen.link.kind === "link"
      ? leadNotice.kitchen.button
      : leadNotice.heading;
  return leadNotice.preheader({
    lead,
    name: contact.name,
    locality: contact.locality,
  });
}

function clientViewOf(
  input: LeadNoticeInput,
  customer: CustomerValues,
): NoticeClientView {
  const { leadNotice } = input.content;
  return {
    heading: oneLine("clientHeading", leadNotice.clientHeading),
    name: customer.name.value,
    phone: customer.phone.value,
    actions: contactActionsOf(input.submission.contact, input.content),
    facts: [
      customer.channel,
      customer.locality,
      ...(customer.email === undefined ? [] : [customer.email]),
      customer.locale,
    ],
  };
}

/** E.164: a `+`, a non-zero digit, at most fifteen digits in all. Only such a number becomes a call or a chat. */
const E164_NORMAL_FORM = /^\+([1-9][0-9]{1,14})$/;

/** A call always, WhatsApp when it is the channel, e-mail when it is the channel; each only from a value that can be
 *  written as its link. */
function contactActionsOf(
  contact: ContactFields,
  content: Content,
): ContactAction[] {
  const { actions } = content.leadNotice;
  const digits = E164_NORMAL_FORM.exec(contact.phoneNormalForm)?.[1];
  const mailto = mailtoHrefOf(contact);
  return [
    ...(digits === undefined
      ? []
      : [action("call", `tel:+${digits}`, actions.call)]),
    ...(digits !== undefined && contact.channel === "whatsapp"
      ? [action("whatsapp", `https://wa.me/${digits}`, actions.whatsapp)]
      : []),
    ...(mailto !== undefined && contact.channel === "email"
      ? [action("email", mailto, actions.email)]
      : []),
  ];
}

function action(
  kind: ContactAction["kind"],
  href: string,
  label: string,
): ContactAction {
  return { kind, href, label: oneLine(`${kind}Action`, label) };
}

/** The local part encoded, so `?`, `&` and `#` it may hold cannot add a header to the reply; the domain in ASCII. */
function mailtoHrefOf(contact: ContactFields): string | undefined {
  const address = contact.email ?? "";
  const domain = asciiDomainOfPlainMailbox(address);
  if (domain === undefined) return undefined;
  const localPart = address.slice(0, address.lastIndexOf("@"));
  return `mailto:${encodeURIComponent(localPart)}@${domain}`;
}

function footerLinesOf(
  input: LeadNoticeInput,
  customer: CustomerValues,
): string[] {
  const { leadNotice } = input.content;
  const { target } = input.submission;
  const revision =
    target.kind === "design"
      ? [labelled("revision", leadNotice.revisionLabel, target.design.revision)]
      : [];
  return [customer.reference, ...revision].map((entry) =>
    textLine(input.content, entry),
  );
}

function textLine(content: Content, { label, value }: LabelledValue): string {
  return oneLine("line", content.leadNotice.line(label, value));
}

/** Every string either part shows passes here, so neither part can hold a line the other refused. */
function oneLine(field: string, text: string): string {
  if (LINE_BREAKING_CHARACTER.test(text)) throw new NoticeLineError(field);
  return text;
}
