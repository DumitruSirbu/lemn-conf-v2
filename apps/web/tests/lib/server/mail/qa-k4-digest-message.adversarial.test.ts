import {
  buildDigestModel,
  type DigestKitchenInput,
} from "@lemnaria/configurator-domain";
import { generateDesignId } from "@lemnaria/persistence";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  HTML_MAX_LENGTH,
  isSendableMailMessage,
  type MailMessage,
} from "@/lib/server/mail/mail-sender";
import {
  composeStaffChangeDigest,
  staffChangeDigestCopy,
} from "@/lib/server/mail/staff-change-digest";
import type { PublicOrigin } from "@/lib/server/public-origin";

import { parseNotice, tagSequenceOf } from "./notice-html-dom-support";

// M10 K4, adversarial: what a customer-typed kitchen name, account name or request reference can do to the digest's
// subject, its plain-text lines, its markup and its links (ADR 0178 A-13 F6; plan K4-c).

const ORIGIN = "https://lemnaria.example" as PublicOrigin;
const NOW_MS = Date.parse("2026-10-20T05:00:00.000Z");
const SENT_MS = Date.parse("2026-10-18T09:00:00.000Z");
const UPDATED_MS = Date.parse("2026-10-19T12:00:00.000Z");
const KITCHEN_NAME_MAX = 120;
const ACCOUNT_NAME_MAX = 100;
const FIRST_STRONG_ISOLATE = "\u2068";
const POP_DIRECTIONAL_ISOLATE = "\u2069";
const BIDI_ORDER_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066\u2067]/u;
const CONTROL_OR_SEPARATOR = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const LINE_SPLITTER = /\n/;

function compose(
  kitchens: readonly DigestKitchenInput[],
  origin: PublicOrigin = ORIGIN,
): MailMessage {
  const model = buildDigestModel(kitchens);
  if (model.kind !== "digest") throw new Error("these kitchens make no digest");
  return composeStaffChangeDigest({
    model,
    origin,
    dayKey: "2026-10-20",
    nowMs: NOW_MS,
    copy: staffChangeDigestCopy(),
  });
}

function withAccount(fields: {
  kitchenName?: string;
  customerName: string;
  designId?: string;
}): DigestKitchenInput {
  return {
    designId: fields.designId ?? generateDesignId(),
    ...(fields.kitchenName === undefined
      ? {}
      : { kitchenName: fields.kitchenName }),
    customerName: fields.customerName,
    sentAtMs: SENT_MS,
    updatedAtMs: UPDATED_MS,
  };
}

function withReference(
  reference: string,
  kitchenName?: string,
): DigestKitchenInput {
  return {
    designId: generateDesignId(),
    ...(kitchenName === undefined ? {} : { kitchenName }),
    reference,
    sentAtMs: SENT_MS,
    updatedAtMs: UPDATED_MS,
  };
}

const BENIGN_ACCOUNT_KITCHEN = withAccount({
  kitchenName: "Bucatarie",
  customerName: "Ana",
});
const BENIGN_REFERENCE_KITCHEN = withReference("LM-1", "Bucatarie");

function html(message: MailMessage): string {
  if (message.html === undefined)
    throw new Error("the digest has no HTML part");
  return message.html;
}

/** The text part's own line breaks are the `\n` it is written with; any other break is a customer's. */
function withoutPlannedBreaks(text: string): string {
  return text.replaceAll("\n", "");
}

function countOf(text: string, piece: string): number {
  return text.split(piece).length - 1;
}

function attributeNamesOf(markup: string): string[] {
  return [
    ...new Set(
      parseNotice(markup).elements.flatMap((element) =>
        element.getAttributeNames(),
      ),
    ),
  ].sort();
}

const HOSTILE_TEXTS = [
  `<script>alert(1)</script>`,
  `"><img src=x onerror=alert(1)>`,
  `' onmouseover='alert(1)`,
  `&amp; &lt;b&gt; &#x3C;`,
  "</td></tr></table><h1>forged</h1>",
  "`${process.env.CRON_SECRET}`",
  "line one\r\nForged-Header: x\u2028Forged: y\u2029Forged: z\u0085Forged: w",
  "\u202Eevil\u202C \u2066 \u2067 \u2069 \u061C \u200F",
] as const;

