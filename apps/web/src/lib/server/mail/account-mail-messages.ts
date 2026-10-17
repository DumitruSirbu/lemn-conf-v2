import "server-only";

import { randomBytes } from "node:crypto";

import { createTranslator, hasLocale, type IntlError } from "next-intl";

import { resolveAccountMailCopy, type AccountMailCopy } from "@/i18n/content";
import { routing, type AppLocale } from "@/i18n/routing";
import { escapeHtml } from "@/lib/server/mail/lead-notification-html";
import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

export type AccountMailKind =
  | "confirm-email"
  | "already-registered"
  | "reset-password"
  | "password-changed";

/** A link under the site's public origin (`readPublicOrigin`'s answer), with the single-use token after `#`. */
export interface AccountMailTokenLink {
  readonly origin: string;
  readonly token: string;
}

/** A link under the site's public origin to a page that takes no token. */
export interface AccountMailPlainLink {
  readonly origin: string;
}

export type AccountMailRequest =
  | {
      readonly kind: "confirm-email" | "reset-password";
      readonly locale: string;
      readonly link: AccountMailTokenLink;
    }
  | {
      readonly kind: "already-registered";
      readonly locale: string;
      readonly link: AccountMailPlainLink;
    }
  | { readonly kind: "password-changed"; readonly locale: string };

/** What a message is made of, apart from its key and recipient. */
export interface AccountMailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** A link whose origin is not a bare origin, or whose token is not URL-safe. Holds neither value. */
export class AccountMailLinkError extends Error {
  constructor() {
    super("The account mail's link is not a bare origin with a URL-safe token");
    this.name = "AccountMailLinkError";
  }
}

export const ACCOUNT_MAIL_KEY_PREFIX = "account-mail/";

const URL_SAFE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const KEY_HASH_PREFIX_LENGTH = 16;
const RANDOM_KEY_BYTES = 16;

const MESSAGES_BY_LOCALE: Readonly<Record<AppLocale, typeof roMessages>> = {
  ro: roMessages,
  ru: ruMessages as typeof roMessages,
};

const PAGE_BY_KIND = {
  "confirm-email": "verify-email",
  "reset-password": "reset-password",
  "already-registered": "login",
} as const;

/**
 * Pure. The message in the account's language (the default one when that is not served), as text and as an HTML
 * alternative made from the same parts. The only secret it can carry is the token, once, after `#` in the link: never
 * in the subject, and never in a place a server or a `Referer` would see.
 * @throws AccountMailLinkError for a link that is not a bare origin with a URL-safe token.
 */
export function buildAccountMail(
  request: AccountMailRequest,
): AccountMailContent {
  const locale = servedLocaleOf(request.locale);
  const copy = copyIn(locale);
  const parts = partsOf(request, copy, locale);
  return {
    subject: parts.subject,
    text: textOf(parts, copy),
    html: htmlOf(parts, copy, locale),
  };
}

/**
 * The idempotency key: the kind and the first half of the token row's hash (which names no address and cannot
 * produce the token), or a random value when the mail has no token row.
 */
export function accountMailKey(
  kind: AccountMailKind,
  tokenHash?: string,
): string {
  const suffix =
    tokenHash !== undefined && SHA256_HEX.test(tokenHash)
      ? tokenHash.slice(0, KEY_HASH_PREFIX_LENGTH)
      : randomBytes(RANDOM_KEY_BYTES).toString("hex");
  return `${ACCOUNT_MAIL_KEY_PREFIX}${kind}/${suffix}`;
}

interface MailParts {
  readonly subject: string;
  readonly intro: string;
  readonly note: string;
  readonly action?: { readonly label: string; readonly url: string };
}

function partsOf(
  request: AccountMailRequest,
  copy: AccountMailCopy,
  locale: AppLocale,
): MailParts {
  switch (request.kind) {
    case "confirm-email":
      return withAction(copy.confirmEmail, request, locale);
    case "reset-password":
      return withAction(copy.resetPassword, request, locale);
    case "already-registered":
      return withAction(copy.alreadyRegistered, request, locale);
    case "password-changed":
      return copy.passwordChanged;
  }
}

function withAction(
  copy: AccountMailCopy["confirmEmail"],
  request: Extract<AccountMailRequest, { link: unknown }>,
  locale: AppLocale,
): MailParts {
  const { subject, intro, note, action } = copy;
  const url = linkOf(request, locale);
  return { subject, intro, note, action: { label: action, url } };
}

function linkOf(
  request: Extract<AccountMailRequest, { link: unknown }>,
  locale: AppLocale,
): string {
  const { origin } = request.link;
  if (!isBareOrigin(origin)) throw new AccountMailLinkError();
  const page = `${origin}/${locale}/account/${PAGE_BY_KIND[request.kind]}`;
  if (!("token" in request.link)) return page;
  const { token } = request.link;
  if (!URL_SAFE_TOKEN.test(token)) throw new AccountMailLinkError();
  return `${page}#t=${token}`;
}

function isBareOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

function textOf(parts: MailParts, copy: AccountMailCopy): string {
  const { intro, note, action } = parts;
  const actionLines =
    action === undefined ? [] : [`${action.label}:`, action.url, ""];
  return [intro, "", ...actionLines, note, "", copy.noReply].join("\n");
}

const PAPER = "#faf8f4";
const INK = "#1c1814";
const ACCENT = "#7c5c3d";
const ON_ACCENT = "#ffffff";
const FONT = "Helvetica, Arial, sans-serif";

function htmlOf(
  parts: MailParts,
  copy: AccountMailCopy,
  locale: AppLocale,
): string {
  const body = [
    paragraph(parts.intro),
    ...actionMarkup(parts, copy),
    paragraph(parts.note),
    paragraph(copy.noReply),
  ].join("");
  return (
    `<!DOCTYPE html><html lang="${locale}"><head>` +
    `<meta charset="utf-8"><meta name="color-scheme" content="light">` +
    `<title>${escapeHtml(parts.subject)}</title></head>` +
    `<body style="margin:0;padding:24px;background:${PAPER};color:${INK};font-family:${FONT}">` +
    `<div style="max-width:560px;margin:0 auto">${body}</div></body></html>`
  );
}

function actionMarkup(parts: MailParts, copy: AccountMailCopy): string[] {
  const { action } = parts;
  if (action === undefined) return [];
  const url = escapeHtml(action.url);
  const buttonStyle = `display:inline-block;padding:12px 20px;background:${ACCENT};color:${ON_ACCENT};text-decoration:none`;
  return [
    `<p><a href="${url}" style="${buttonStyle}">${escapeHtml(action.label)}</a></p>`,
    `<p>${escapeHtml(copy.linkFallback)}<br>${url}</p>`,
  ];
}

function paragraph(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

function servedLocaleOf(locale: string): AppLocale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

function copyIn(locale: AppLocale): AccountMailCopy {
  return resolveAccountMailCopy(
    createTranslator({
      locale,
      messages: MESSAGES_BY_LOCALE[locale],
      onError: throwTheFailedLeaf,
    }),
  );
}

function throwTheFailedLeaf(failure: IntlError): never {
  throw failure;
}
