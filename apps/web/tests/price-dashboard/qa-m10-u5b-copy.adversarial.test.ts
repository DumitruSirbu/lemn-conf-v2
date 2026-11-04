// Adversarial QA of the publish page's follow-up copy (priceDashboard.publish.* and history.pageFailed): what the copy lock
// (the Romanian words by deep equality) and the copy rules (the figures and the parameters of every leaf) do not hold,
// which is the spelling and the Russian side of these leaves.
import { describe, expect, it } from "vitest";

import { catalogueLeaves, CATALOGUES, leafAt } from "../support/catalogues";

/** What a person must never read in a sentence: an id's name, a developer's word or a refusal code. */
const ID_WORDS =
  /\b(ruleId|buildId|tierId|accessoryId|undefined|null|candidate|PRICE_|NO_RULE)/iu;

/** An ICU argument, `{name}` or `{count, number, ::group-off}`: syntax, not text. */
const PARAMETER = /\{[^}]*\}/gu;

const FOLLOW_UP_LEAVES = [
  "priceDashboard.publish.unreadableTitle",
  "priceDashboard.publish.unreadableBody",
  "priceDashboard.publish.staleDraftTitle",
  "priceDashboard.publish.staleDraftBody",
  "priceDashboard.publish.staleChangeKept",
  "priceDashboard.publish.staleChangeWholeDraftOnly",
  "priceDashboard.publish.noActiveVersion",
  "priceDashboard.publish.staleDraftWholeBook",
  "priceDashboard.publish.writeCandidateRefused",
  "priceDashboard.publish.answerUnreadableTitle",
  "priceDashboard.publish.answerUnreadableBody",
  "priceDashboard.publish.discardAction",
  "priceDashboard.publish.discardTitle",
  "priceDashboard.publish.discardBody",
  "priceDashboard.publish.discarding",
  "priceDashboard.publish.discardedBody",
  "priceDashboard.publish.discardChangedMeanwhile",
  "priceDashboard.publish.refusalChange",
  "priceDashboard.publish.refusalPriceNotPositive",
  "priceDashboard.publish.refusalPriceTooLarge",
  "priceDashboard.publish.refusalPercent",
  "priceDashboard.publish.refusalLink",
  "priceDashboard.publish.refusalCabinet",
  "priceDashboard.publish.refusalUnnamed",
  "priceDashboard.publish.refusalsMore",
  "priceDashboard.publish.rowDeleted",
  "priceDashboard.publish.unsentAmountHint",
  "priceDashboard.history.pageFailed",
  "priceDashboard.history.restoreCandidateRefused",
] as const;

/** Cedilla s and t, which Romanian does not write (the comma-below letters are U+0219 and U+021B). Built from code points, not
 *  written, so that this file holds no Romanian of its own. */
const CEDILLA = new RegExp(
  `[${[0x015e, 0x015f, 0x0162, 0x0163].map((code) => String.fromCodePoint(code)).join("")}]`,
  "u",
);

describe.each(CATALOGUES)(
  "the leaves of the follow-ups in %s",
  (locale, messages) => {
    it.each(FOLLOW_UP_LEAVES)("has %s, non-empty and not a bare key", (key) => {
      const text = leafAt(messages, key);

      expect(text, key).toBeDefined();
      expect(text?.trim(), key).not.toBe("");
      expect(text, key).not.toBe(key);
    });

    it("writes no id, no address and no English developer word into any leaf", () => {
      for (const key of FOLLOW_UP_LEAVES) {
        const text = leafAt(messages, key) ?? "";

        expect(text, key).not.toMatch(
          /\b(ruleId|buildId|tierId|accessoryId|undefined|null|candidate|refus|PRICE_|NO_RULE)/iu,
        );
      }
    });

    it("names no figure that is not a parameter (the copy rule, over exactly these leaves)", () => {
      for (const key of FOLLOW_UP_LEAVES) {
        const withoutSyntax = (leafAt(messages, key) ?? "").replaceAll(
          PARAMETER,
          "",
        );

        expect(withoutSyntax, key).not.toMatch(/\d/u);
      }
    });

    if (locale === "ro") {
      it("spells with the comma-below letters, in these leaves and in the whole dashboard namespace", () => {
        const leaves = catalogueLeaves(
          messages.priceDashboard,
          "priceDashboard",
        );

        for (const [key, text] of leaves) {
          expect(text, key).not.toMatch(CEDILLA);
        }
      });
    }

    if (locale === "ru") {
      it("is Russian: every letter of every leaf is Cyrillic, punctuation or a parameter", () => {
        for (const key of FOLLOW_UP_LEAVES) {
          const withoutSyntax = (leafAt(messages, key) ?? "").replaceAll(
            PARAMETER,
            "",
          );

          expect(withoutSyntax, key).not.toMatch(/\p{Script=Latin}/u);
        }
      });
    }
  },
);

describe("the predicates of the sweeps above", () => {
  it("see a cedilla letter, an id word, a bare figure and a Latin letter in a Russian leaf", () => {
    expect(String.fromCodePoint(0x015f)).toMatch(CEDILLA);
    expect("the buildId of the cabinet").toMatch(ID_WORDS);
    expect("la 5 mm".replaceAll(PARAMETER, "")).toMatch(/\d/u);
    expect("цена x".replaceAll(PARAMETER, "")).toMatch(/\p{Script=Latin}/u);
  });
});
