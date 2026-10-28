import "server-only";

/** A label and the value it names, both already one line each. */
export interface LabelledValue {
  readonly label: string;
  readonly value: string;
}

export type ContactActionKind = "call" | "whatsapp" | "email";

export interface ContactAction {
  readonly kind: ContactActionKind;
  readonly href: string;
  readonly label: string;
}

export type NoticeKitchenView =
  | {
      readonly kind: "link";
      readonly href: string;
      /** The configured public origin the link must sit under, as the composer was handed it. */
      readonly origin: string;
      readonly buttonLabel: string;
      readonly note: string;
    }
  | { readonly kind: "unavailable"; readonly sentence: string };

export interface NoticeClientView {
  readonly heading: string;
  readonly name: string;
  readonly phone: string;
  readonly actions: readonly ContactAction[];
  /** In the order the card lists them: channel, locality, e-mail when there is one, the client's language. */
  readonly facts: readonly LabelledValue[];
}

export interface NoticeSummaryView {
  readonly heading: string;
  readonly groupCounts: readonly string[];
  /** The stored figure behind its label, one line. */
  readonly figure: string;
  readonly rounding: string;
  readonly disclaimer: string;
}

export interface NoticeAppendixRow {
  readonly label: string;
  readonly value: string;
  readonly facts: readonly string[];
}

export interface NoticeAppendixGroup {
  readonly heading: string;
  readonly rows: readonly NoticeAppendixRow[];
}

export interface NoticeAppendixView {
  readonly heading: string;
  readonly groups: readonly NoticeAppendixGroup[];
  readonly wholeKitchenRows: readonly NoticeAppendixRow[];
}

/** What a design request's notice adds to a callback's: the kitchen link, the summary and the appendix. */
export interface NoticeKitchenSections {
  readonly roomLine: string;
  readonly link: NoticeKitchenView;
  readonly summary: NoticeSummaryView;
  readonly appendix: NoticeAppendixView;
}

export type NoticeBody =
  | { readonly kind: "design"; readonly kitchen: NoticeKitchenSections }
  | { readonly kind: "callback"; readonly callbackLine: string };

export interface NoticeFooterView {
  /** The reference and, for a design, its revision, each one labelled line. */
  readonly lines: readonly string[];
  readonly noReply: string;
}

/** Every word the HTML part shows, already composed and checked to be one line each: the template adds markup only. */
export interface LeadNoticeView {
  readonly lang: string;
  readonly title: string;
  readonly preheader: string;
  readonly wordmark: string;
  readonly tagline: string;
  readonly heading: string;
  readonly body: NoticeBody;
  readonly client: NoticeClientView;
  readonly footer: NoticeFooterView;
}

/** An `href` the template refused: a defect in the composer, which offers only the four allowed shapes. */
export class NoticeMarkupError extends Error {
  constructor() {
    super(
      "The notice's markup was handed a link outside its four allowed shapes",
    );
    this.name = "NoticeMarkupError";
  }
}

const WHOLE_TOKEN = /^[0-9A-Za-z]{12}$/;
const LANGUAGE_TAG = /^[a-z]{2}$/;
const E164_DIGITS = "[1-9][0-9]{1,14}";
const CALL_HREF = new RegExp(`^tel:\\+${E164_DIGITS}$`);
const WHATSAPP_HREF = new RegExp(`^https://wa\\.me/${E164_DIGITS}$`);
/** What `encodeURIComponent` leaves unencoded, and percent-escapes of anything but a control character: nothing that
 *  ends the address, starts a header field or breaks a line. */
