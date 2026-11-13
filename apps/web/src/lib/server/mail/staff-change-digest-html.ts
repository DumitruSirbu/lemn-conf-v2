import "server-only";

import { isDesignId } from "@lemnaria/configurator-domain";

import { escapeHtml } from "@/lib/server/mail/lead-notification-html";

/** One kitchen of the digest, every value already one line and bidi-isolated: the template adds markup only. */
export interface DigestRowView {
  readonly kitchen: string;
  readonly client: string;
  readonly sent: string;
  readonly modified: string;
  /** The staff kitchen address; absent for an id that is not a design's. */
  readonly href: string | undefined;
}

export interface StaffChangeDigestView {
  readonly lang: string;
  readonly title: string;
  readonly intro: string;
  /** Said when rows were left for the next e-mail; absent when every row is listed. */
  readonly waiting: string | undefined;
  readonly tableLabel: string;
  readonly openLabel: string;
  readonly rows: readonly DigestRowView[];
  readonly footer: string;
  /** `<public origin>/<lang>/staff/kitchens/`: the only place a link may point, followed by a design id. */
  readonly kitchenLinkPrefix: string;
}

/** A link that is not the staff kitchen address of a design: a defect in the composer. Holds no value. */
export class DigestMarkupError extends Error {
  constructor() {
    super("The digest was handed a link that is not a staff kitchen address");
    this.name = "DigestMarkupError";
  }
}

const PAPER = "#faf8f4";
const SURFACE = "#f5f3f0";
const LINE = "#dcd8ce";
const INK = "#1c1814";
const INK_MUTED = "#6b5e52";
const ACCENT = "#7c5c3d";
const FONT = "Helvetica, Arial, sans-serif";
const CARD_WIDTH_PX = "600";

/** Inline styles only, no image, script, stylesheet or remote reference. Every value is escaped where it is placed. Pure.
 *  @throws DigestMarkupError for a link outside the staff kitchen addresses. */
export function renderStaffChangeDigestHtml(
  view: StaffChangeDigestView,
): string {
  const rows = view.rows.map((row) => rowMarkup(row, view)).join("");
  const body =
    `<div style="${escapeHtml(`margin:0;padding:24px 12px;background:${SURFACE};font-family:${FONT};color:${INK}`)}">` +
    `<div style="${escapeHtml(`max-width:${CARD_WIDTH_PX}px;margin:0 auto;padding:24px;background:${PAPER};border:1px solid ${LINE}`)}">` +
    `<h1 style="${escapeHtml("margin:0 0 12px;font-size:20px")}">${escapeHtml(view.title)}</h1>` +
    `<p style="${escapeHtml(`margin:0 0 16px;font-size:15px;color:${INK}`)}">${escapeHtml(view.intro)}</p>` +
    waitingMarkup(view.waiting) +
    `<table role="presentation" aria-label="${escapeHtml(view.tableLabel)}" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
    `<p style="${escapeHtml(`margin:16px 0 0;font-size:12px;color:${INK_MUTED}`)}">${escapeHtml(view.footer)}</p>` +
    `</div></div>`;
  return (
    `<!DOCTYPE html><html lang="${escapeHtml(view.lang)}"><head>` +
    `<meta charset="utf-8"><title>${escapeHtml(view.title)}</title></head>` +
    `<body style="margin:0">${body}</body></html>`
  );
}

function waitingMarkup(waiting: string | undefined): string {
  if (waiting === undefined) return "";
  const style = escapeHtml(
    `margin:0 0 16px;font-size:14px;font-weight:bold;color:${INK}`,
  );
  return `<p style="${style}">${escapeHtml(waiting)}</p>`;
}

function rowMarkup(row: DigestRowView, view: StaffChangeDigestView): string {
  const cellStyle = escapeHtml(
    `padding:10px 0;border-top:1px solid ${LINE};font-size:14px;vertical-align:top`,
  );
  const muted = escapeHtml(`color:${INK_MUTED}`);
  return (
    `<tr><td style="${cellStyle}">` +
    `<strong>${escapeHtml(row.kitchen)}</strong><br>` +
    `${escapeHtml(row.client)}<br>` +
    `<span style="${muted}">${escapeHtml(row.sent)} · ${escapeHtml(row.modified)}</span>` +
    `</td><td align="right" style="${cellStyle}">${openLink(row, view)}</td></tr>`
  );
}

function openLink(row: DigestRowView, view: StaffChangeDigestView): string {
  if (row.href === undefined) return "";
  if (!isStaffKitchenHref(row.href, view.kitchenLinkPrefix)) {
    throw new DigestMarkupError();
  }
  const style = escapeHtml(`color:${ACCENT};font-weight:bold`);
  return `<a href="${escapeHtml(row.href)}" style="${style}">${escapeHtml(view.openLabel)}</a>`;
}

/** Exactly the prefix and a design id, so a customer's text cannot become, or extend, an address. */
export function isStaffKitchenHref(href: string, prefix: string): boolean {
  return href.startsWith(prefix) && isDesignId(href.slice(prefix.length));
}
