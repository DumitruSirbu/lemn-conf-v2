import {
  buildDigestModel,
  type DigestKitchenInput,
  type DigestModel,
} from "@lemnaria/configurator-domain";
import { generateDesignId } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import {
  composeBoundedStaffChangeDigest,
  composeStaffChangeDigest,
  DIGEST_HTML_BUDGET,
  staffChangeDigestCopy,
  STAFF_CHANGE_DIGEST_KEY_PREFIX,
} from "@/lib/server/mail/staff-change-digest";
import {
  DigestMarkupError,
  renderStaffChangeDigestHtml,
} from "@/lib/server/mail/staff-change-digest-html";
import { isSendableMailMessage } from "@/lib/server/mail/mail-sender";
import type { PublicOrigin } from "@/lib/server/public-origin";

const ORIGIN = "https://lemnaria.example" as PublicOrigin;
const NOW_MS = Date.parse("2026-10-20T05:00:00.000Z");
const SENT_MS = Date.parse("2026-10-18T09:00:00.000Z");
const UPDATED_MS = Date.parse("2026-10-19T12:00:00.000Z");
const BIDI_OVERRIDE = "‮";

function modelOf(kitchens: readonly DigestKitchenInput[]): DigestModel {
  const model = buildDigestModel(kitchens);
  if (model.kind !== "digest")
    throw new Error("the test's kitchens made no digest");
  return model;
}

function composeFor(kitchens: readonly DigestKitchenInput[]) {
  return composeStaffChangeDigest({
    model: modelOf(kitchens),
    origin: ORIGIN,
    dayKey: "2026-10-20",
    nowMs: NOW_MS,
    copy: staffChangeDigestCopy(),
  });
}

function kitchen(fields: Partial<DigestKitchenInput> = {}): DigestKitchenInput {
  return {
    designId: generateDesignId(),
    customerName: "Ana Popescu",
    sentAtMs: SENT_MS,
    updatedAtMs: UPDATED_MS,
    ...fields,
  } as DigestKitchenInput;
}

