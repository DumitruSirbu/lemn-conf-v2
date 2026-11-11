import "server-only";

import {
  isDesignId,
  type ChisinauDayKey,
  type DigestModel,
  type DigestRow,
} from "@lemnaria/configurator-domain";
import { createTranslator, type IntlError } from "next-intl";

import {
  resolveStaffChangeDigestCopy,
  type StaffChangeDigestCopy,
} from "@/i18n/content";
import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";
import {
  renderStaffChangeDigestHtml,
  type DigestRowView,
} from "@/lib/server/mail/staff-change-digest-html";
import {
  HTML_MAX_LENGTH,
  LINE_BREAKING_CHARACTER,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";
import type { PublicOrigin } from "@/lib/server/public-origin";
import roMessages from "@/messages/ro.json";
import { isolated } from "@/staff/bidi-isolate";
import { dayOf, recentDayAndTimeOf } from "@/staff/staff-kitchen-dates";
import { staffPathOf } from "@/staff/staff-paths";

/** The purpose of the idempotency key, so a second kind of mail under one provider account cannot meet its keys. */
export const STAFF_CHANGE_DIGEST_KEY_PREFIX = "staff-change-digest/";

/** Printed where a customer-typed value has nothing left to show once its control characters are gone. */
const EMPTY_VALUE = "–";

const EMPTY_FENCE = isolated("");

export interface StaffChangeDigestInput {
  readonly model: DigestModel;
  /** The configured public origin: the only one a link in the message may sit under. */
  readonly origin: PublicOrigin;
  readonly dayKey: ChisinauDayKey;
  /** The instant the run read once; "modificată ieri" is counted from it. */
  readonly nowMs: number;
  readonly copy: StaffChangeDigestCopy;
}

/** The digest's words in the shop's language, with a leaf that cannot be resolved thrown and never written to a log. */
export function staffChangeDigestCopy(): StaffChangeDigestCopy {
  return resolveStaffChangeDigestCopy(
    createTranslator({
      locale: NOTICE_LOCALE,
      messages: roMessages,
      onError: throwTheFailedLeaf,
    }),
  );
}

/** The most HTML the digest writes: the mail port's own limit (`HTML_MAX_LENGTH`, in UTF-16 code units) less a margin
 *  for the subject-count digits and the waiting line, so a message the port would refuse unsent is never composed. */
export const DIGEST_HTML_BUDGET = HTML_MAX_LENGTH - 2_048;

export interface BoundedStaffChangeDigest {
  readonly message: MailMessage;
  /** How many of the model's rows the message lists, from the first; the rest wait for the next e-mail. */
  readonly includedRowCount: number;
}

/**
 * Pure. The subject holds the count of the rows listed and nothing a customer wrote, and the key holds the day. A
 * customer-typed value (kitchen name, account name, request reference) is made one line, stripped of its bidi controls,
 * isolated, and escaped in the HTML part; the only link is the staff kitchen address under the public origin.
 * @throws RangeError for a subject that cannot be one line, or when not even one row fits in `DIGEST_HTML_BUDGET`.
 */
export function composeStaffChangeDigest(
  input: StaffChangeDigestInput,
): MailMessage {
  return composeBoundedStaffChangeDigest(input).message;
}

/**
 * As `composeStaffChangeDigest`, listing as many rows as the HTML budget holds, in the model's order (latest change
 * first), and saying how many more wait when it must stop short. The caller records only the rows listed.
 */
export function composeBoundedStaffChangeDigest(
  input: StaffChangeDigestInput,
): BoundedStaffChangeDigest {
  const prefix = `${input.origin}${staffPathOf(NOTICE_LOCALE, "kitchens")}/`;
  const rows = input.model.rows.map((row) => rowViewOf(row, input, prefix));
  const messageOf = (count: number) =>
    messageListing(rows.slice(0, count), rows.length - count, input, prefix);
  const includedRowCount = largestWithin(rows.length, (count) =>
    isWithinBudget(messageOf(count)),
  );
  return { message: messageOf(includedRowCount), includedRowCount };
}

function isWithinBudget(message: MailMessage): boolean {
  return (message.html?.length ?? 0) <= DIGEST_HTML_BUDGET;
}

/** The largest count in 1..total that fits, found by halving: a longer list is never shorter. */
function largestWithin(
  total: number,
  fits: (count: number) => boolean,
): number {
  if (fits(total)) return total;
  let fitting = 0;
  let tooMany = total;
  while (tooMany - fitting > 1) {
    const middle = Math.floor((fitting + tooMany) / 2);
    if (fits(middle)) fitting = middle;
    else tooMany = middle;
  }
  if (fitting === 0) {
    throw new RangeError(
      "Not even one kitchen fits in the digest's HTML budget",
    );
  }
  return fitting;
}

function messageListing(
  rows: readonly DigestRowView[],
  waitingCount: number,
  { model, copy, dayKey }: StaffChangeDigestInput,
  kitchenLinkPrefix: string,
): MailMessage {
  const subject = subjectOf(copy.title(rows.length));
  const waiting = waitingCount > 0 ? copy.moreWaiting(waitingCount) : undefined;
  const footer = copy.footer(model.footer.windowDays);
  return {
    key: `${STAFF_CHANGE_DIGEST_KEY_PREFIX}${dayKey}`,
    subject,
    text: textOf({ subject, intro: copy.intro, waiting, rows, footer }),
    html: renderStaffChangeDigestHtml({
      lang: NOTICE_LOCALE,
      title: subject,
      intro: copy.intro,
      waiting,
      tableLabel: copy.tableLabel,
      openLabel: copy.open,
      rows,
      footer,
      kitchenLinkPrefix,
    }),
  };
}

function subjectOf(subject: string): string {
  if (subject === "" || LINE_BREAKING_CHARACTER.test(subject)) {
    throw new RangeError("The digest's subject cannot be written as one line");
  }
  return subject;
}

function rowViewOf(
  row: DigestRow,
  { copy, nowMs }: StaffChangeDigestInput,
  kitchenLinkPrefix: string,
): DigestRowView {
  return {
    kitchen: typedValue(row.kitchenName, copy.unnamedKitchen),
    client: typedValue(customerTextOf(row), EMPTY_VALUE),
    sent: copy.rowSent(
      dayOf(new Date(row.sentAtMs).toISOString(), NOTICE_LOCALE),
    ),
    modified: copy.rowModified(
      recentDayAndTimeOf(
        new Date(row.updatedAtMs).toISOString(),
        nowMs,
        NOTICE_LOCALE,
      ),
    ),
    href: isDesignId(row.designId)
      ? `${kitchenLinkPrefix}${row.designId}`
      : undefined,
  };
}

function customerTextOf(row: DigestRow): string {
  return row.customer.kind === "account-name"
    ? row.customer.name
    : row.customer.reference;
}

/** One line (a break in a name must not forge a line of the text part), isolated so it cannot reorder what is round it.
 *  A value that is nothing but bidi controls is stripped to nothing by `isolated`, and shows the fallback. */
function typedValue(typed: string | undefined, fallback: string): string {
  const oneLine = (typed ?? "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim();
  const fenced = isolated(oneLine);
  return fenced === EMPTY_FENCE ? fallback : fenced;
}

function textOf(parts: {
  readonly subject: string;
  readonly intro: string;
  readonly waiting: string | undefined;
  readonly rows: readonly DigestRowView[];
  readonly footer: string;
}): string {
  const rows = parts.rows.map((row, index) =>
    [
      `${String(index + 1)}. ${row.kitchen}`,
      `   ${row.client}`,
      `   ${row.sent} · ${row.modified}`,
      ...(row.href === undefined ? [] : [`   ${row.href}`]),
    ].join("\n"),
  );
  const waiting = parts.waiting === undefined ? [] : [parts.waiting];
  return [parts.subject, parts.intro, ...waiting, ...rows, parts.footer].join(
    "\n\n",
  );
}

function throwTheFailedLeaf(failure: IntlError): never {
  throw failure;
}