describe("every customer-typed field of the digest", () => {
  const fieldsOf = (hostile: string): Record<string, DigestKitchenInput> => ({
    "a kitchen name": withAccount({
      kitchenName: hostile,
      customerName: "Ana",
    }),
    "an account name": withAccount({
      kitchenName: "Bucatarie",
      customerName: hostile,
    }),
    "a request reference": withReference(hostile, "Bucatarie"),
  });
  const baselineOf = (kitchen: DigestKitchenInput): MailMessage =>
    compose([kitchen]);

  it.each(
    HOSTILE_TEXTS.flatMap((hostile) =>
      ["a kitchen name", "an account name", "a request reference"].map(
        (field) => [field, hostile] as const,
      ),
    ),
  )(
    "cannot add an element, an attribute or a line when %s is %j",
    (field, hostile) => {
      const kitchen = fieldsOf(hostile)[field];
      if (kitchen === undefined) throw new Error("unknown field");
      const baselineKitchen =
        field === "a request reference"
          ? BENIGN_REFERENCE_KITCHEN
          : BENIGN_ACCOUNT_KITCHEN;

      const message = compose([kitchen]);
      const baseline = baselineOf(baselineKitchen);

      expect(tagSequenceOf(parseNotice(html(message)))).toEqual(
        tagSequenceOf(parseNotice(html(baseline))),
      );
      expect(attributeNamesOf(html(message))).toEqual(
        attributeNamesOf(html(baseline)),
      );
      expect(message.text.split(LINE_SPLITTER)).toHaveLength(
        baseline.text.split(LINE_SPLITTER).length,
      );
      expect(withoutPlannedBreaks(message.text)).not.toMatch(
        CONTROL_OR_SEPARATOR,
      );
      expect(message.subject).toBe(baseline.subject);
      expect(message.key).toBe(baseline.key);
      expect(isSendableMailMessage(message)).toBe(true);
    },
  );

  it("never leaves a bidi order control, only balanced isolates, in either part", () => {
    const message = compose(
      HOSTILE_TEXTS.flatMap((hostile) => Object.values(fieldsOf(hostile))),
    );

    for (const part of [message.text, html(message)]) {
      expect(part).not.toMatch(BIDI_ORDER_CONTROLS);
      expect(countOf(part, FIRST_STRONG_ISOLATE)).toBe(
        countOf(part, POP_DIRECTIONAL_ISOLATE),
      );
    }
  });

  it("holds a stray closing isolate of a value inside its own fence", () => {
    const message = compose([
      withAccount({ kitchenName: "a\u2069b", customerName: "c\u2069d" }),
    ]);

    expect(message.text).toContain(
      `${FIRST_STRONG_ISOLATE}ab${POP_DIRECTIONAL_ISOLATE}`,
    );
    expect(message.text).toContain(
      `${FIRST_STRONG_ISOLATE}cd${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  it("shows an ampersand entity as typed, escaped once, in the markup", () => {
    const message = compose([
      withAccount({ kitchenName: "&amp; 'x'", customerName: "A&B" }),
    ]);

    expect(html(message)).toContain("&amp;amp; &#39;x&#39;");
    expect(html(message)).toContain("A&amp;B");
  });

  it("is not made to differ in structure by any text at all", () => {
    const anyText = fc.string({ unit: "binary", maxLength: 200 });
    const nonBlank = anyText.filter((value) => value.trim() !== "");
    const baseline = compose([
      BENIGN_ACCOUNT_KITCHEN,
      BENIGN_REFERENCE_KITCHEN,
    ]);
    const baselineTags = tagSequenceOf(parseNotice(html(baseline)));

    fc.assert(
      fc.property(anyText, nonBlank, nonBlank, (kitchenName, account, ref) => {
        const message = compose([
          withAccount({ kitchenName, customerName: account }),
          withReference(ref, kitchenName),
        ]);

        expect(message.subject).toBe(baseline.subject);
        expect(message.text.split(LINE_SPLITTER)).toHaveLength(
          baseline.text.split(LINE_SPLITTER).length,
        );
        expect(withoutPlannedBreaks(message.text)).not.toMatch(
          CONTROL_OR_SEPARATOR,
        );
        expect(message.text).not.toMatch(BIDI_ORDER_CONTROLS);
        expect(html(message)).not.toMatch(BIDI_ORDER_CONTROLS);
        expect(tagSequenceOf(parseNotice(html(message)))).toEqual(baselineTags);
        expect(countOf(html(message), "<a ")).toBe(2);
      }),
      { numRuns: 200 },
    );
  });
});

describe("a value with nothing left to show", () => {
  it("falls back to the unnamed-kitchen word for a kitchen name of only line breaks and tabs", () => {
    const message = compose([
      withAccount({ kitchenName: "\n\t\r\u2028", customerName: "Ana" }),
    ]);

    expect(message.text).toContain(staffChangeDigestCopy().unnamedKitchen);
  });

  // Defect: `typedValue` (staff-change-digest.ts) tests for emptiness BEFORE `isolated` strips the bidi controls, so a
  // name of only controls passes the test and is shown as an empty fence, not as the fallback.
  it("does not show a kitchen name made only of bidi controls as an empty fence", () => {
    const message = compose([
      withAccount({ kitchenName: "\u202E\u200F", customerName: "Ana" }),
    ]);

    expect(message.text).not.toContain(
      `${FIRST_STRONG_ISOLATE}${POP_DIRECTIONAL_ISOLATE}`,
    );
    expect(message.text).toContain(staffChangeDigestCopy().unnamedKitchen);
  });

  it("does not show an account name made only of bidi controls as an empty fence", () => {
    const message = compose([
      withAccount({ kitchenName: "Bucatarie", customerName: "\u202E\u200F" }),
    ]);

    expect(message.text).not.toContain(
      `${FIRST_STRONG_ISOLATE}${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  // Pinned current behaviour, backlog 290: a zero-width-only name is neither blank for `trim()` nor a control, so it
  // is printed as an invisible name instead of the fallback.
  it("prints a zero-width-only kitchen name as an invisible name (backlog 290)", () => {
    const message = compose([
      withAccount({ kitchenName: "\u200B\u200B", customerName: "Ana" }),
    ]);

    expect(message.text).toContain(
      `${FIRST_STRONG_ISOLATE}\u200B\u200B${POP_DIRECTIONAL_ISOLATE}`,
    );
    expect(message.text).not.toContain(staffChangeDigestCopy().unnamedKitchen);
  });
});

describe("the digest's links and recipient", () => {
  const HOSTILE_DESIGN_IDS = [
    "../../x",
    'x" onmouseover="alert(1)',
    "javascript:alert(1)",
    "https://evil.example/ro/staff/kitchens/x",
    "",
    " ",
    "a b",
    "a/b",
    "\u202E",
  ];

  it.each(HOSTILE_DESIGN_IDS)(
    "writes no link for the design id %j",
    (designId) => {
      const message = compose([withAccount({ customerName: "Ana", designId })]);

      expect(html(message)).not.toContain("href=");
      expect(message.text).not.toMatch(/https?:\/\//);
    },
  );

  it("puts the only link of each row under the configured origin, one per row, in both parts", () => {
    const ids = [generateDesignId(), generateDesignId(), generateDesignId()];
    const message = compose(
      ids.map((designId) =>
        withAccount({
          designId,
          kitchenName: "https://evil.example/login",
          customerName: "mailto:x@evil.example",
        }),
      ),
    );

    const hrefs = parseNotice(html(message)).elements.flatMap((element) =>
      element.tagName.toLowerCase() === "a"
        ? [element.getAttribute("href")]
        : [],
    );
    expect(hrefs.sort()).toEqual(
      ids.map((id) => `${ORIGIN}/ro/staff/kitchens/${id}`).sort(),
    );
    expect(countOf(html(message), "<a ")).toBe(ids.length);
  });

  it("builds a link on the origin it was handed, whatever a name says", () => {
    const other = "https://other.example" as PublicOrigin;
    const message = compose(
      [withAccount({ kitchenName: ORIGIN, customerName: "Ana" })],
      other,
    );

    const hrefs = [...html(message).matchAll(/href="([^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]?.startsWith(`${other}/ro/staff/kitchens/`)).toBe(true);
  });

  it("holds exactly four members and no recipient, so no input can choose where it goes", () => {
    const message = compose([
      withAccount({
        kitchenName: "to: attacker@evil.example",
        customerName: "bcc: attacker@evil.example",
      }),
    ]);

    expect(Object.keys(message).sort()).toEqual([
      "html",
      "key",
      "subject",
      "text",
    ]);
    expect(Object.hasOwn(message, "recipient")).toBe(false);
    expect(message.subject).not.toMatch(/@|evil/);
    expect(message.key).not.toMatch(/@|evil/);
  });

  it("contains no phone number, postal address or e-mail of its own (K4-a must-not)", () => {
    const message = compose([BENIGN_ACCOUNT_KITCHEN]);

    expect(message.text).not.toMatch(/@/);
    expect(html(message)).not.toMatch(/@|tel:|mailto:/);
  });

  it("carries no script, image, stylesheet or remote reference in the markup", () => {
    const message = compose([BENIGN_ACCOUNT_KITCHEN, BENIGN_REFERENCE_KITCHEN]);

    const tags = new Set(tagSequenceOf(parseNotice(html(message))));
    for (const forbidden of ["script", "img", "link", "style", "iframe"]) {
      expect(tags.has(forbidden)).toBe(false);
    }
    expect(html(message)).not.toMatch(/src=|url\(|@import/);
  });
});

describe("the digest's size", () => {
  // The worst a stored value can be: the longest name the product allows, every character one the markup escapes to
  // six (`"` is `&quot;`).
  const WORST_KITCHEN_NAME = '"'.repeat(KITCHEN_NAME_MAX);
  const WORST_ACCOUNT_NAME = '"'.repeat(ACCOUNT_NAME_MAX);

  function backlogOf(size: number): DigestKitchenInput[] {
    return Array.from({ length: size }, () =>
      withAccount({
        kitchenName: WORST_KITCHEN_NAME,
        customerName: WORST_ACCOUNT_NAME,
      }),
    );
  }

  it("is sendable for one kitchen of the longest names the product allows", () => {
    const message = compose(backlogOf(1));

    expect(isSendableMailMessage(message)).toBe(true);
  });

  it("is sendable for a backlog of 100 kitchens of the longest names", () => {
    const message = compose(backlogOf(100));

    expect(html(message).length).toBeLessThanOrEqual(HTML_MAX_LENGTH);
    expect(isSendableMailMessage(message)).toBe(true);
  });

  // Flipped in wave K4's fix round: the composer lists only the rows that fit in DIGEST_HTML_BUDGET and says how many
  // wait, so the message is always one the mail port accepts.
  it("stays sendable for 1000 kitchens of the longest names by listing what fits and saying how many wait", () => {
    const message = compose(backlogOf(1000));

    expect(html(message).length).toBeLessThanOrEqual(HTML_MAX_LENGTH);
    expect(isSendableMailMessage(message)).toBe(true);
    expect(message.text.match(/https:\/\//g)?.length ?? 0).toBeLessThan(1000);
  });

  it("composes one kitchen of a very long name without truncating or throwing", () => {
    const veryLong = "x".repeat(5000);

    const message = compose([
      withAccount({ kitchenName: veryLong, customerName: "Ana" }),
    ]);

    expect(message.text).toContain(veryLong);
    expect(message.subject).not.toContain("xxxxxxxx");
  });
});