describe("the staff change digest message", () => {
  it("keys the message by its day and puts only the count in the subject", () => {
    const message = composeFor([
      kitchen({ kitchenName: "Secret kitchen name" }),
      kitchen({ customerName: "Secret Client" }),
    ]);

    expect(message.key).toBe(`${STAFF_CHANGE_DIGEST_KEY_PREFIX}2026-10-20`);
    expect(message.subject).toBe(staffChangeDigestCopy().title(2));
    expect(message.subject).not.toMatch(/Secret/);
  });

  it("escapes a kitchen name and an account name in the HTML and removes a bidi override", () => {
    const message = composeFor([
      kitchen({
        kitchenName: `<b onmouseover="x">kitchen</b>${BIDI_OVERRIDE}`,
        customerName: `<script>alert("a")</script>${BIDI_OVERRIDE}`,
      }),
    ]);

    expect(message.html).toContain("&lt;b onmouseover=&quot;x&quot;&gt;");
    expect(message.html).toContain("&lt;script&gt;alert(&quot;a&quot;)");
    expect(message.html).not.toContain("<script");
    expect(message.html).not.toContain("<b ");
    expect(message.html).not.toContain(BIDI_OVERRIDE);
    expect(message.text).not.toContain(BIDI_OVERRIDE);
  });

  it("keeps a line break in a customer's text from forging a line of the text part", () => {
    const message = composeFor([
      kitchen({ kitchenName: "Kitchen\r\nForged: header More" }),
    ]);

    const lines = message.text.split("\n");
    expect(lines.some((line) => line.startsWith("Forged:"))).toBe(false);
    expect(message.text).toContain("Kitchen Forged: header More");
  });

  it("names a kitchen with no account by its request reference", () => {
    const message = composeFor([
      {
        designId: generateDesignId(),
        reference: "LM-12345678",
        sentAtMs: SENT_MS,
        updatedAtMs: UPDATED_MS,
      },
    ]);

    expect(message.text).toContain("LM-12345678");
    expect(message.html).toContain("LM-12345678");
  });

  it("links only the staff kitchen address of each design, under the public origin", () => {
    const first = generateDesignId();
    const second = generateDesignId();
    const message = composeFor([
      kitchen({ designId: first }),
      kitchen({ designId: second }),
    ]);

    const hrefs = [...(message.html ?? "").matchAll(/href="([^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs.sort()).toEqual(
      [
        `${ORIGIN}/ro/staff/kitchens/${first}`,
        `${ORIGIN}/ro/staff/kitchens/${second}`,
      ].sort(),
    );
    const everyUrlInText = message.text.match(/https?:\/\/\S+/g) ?? [];
    expect(everyUrlInText).toHaveLength(2);
    expect(
      everyUrlInText.every((url) =>
        url.startsWith(`${ORIGIN}/ro/staff/kitchens/`),
      ),
    ).toBe(true);
  });

  it("writes no link for an id that is not a design's", () => {
    const message = composeFor([kitchen({ designId: "not-a-design-id" })]);

    expect(message.html).not.toContain("href=");
    expect(message.text).not.toMatch(/https?:\/\//);
  });

  it("refuses to render a link outside the staff kitchen addresses", () => {
    const view = {
      lang: "ro",
      title: "t",
      intro: "i",
      waiting: undefined,
      tableLabel: "l",
      openLabel: "o",
      footer: "f",
      kitchenLinkPrefix: `${ORIGIN}/ro/staff/kitchens/`,
      rows: [
        {
          kitchen: "k",
          client: "c",
          sent: "s",
          modified: "m",
          href: "https://evil.example/ro/staff/kitchens/x",
        },
      ],
    };

    expect(() => renderStaffChangeDigestHtml(view)).toThrow(DigestMarkupError);
  });

  it("shows the fallback, not an empty fence, for a name of only bidi controls", () => {
    const copy = staffChangeDigestCopy();
    const message = composeFor([
      kitchen({ kitchenName: BIDI_OVERRIDE, customerName: BIDI_OVERRIDE }),
    ]);

    expect(message.text).toContain(copy.unnamedKitchen);
    expect(message.text).not.toContain("\u2068\u2069");
  });

  describe("when the kitchens do not all fit", () => {
    const WORST_NAME = '"'.repeat(120);
    const worstKitchens = (count: number) =>
      Array.from({ length: count }, () =>
        kitchen({ kitchenName: WORST_NAME, customerName: WORST_NAME }),
      );

    it("lists the first rows that fit the budget, counts only them in the subject, and says how many wait", () => {
      const model = modelOf(worstKitchens(1000));
      const copy = staffChangeDigestCopy();

      const { message, includedRowCount } = composeBoundedStaffChangeDigest({
        model,
        origin: ORIGIN,
        dayKey: "2026-10-20",
        nowMs: NOW_MS,
        copy,
      });

      expect(includedRowCount).toBeGreaterThan(0);
      expect(includedRowCount).toBeLessThan(1000);
      expect(message.html?.length).toBeLessThanOrEqual(DIGEST_HTML_BUDGET);
      expect(isSendableMailMessage(message)).toBe(true);
      expect(message.subject).toBe(copy.title(includedRowCount));
      expect(message.text).toContain(copy.moreWaiting(1000 - includedRowCount));
      expect(message.html).toContain(
        copy.moreWaiting(1000 - includedRowCount).replaceAll("&", "&amp;"),
      );
      const listed = model.rows.slice(0, includedRowCount);
      expect(listed.every((row) => message.text.includes(row.designId))).toBe(
        true,
      );
      const left = model.rows[includedRowCount];
      expect(left && message.text.includes(left.designId)).toBe(false);
    });

    it("says nothing about waiting kitchens when every row fits", () => {
      const copy = staffChangeDigestCopy();
      const { message, includedRowCount } = composeBoundedStaffChangeDigest({
        model: modelOf(worstKitchens(3)),
        origin: ORIGIN,
        dayKey: "2026-10-20",
        nowMs: NOW_MS,
        copy,
      });

      expect(includedRowCount).toBe(3);
      expect(message.text).not.toContain(copy.moreWaiting(1));
    });
  });
});
