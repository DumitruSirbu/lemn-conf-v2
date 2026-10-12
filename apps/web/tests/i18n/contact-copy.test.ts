import { describe, expect, it } from "vitest";

import type { ContactFieldCode } from "@lemnaria/configurator-domain";

import type { ContactOutcome } from "../../src/contact/contact-answer";
import type { ContactOutcomeNotice } from "../../src/i18n/content";
import {
  catalogueLeaves,
  CATALOGUES,
  contentFor,
  requireLeafAt,
} from "../support/catalogues";

// Every `ContactFieldCode`, written out once: the `satisfies` rejects an invented code and the reverse check below
// rejects one the domain adds, so the sweeps cannot quietly miss a member.
const CONTACT_FIELD_CODES = [
  "REQUIRED",
  "NOT_TEXT",
  "TOO_LONG",
  "FORBIDDEN_CHARACTER",
  "MALFORMED",
  "PHONE_MOLDOVAN_INCOMPLETE",
  "PHONE_MOLDOVAN_TOO_MANY_DIGITS",
  "PHONE_MOLDOVAN_SECOND_ZERO",
  "PHONE_INTERNATIONAL_INCOMPLETE",
  "PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
  "PHONE_FORMAT_UNRECOGNISED",
  "UNKNOWN_CHANNEL",
  "CONSENT_NOT_GIVEN",
  "UNKNOWN_CONSENT_TEXT_VERSION",
] as const satisfies readonly ContactFieldCode[];

const CONTACT_FIELD_CODES_ARE_ALL_LISTED: Record<
  Exclude<ContactFieldCode, (typeof CONTACT_FIELD_CODES)[number]>,
  never
> = {};
void CONTACT_FIELD_CODES_ARE_ALL_LISTED;

/** The codes no field of the form can produce; they are told as the failure they are. */
const CODES_NO_FORM_CAN_PRODUCE = [
  "NOT_TEXT",
  "UNKNOWN_CHANNEL",
  "UNKNOWN_CONSENT_TEXT_VERSION",
] as const;

const INTERNATIONAL_CODES = [
  "PHONE_INTERNATIONAL_INCOMPLETE",
  "PHONE_INTERNATIONAL_TOO_MANY_DIGITS",
  "PHONE_FORMAT_UNRECOGNISED",
] as const;

const CONTACT_OUTCOME_NOTICES: readonly ContactOutcomeNotice[] = [
  { kind: "sent", reference: "LM-TOKEN" },
  { kind: "failed" },
  { kind: "refused" },
  { kind: "conflict" },
  { kind: "design-not-current" },
  { kind: "does-not-fit" },
  { kind: "limited", time: "14:05", isTomorrow: false },
  { kind: "limited", time: "14:05", isTomorrow: true },
];

// The notice's kinds are the answer classes' kinds: a class added to either side and not the other does not compile.
const NOTICE_KINDS_ARE_THE_ANSWER_CLASSES: {
  readonly forward: ContactOutcome["kind"] extends ContactOutcomeNotice["kind"]
    ? true
    : false;
  readonly backward: ContactOutcomeNotice["kind"] extends ContactOutcome["kind"]
    ? true
    : false;
} = { forward: true, backward: true };
void NOTICE_KINDS_ARE_THE_ANSWER_CLASSES;

/** What a code looks like when it leaks into a sentence: the domain's and the endpoint's are upper snake case. */
const CODE_SHAPE = /[A-Z]{2,}_[A-Z_]+/;

/** "Changed", "updated" and "out of date", per language: what criterion 13's sentence must not say. */
const CHANGED_WORDS = {
  ro: /schimb|modific|actualiz|vechi/i,
  ru: /измен|обнов|устар/i,
} as const;

/** The phone hint's *same working day*, and the link a consent line would carry, per language. */
const NOT_DRAWN_WORDS = {
  ro: /lucr.toare|aceea.i zi|detalii/i,
  ru: /рабоч|в тот же день|подробн/i,
} as const;