const MAILTO_HREF =
  /^mailto:(?:[A-Za-z0-9._~!*'()-]|%(?![01][0-9A-Fa-f]|7[Ff])[0-9A-Fa-f]{2})+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/** Where a kitchen link may point: under the configured public origin, in the notice's language. */
export interface KitchenLinkScope {
  readonly origin: string;
  readonly lang: string;
}

/**
 * The kitchen link's one shape: exactly the configured origin, the notice's language and a share token. A link under
 * any other origin is refused, however well formed.
 */
export function isKitchenLinkHref(
  href: string,
  { origin, lang }: KitchenLinkScope,
): boolean {
  if (!LANGUAGE_TAG.test(lang)) return false;
  const prefix = `${origin}/${lang}/s/`;
  return href.startsWith(prefix) && WHOLE_TOKEN.test(href.slice(prefix.length));
}

/** A call, a WhatsApp chat or an e-mail: the three shapes a contact button may have. */
export function isContactActionHref(href: string): boolean {
  return (
    CALL_HREF.test(href) || WHATSAPP_HREF.test(href) || MAILTO_HREF.test(href)
  );
}

/** The four shapes an `href` may have, and nothing else: the kitchen link in its scope, a call, a chat, an e-mail. */
export function isAllowedNoticeHref(
  href: string,
  scope: KitchenLinkScope,
): boolean {
  return isKitchenLinkHref(href, scope) || isContactActionHref(href);
}

/** The one escape, for text and attribute values alike: after it, a value can close no element and no attribute. */
export function escapeHtml(value: string): string {
  return value.replace(
    HTML_METACHARACTER,
    (character) => ENTITY[character] ?? "",
  );
}

const HTML_METACHARACTER = /[&<>"']/g;
const ENTITY: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The notice as one HTML document: a 600 px table on the site's own colours, inline styles only, no image, script,
 * stylesheet or remote reference. Every value is escaped where it is placed. Pure.
 * @throws NoticeMarkupError for an `href` outside the four allowed shapes.
 */
export function renderLeadNoticeHtml(view: LeadNoticeView): string {
  const document = element("html", { lang: view.lang }, [
    headOf(view),
    element("body", { style: BODY_STYLE }, [
      element("div", { style: PREHEADER_STYLE }, [view.preheader]),
      frameOf(cardRowsOf(view)),
    ]),
  ]);
  return `<!DOCTYPE html>${document.markup}`;
}

/* The site's own tokens, `app/globals.css`. Every text sits on a cell that names its own background. */
const PAPER = "#faf8f4";
const SURFACE = "#f5f3f0";
const LINE = "#dcd8ce";
const INK = "#1c1814";
const INK_MUTED = "#6b5e52";
const ACCENT = "#7c5c3d";
const ACCENT_STRONG = "#5a3e25";
const ON_ACCENT = "#ffffff";
const FONT = "Helvetica, Arial, sans-serif";

/** Gmail's reading pane is about this wide; the card shrinks below it. */
const CARD_WIDTH_PX = "600";

type Style = string;

function styleOf(declarations: Readonly<Record<string, string>>): Style {
  return Object.entries(declarations)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

const BODY_STYLE = styleOf({
  margin: "0",
  padding: "0",
  "background-color": SURFACE,
  color: INK,
  "font-family": FONT,
});
const PREHEADER_STYLE = styleOf({
  display: "none",
  "max-height": "0",
  overflow: "hidden",
  "font-size": "1px",
  "line-height": "1px",
  opacity: "0",
});

function cellStyle(
  extra: Readonly<Record<string, string>> = {},
  background = PAPER,
): Style {
  return styleOf({
    "background-color": background,
    color: INK,
    "font-family": FONT,
    ...extra,
  });
}

function textStyle(
  size: string,
  colour: string,
  extra: Readonly<Record<string, string>> = {},
): Style {
  return styleOf({
    margin: "0",
    "font-family": FONT,
    "font-size": size,
    "line-height": "1.4",
    color: colour,
    ...extra,
  });
}

const SECTION_PADDING = "20px 24px";
const SECTION_RULE = `1px solid ${LINE}`;

function headOf(view: LeadNoticeView): Markup {
  return element("head", {}, [
    voidElement("meta", { charset: "utf-8" }),
    voidElement("meta", {
      name: "viewport",
      content: "width=device-width, initial-scale=1",
    }),
    voidElement("meta", { name: "color-scheme", content: "light" }),
    voidElement("meta", { name: "supported-color-schemes", content: "light" }),
    element("title", {}, [view.title]),
  ]);
}

function frameOf(rows: readonly Markup[]): Markup {
  return layoutTable({ width: "100%", style: cellStyle({}, SURFACE) }, [
    element("tr", {}, [
      element(
        "td",
        {
          align: "center",
          style: cellStyle({ padding: "24px 12px" }, SURFACE),
        },
        [
          layoutTable(
            {
              width: CARD_WIDTH_PX,
              style: cellStyle({
                width: "100%",
                "max-width": `${CARD_WIDTH_PX}px`,
                border: SECTION_RULE,
              }),
            },
            rows,
          ),
        ],
      ),
    ]),
  ]);
}

function cardRowsOf(view: LeadNoticeView): readonly Markup[] {
  const { body } = view;
  return [
    mastheadRow(view),
    headingRow(view),
    ...(body.kind === "design"
      ? [
          linkRow(body.kitchen.link, view.lang),
          clientRow(view.client),
          summaryRow(body.kitchen.summary),
          appendixRow(body.kitchen.appendix),
        ]
      : [clientRow(view.client), callbackRow(body.callbackLine)]),
    footerRow(view.footer),
  ];
}

function sectionRow(
  children: readonly Child[],
  extra: Readonly<Record<string, string>> = {},
): Markup {
  return element("tr", {}, [
    element(
      "td",
      {
        style: cellStyle({
          padding: SECTION_PADDING,
          "border-top": SECTION_RULE,
          ...extra,
        }),
      },
      children,
    ),
  ]);
}

function mastheadRow(view: LeadNoticeView): Markup {
  return element("tr", {}, [
    element(
      "td",
      {
        style: cellStyle({
          padding: SECTION_PADDING,
          "border-bottom": `3px solid ${ACCENT}`,
        }),
      },
      [
        element(
          "span",
          {
            style: textStyle("18px", ACCENT_STRONG, {
              "font-weight": "bold",
              "letter-spacing": "3px",
              "text-transform": "uppercase",
            }),
          },
          [view.wordmark],
        ),
        element("span", { style: textStyle("13px", INK_MUTED) }, [
          ` ${view.tagline}`,
        ]),
      ],
    ),
  ]);
}

function headingRow(view: LeadNoticeView): Markup {
  const roomLine =
    view.body.kind === "design"
      ? [paragraph(view.body.kitchen.roomLine, textStyle("15px", INK_MUTED))]
      : [];
  return element("tr", {}, [
    element("td", { style: cellStyle({ padding: "24px 24px 8px" }) }, [
      element(
        "h1",
        { style: textStyle("22px", INK, { "margin-bottom": "6px" }) },
        [view.heading],
      ),
      ...roomLine,
    ]),
  ]);
}

function linkRow(link: NoticeKitchenView, lang: string): Markup {
  const children =
    link.kind === "link"
      ? [
          primaryButton(link, lang),
          paragraph(
            link.note,
            textStyle("13px", INK_MUTED, { "margin-top": "10px" }),
          ),
        ]
      : [paragraph(link.sentence, textStyle("15px", INK))];
  return element("tr", {}, [
    element(
      "td",
      { style: cellStyle({ padding: "12px 24px 24px" }) },
      children,
    ),
  ]);
}

const BUTTON_RADIUS = "6px";

/** 12 + 20 + 12 px: the site's 44 px touch target. */
function primaryButton(
  link: Extract<NoticeKitchenView, { kind: "link" }>,
  lang: string,
): Markup {
  return layoutTable({}, [
    element("tr", {}, [
      element(
        "td",
        {
          style: cellStyle(
            { color: ON_ACCENT, "border-radius": BUTTON_RADIUS },
            ACCENT,
          ),
        },
        [
          anchor(
            {
              href: link.href,
              isAllowed: isKitchenLinkHref(link.href, {
                origin: link.origin,
                lang,
              }),
              style: textStyle("16px", ON_ACCENT, {
                display: "inline-block",
                padding: "12px 24px",
                "line-height": "20px",
                "font-weight": "bold",
                "text-decoration": "none",
                "background-color": ACCENT,
                "border-radius": BUTTON_RADIUS,
              }),
            },
            link.buttonLabel,
          ),
        ],
      ),
    ]),
  ]);
}

function clientRow(client: NoticeClientView): Markup {
  return sectionRow([
    heading2(client.heading),
    paragraph(
      client.name,
      textStyle("20px", INK, { "font-weight": "bold", "margin-top": "8px" }),
    ),
    paragraph(client.phone, textStyle("16px", INK, { "margin-top": "4px" })),
    ...(client.actions.length > 0 ? [actionsOf(client.actions)] : []),
    factsTable(client.facts),
  ]);
}

const ACTION_GAP_PX = "8px";

function actionsOf(actions: readonly ContactAction[]): Markup {
  return layoutTable({ style: styleOf({ "margin-top": "12px" }) }, [
    element(
      "tr",
      {},
      actions.map((action) =>
        element(
          "td",
          { style: cellStyle({ "padding-right": ACTION_GAP_PX }) },
          [
            anchor(
              {
                href: action.href,
                isAllowed: isContactActionHref(action.href),
                style: textStyle("15px", ACCENT_STRONG, {
                  display: "inline-block",
                  padding: "11px 16px",
                  "line-height": "20px",
                  "font-weight": "bold",
                  "text-decoration": "none",
                  border: `1px solid ${ACCENT}`,
                  "border-radius": BUTTON_RADIUS,
                  "background-color": PAPER,
                }),
              },
              action.label,
            ),
          ],
        ),
      ),
    ),
  ]);
}

function factsTable(facts: readonly LabelledValue[]): Markup {
  return layoutTable(
    { width: "100%", style: styleOf({ "margin-top": "16px" }) },
    facts.map((fact) =>
      element("tr", {}, [
        element(
          "td",
          {
            width: "40%",
            style: cellStyle({
              padding: "4px 12px 4px 0",
              "vertical-align": "top",
            }),
          },
          [
            element("span", { style: textStyle("14px", INK_MUTED) }, [
              fact.label,
            ]),
          ],
        ),
        element(
          "td",
          { style: cellStyle({ padding: "4px 0", "vertical-align": "top" }) },
          [element("span", { style: textStyle("14px", INK) }, [fact.value])],
        ),
      ]),
    ),
  );
}

function summaryRow(summary: NoticeSummaryView): Markup {
  return sectionRow([
    heading2(summary.heading),
    ...summary.groupCounts.map((line) =>
      paragraph(line, textStyle("15px", INK, { "margin-top": "6px" })),
    ),
    paragraph(
      summary.figure,
      textStyle("16px", INK, { "font-weight": "bold", "margin-top": "12px" }),
    ),
    paragraph(
      summary.rounding,
      textStyle("12px", INK_MUTED, { "margin-top": "8px" }),
    ),
    paragraph(
      summary.disclaimer,
      textStyle("12px", INK_MUTED, { "margin-top": "4px" }),
    ),
  ]);
}

const APPENDIX_TEXT = textStyle("12px", INK_MUTED);

function appendixRow(appendix: NoticeAppendixView): Markup {
  return sectionRow([
    element(
      "h3",
      { style: textStyle("14px", INK_MUTED, { "margin-bottom": "8px" }) },
      [appendix.heading],
    ),
    layoutTable({ width: "100%" }, [
      ...appendix.groups.flatMap(appendixGroupRows),
      ...appendix.wholeKitchenRows.map((row) =>
        appendixLine(row.label, row.value, row.facts),
      ),
    ]),
  ]);
}

function appendixGroupRows(group: NoticeAppendixGroup): Markup[] {
  return [
    element("tr", {}, [
      element(
        "td",
        { colspan: "2", style: cellStyle({ padding: "10px 0 2px" }) },
        [
          element(
            "span",
            { style: textStyle("12px", INK_MUTED, { "font-weight": "bold" }) },
            [group.heading],
          ),
        ],
      ),
    ]),
    ...group.rows.map((row) => appendixLine(row.label, row.value, row.facts)),
  ];
}

function appendixLine(
  label: string,
  value: string,
  facts: readonly string[],
): Markup {
  return element("tr", {}, [
    element(
      "td",
      {
        style: cellStyle({ padding: "2px 8px 2px 0", "vertical-align": "top" }),
      },
      [
        element("span", { style: APPENDIX_TEXT }, [label]),
        ...facts.map((fact) =>
          element(
            "div",
            { style: textStyle("12px", INK_MUTED, { "padding-left": "12px" }) },
            [fact],
          ),
        ),
      ],
    ),
    element(
      "td",
      {
        align: "right",
        style: cellStyle({
          padding: "2px 0",
          "vertical-align": "top",
          "white-space": "nowrap",
        }),
      },
      [element("span", { style: APPENDIX_TEXT }, [value])],
    ),
  ]);
}

function callbackRow(callbackLine: string): Markup {
  return sectionRow([paragraph(callbackLine, textStyle("15px", INK))]);
}

function footerRow(footer: NoticeFooterView): Markup {
  return element("tr", {}, [
    element(
      "td",
      {
        style: cellStyle(
          { padding: SECTION_PADDING, "border-top": SECTION_RULE },
          SURFACE,
        ),
      },
      [
        ...footer.lines.map((line) =>
          paragraph(line, textStyle("12px", INK_MUTED)),
        ),
        paragraph(
          footer.noReply,
          textStyle("12px", INK_MUTED, { "margin-top": "6px" }),
        ),
      ],
    ),
  ]);
}

function heading2(text: string): Markup {
  return element("h2", { style: textStyle("17px", INK) }, [text]);
}

function paragraph(text: string, style: Style): Markup {
  return element("p", { style }, [text]);
}

/* The closed set of builders. Markup is made only here, and a string child or attribute value is always escaped. */

declare const MARKUP_BRAND: unique symbol;

interface Markup {
  readonly markup: string;
  readonly [MARKUP_BRAND]: true;
}

type Child = Markup | string;

type Tag =
  | "html"
  | "head"
  | "title"
  | "body"
  | "table"
  | "tr"
  | "td"
  | "div"
  | "span"
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "a";

type AttributeName =
  | "lang"
  | "style"
  | "role"
  | "width"
  | "align"
  | "colspan"
  | "cellpadding"
  | "cellspacing"
  | "border";

type Attributes = Partial<Readonly<Record<AttributeName, string>>>;

type MetaAttributeName = "charset" | "name" | "content";

function markupOf(markup: string): Markup {
  return { markup } as Markup;
}

function element(
  tag: Tag,
  attributes: Attributes,
  children: readonly Child[],
): Markup {
  return markupOf(
    `<${tag}${attributeText(attributes)}>${children.map(childText).join("")}</${tag}>`,
  );
}

function voidElement(
  tag: "meta",
  attributes: Partial<Readonly<Record<MetaAttributeName, string>>>,
): Markup {
  return markupOf(`<${tag}${attributeText(attributes)}>`);
}

/** The only builder that writes an `href`, and only one its caller judged by the shape its place allows. */
function anchor(
  link: {
    readonly href: string;
    readonly isAllowed: boolean;
    readonly style: Style;
  },
  label: string,
): Markup {
  if (!link.isAllowed) throw new NoticeMarkupError();
  return markupOf(
    `<a href="${escapeHtml(link.href)}" style="${escapeHtml(link.style)}">${escapeHtml(label)}</a>`,
  );
}

/** Layout only: a reader is told it is no data table. */
function layoutTable(
  attributes: Omit<
    Attributes,
    "role" | "cellpadding" | "cellspacing" | "border"
  >,
  rows: readonly Markup[],
): Markup {
  return element(
    "table",
    {
      role: "presentation",
      cellpadding: "0",
      cellspacing: "0",
      border: "0",
      ...attributes,
    },
    rows,
  );
}

function childText(child: Child): string {
  return typeof child === "string" ? escapeHtml(child) : child.markup;
}

function attributeText(
  attributes: Readonly<Record<string, string | undefined>>,
): string {
  return Object.entries(attributes)
    .flatMap(([name, value]) =>
      value === undefined ? [] : [` ${name}="${escapeHtml(value)}"`],
    )
    .join("");
}
