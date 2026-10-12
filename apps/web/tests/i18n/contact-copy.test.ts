import { describe, expect, it } from "vitest";

import type {
  ContactChannel,
  ContactFieldCode,
} from "@lemnaria/configurator-domain";

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
  { kind: "unanswered" },
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

const CONTACT_CHANNELS = [
  "phone",
  "whatsapp",
  "email",
] as const satisfies readonly ContactChannel[];

const TYPED_CONTACT = "079 123 456";

/** A saved claim that names the phone, per language: the details are not kept there (Q18 (a)). */
const SAVED_ON_THE_PHONE = {
  ro: /pe (acest )?telefon/i,
  ru: /на (этом )?телефоне/i,
} as const;

/** A promise of when the shop answers, per language (Q8, Q26): no duration and no *soon*. */
const TIME_PROMISE = {
  ro: /.n cur.nd|imediat|\d+\s*(ore|zile|minute)\b/i,
  ru: /скоро|в ближайшее|немедленно|\d+\s*(час|мин|д[её]н|дн)/i,
} as const;

/** What would put an account, a profile or an e-mailed link on a result screen (Q11, Q43), per language. */
const ACCOUNT_OR_EMAILED_LINK = {
  ro: /profil|cont\b|autentific|e[-\u2011]?mail/i,
  ru: /профил|аккаунт|учётн|вход|почт/i,
} as const;

/** The page-open bound of 5B's kept sentences (Q18 (a)), per language. */
const WHILE_THE_PAGE_IS_OPEN = { ro: /pagina/i, ru: /страниц/i } as const;

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
        requireLeafAt(messages, "submissionResult.failureNotSent"),
      );
    },
  );

  it("tells a code this build has no sentence for as the failed sentence", () => {
    const codeFromNewerServer = "A_CODE_FROM_LATER" as ContactFieldCode;

    expect(content.contactFieldError(codeFromNewerServer)).toBe(
      requireLeafAt(messages, "submissionResult.failureNotSent"),
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

describe.each(CATALOGUES)(
  "the %s submission result copy",
  (locale, messages) => {
    const content = contentFor(locale, messages);
    const leaves = catalogueLeaves(messages.submissionResult);

    it.each(CONTACT_CHANNELS)(
      "names the typed value, exactly as typed, in the %s channel line",
      (channel) => {
        const sentence = content.submissionResult.channelLine({
          channel,
          contact: TYPED_CONTACT,
        });

        expect(sentence).toContain(TYPED_CONTACT);
        expect(sentence).not.toContain("{");
      },
    );

    it("gives each channel its own line, and the line with no value its own", () => {
      const lines = [
        ...CONTACT_CHANNELS.map((channel) =>
          content.submissionResult.channelLine({
            channel,
            contact: TYPED_CONTACT,
          }),
        ),
        content.submissionResult.channelLineWithoutValue,
      ];

      expect(new Set(lines).size).toBe(CONTACT_CHANNELS.length + 1);
    });

    it("says the WhatsApp channel by name in the WhatsApp line only", () => {
      const lineOf = (channel: ContactChannel) =>
        content.submissionResult.channelLine({
          channel,
          contact: TYPED_CONTACT,
        });

      expect(lineOf("whatsapp")).toContain("WhatsApp");
      expect(lineOf("phone")).not.toContain("WhatsApp");
      expect(lineOf("email")).not.toContain("WhatsApp");
    });

    it("carries the link in the WhatsApp message", () => {
      const sentence = content.submissionResult.whatsappMessage(
        "https://example.test/s/LINK-TOKEN",
      );

      expect(sentence).toContain("https://example.test/s/LINK-TOKEN");
      expect(sentence).not.toContain("{");
    });

    it("says the design is saved in this browser and never on the phone (criteria 3, 8)", () => {
      expect(content.submissionResult.savedSentence).toMatch(
        locale === "ro" ? /browser/ : /браузер/,
      );
      for (const [key, text] of leaves) {
        expect(text, key).not.toMatch(SAVED_ON_THE_PHONE[locale]);
      }
    });

    it.each(["failureKept", "failureKeptNoDesign", "keptTitle"] as const)(
      "bounds %s by the page being open (criterion 8)",
      (key) => {
        expect(content.submissionResult[key]).toMatch(
          WHILE_THE_PAGE_IS_OPEN[locale],
        );
      },
    );

    it("tells a request with no answer, and one that failed, in their own sentences", () => {
      const unanswered = content.contactOutcome({ kind: "unanswered" });
      const failed = content.contactOutcome({ kind: "failed" });

      expect(unanswered).toBe(content.submissionResult.failureLostConnection);
      expect(failed).toBe(content.submissionResult.failureNotSent);
      expect(unanswered).not.toBe(failed);
    });

    it("draws neither a ✓ nor the sent heading in the no-request and not-shown sentences", () => {
      for (const sentence of [
        content.submissionResult.noRequest,
        content.submissionResult.notShown,
      ]) {
        expect(sentence).not.toContain("✓");
        expect(sentence).not.toContain(content.submissionResult.sentHeading);
        expect(sentence).not.toContain(content.submissionResult.topBarTitle);
      }
      expect(content.submissionResult.noRequest).not.toBe(
        content.submissionResult.notShown,
      );
    });

    it("marks the next steps as provisional in a leaf of their own (Q9)", () => {
      expect(content.submissionResult.nextStepsProvisionalMarker).not.toBe("");
      expect(content.submissionResult.nextStepsProvisionalMarker).not.toBe(
        content.submissionResult.nextStepsTitle,
      );
    });

    it("keeps the price step from naming what the final price includes", () => {
      expect(content.submissionResult.nextStepFinalPrice).not.toMatch(
        locale === "ro"
          ? /blat|feronerie|montaj|inclus/i
          : /столешниц|фурнитур|монтаж|включ/i,
      );
    });

    it("holds no code-shaped text and no three-digit figure in any leaf (criteria 6, 7)", () => {
      for (const [key, text] of leaves) {
        expect(text, key).not.toMatch(CODE_SHAPE);
        expect(text, key).not.toMatch(/\d{3}/);
      }
    });

    it("promises no response time, draws no shop number and links no account or e-mailed link (Q3, Q8, Q11, Q43)", () => {
      for (const [key, text] of leaves) {
        expect(key, key).not.toMatch(
          /callShop|directCall|shop|magazin|response|detail|privacy/i,
        );
        expect(text, key).not.toMatch(TIME_PROMISE[locale]);
        expect(text, key).not.toMatch(NOT_DRAWN_WORDS[locale]);
        expect(text, key).not.toMatch(ACCOUNT_OR_EMAILED_LINK[locale]);
      }
    });
  },
);
