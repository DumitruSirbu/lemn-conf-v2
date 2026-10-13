import { describe, expect, it } from "vitest";

import { codeOf, importClosureOf } from "../support/source-import-closure";

/**
 * Reads source: the already-sent arm has no way to send (ADR 0163 A5). The modules that draw it, and everything they
 * import inside `apps/web/src`, hold none of the send path and no `fetch(`. The dom test with throwing factories is the
 * proof that nothing in the view's graph imports them at run time; this is the one that sees a `fetch(` call, which no
 * mock names.
 */

const VIEW_MODULES = [
  "contact/already-sent-view.tsx",
  "contact/contact-top-bar.tsx",
] as const;

const SEND_PATH = [
  "contact/use-contact-submission.ts",
  "contact/contact-form.tsx",
  "contact/retry-when-online.ts",
  "contact/send-contact-request.ts",
  "done/use-replace-with-done.ts",
] as const;

const FORBIDDEN_IMPORTS = [...SEND_PATH, "done/done-screen.tsx"] as const;

describe("the already-sent arm's import closure", () => {
  it.each(VIEW_MODULES)(
    "reaches none of the send path, nor the confirmation screen, from %s",
    (entry) => {
      const closure = importClosureOf(entry);

      expect(closure).toContain(entry);
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(closure).not.toContain(forbidden);
      }
    },
  );

  it.each(VIEW_MODULES)(
    "holds no fetch( call anywhere in %s's closure",
    (entry) => {
      const calling = importClosureOf(entry).filter((path) =>
        /\bfetch\s*\(/.test(codeOf(path)),
      );

      expect(calling).toEqual([]);
    },
  );

  it("is not an empty walk: it reaches the bar, the reference card, the review link and the locale menu", () => {
    expect(importClosureOf("contact/already-sent-view.tsx")).toEqual(
      expect.arrayContaining([
        "contact/contact-top-bar.tsx",
        "done/sent-reference-card.tsx",
        "result/review-link.tsx",
        "app/configurator/configure/locale-menu.tsx",
      ]),
    );
  });

  it("control: from the contact screen the same walk does reach the send path, and finds a fetch( in it", () => {
    const closure = importClosureOf("contact/contact-screen.tsx");

    for (const sendModule of SEND_PATH) expect(closure).toContain(sendModule);
    expect(
      closure.filter((path) => /\bfetch\s*\(/.test(codeOf(path))),
    ).not.toEqual([]);
  });
});