describe.each(CATALOGUES)("the %s contact copy", (locale, messages) => {
  const content = contentFor(locale, messages);

  it.each(CONTACT_FIELD_CODES)("gives %s a sentence", (code) => {
    const sentence = content.contactFieldError(code);

    expect(sentence).not.toBe("");
    expect(sentence).not.toMatch(CODE_SHAPE);
  });

  it.each(CODES_NO_FORM_CAN_PRODUCE)(
    "tells %s, which no form can produce, as the failed sentence",
    (code) => {
      expect(content.contactFieldError(code)).toBe(
        requireLeafAt(messages, "contact.outcomes.failed"),
      );
    },
  );

  it("tells a code this build has no sentence for as the failed sentence", () => {
    const codeFromNewerServer = "A_CODE_FROM_LATER" as ContactFieldCode;

    expect(content.contactFieldError(codeFromNewerServer)).toBe(
      requireLeafAt(messages, "contact.outcomes.failed"),
    );
  });

  it("gives every class of answer its own sentence", () => {
    const sentences = CONTACT_OUTCOME_NOTICES.map((notice) =>
      content.contactOutcome(notice),
    );

    expect(new Set(sentences).size).toBe(CONTACT_OUTCOME_NOTICES.length);
    for (const sentence of sentences) expect(sentence).not.toMatch(CODE_SHAPE);
  });

  it("carries the reference in the sent sentence and the clock time in the limited one", () => {
    expect(
      content.contactOutcome({ kind: "sent", reference: "LM-TOKEN" }),
    ).toContain("LM-TOKEN");
    for (const isTomorrow of [false, true]) {
      expect(
        content.contactOutcome({ kind: "limited", time: "14:05", isTomorrow }),
      ).toContain("14:05");
    }
  });

  it("tells a limited send's wait with its own leaf for today and for tomorrow", () => {
    const limited = (isTomorrow: boolean) =>
      content.contactOutcome({ kind: "limited", time: "14:05", isTomorrow });

    expect(limited(false)).toBe(
      requireLeafAt(messages, "contact.outcomes.limited").replace(
        "{time}",
        "14:05",
      ),
    );
    expect(limited(true)).toBe(
      requireLeafAt(messages, "contact.outcomes.limitedTomorrow").replace(
        "{time}",
        "14:05",
      ),
    );
  });

  it("tells a design that does not fit in the review's own sentence", () => {
    expect(content.contactOutcome({ kind: "does-not-fit" })).toBe(
      requireLeafAt(messages, "review.refusalReasons.BODIES_PAST_WALL"),
    );
  });

  it("never says 8 digits for an international or unrecognised number", () => {
    for (const code of INTERNATIONAL_CODES) {
      expect(content.contactFieldError(code), code).not.toMatch(/\b8\b/);
    }
  });

  it("tells a number with too many Moldovan digits how to write one from abroad", () => {
    expect(
      content.contactFieldError("PHONE_MOLDOVAN_TOO_MANY_DIGITS"),
    ).toContain("+");
  });

  it("asks for a second look at the design without saying it changed (criterion 13)", () => {
    const sentence = content.contactOutcome({ kind: "design-not-current" });

    expect(sentence).not.toMatch(CHANGED_WORDS[locale]);
  });

  it("holds no code-shaped text in any contact leaf", () => {
    for (const [key, text] of catalogueLeaves(messages.contact)) {
      expect(text, key).not.toMatch(CODE_SHAPE);
    }
  });

  it("draws no response time, no Detalii link and no leaf for either (Q26, Q7 (b))", () => {
    for (const [key, text] of catalogueLeaves(messages.contact)) {
      expect(key, key).not.toMatch(/hint|response|detail|privacy|phoneNumber/i);
      expect(text, key).not.toMatch(NOT_DRAWN_WORDS[locale]);
    }
  });

  it("marks the consent sentence as provisional in its own leaf", () => {
    expect(content.contact.consentProvisionalMarker).not.toBe("");
    expect(content.contact.consentProvisionalMarker).not.toBe(
      content.contact.consent,
    );
  });
});
