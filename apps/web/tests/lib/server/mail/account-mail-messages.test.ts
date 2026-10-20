import { describe, expect, it } from "vitest";

import {
  AccountMailLinkError,
  accountMailKey,
  buildAccountMail,
  type AccountMailRequest,
} from "@/lib/server/mail/account-mail-messages";
import { readPublicOrigin } from "@/lib/server/public-origin";
import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

// The two mails of an address change (ADR 0172 Amendment H): the notice that a change was asked for, and the notice
// that it went through, which carries the link that undoes it.

const ORIGIN_OUTCOME = readPublicOrigin({
  LEMNARIA_PUBLIC_ORIGIN: "https://lemnaria.example",
});
if (ORIGIN_OUTCOME.status !== "configured") throw new Error("origin refused");
const ORIGIN = ORIGIN_OUTCOME.origin;

const TOKEN = "Zx9_-".repeat(8) + "abc";
const TYPED_ADDRESS = "Typed.Address+tag@Example.test";

function requestedNotice(locale: string, requestedAddress = TYPED_ADDRESS) {
  return buildAccountMail({
    kind: "email-change-requested",
    locale,
    link: { origin: ORIGIN },
    requestedAddress,
  });
}

function undoNotice(locale: string, token = TOKEN) {
  return buildAccountMail({
    kind: "email-changed",
    locale,
    link: { origin: ORIGIN, token },
  });
}

describe("email-change-requested", () => {
  it.each(["ro", "ru"])(
    "names the typed address in the text and the html and links to the password reset page with no token (%s)",
    (locale) => {
      const mail = requestedNotice(locale);

      expect(mail.text).toContain(TYPED_ADDRESS);
      expect(mail.html).toContain(TYPED_ADDRESS);
      expect(mail.text).toContain(
        `${ORIGIN}/${locale}/account/forgot-password\n`,
      );
      expect(mail.text).not.toContain("#");
      expect(mail.html).not.toContain("#t=");
    },
  );

  it.each(["ro", "ru"])(
    "keeps the typed address out of the subject (%s)",
    (locale) => {
      expect(requestedNotice(locale).subject).not.toContain("Typed");
    },
  );

  it("escapes a typed address in the html, so it cannot add markup", () => {
    const mail = requestedNotice("ro", 'a"><b>@example.test');

    expect(mail.html).not.toContain("<b>@example.test");
    expect(mail.html).toContain("&lt;b&gt;@example.test");
  });

  it("carries, in each language, the note that a reset cancels the change and that a second message follows", () => {
    expect(requestedNotice("ro").text).toContain(
      roMessages.accountMail.emailChangeRequested.note,
    );
    expect(requestedNotice("ru").text).toContain(
      ruMessages.accountMail.emailChangeRequested.note,
    );
  });

  it("is a different message in Romanian and in Russian, and falls back to Romanian for a language not served", () => {
    expect(requestedNotice("ru").subject).not.toBe(
      requestedNotice("ro").subject,
    );
    expect(requestedNotice("xx")).toEqual(requestedNotice("ro"));
  });
});

describe("email-changed", () => {
  it.each(["ro", "ru"])(
    "links to the revert page with the token after the hash, in the text and the html (%s)",
    (locale) => {
      const mail = undoNotice(locale);
      const link = `${ORIGIN}/${locale}/account/revert-email#t=${TOKEN}`;

      expect(mail.text).toContain(`${link}\n`);
      expect(mail.html).toContain(`href="${link}"`);
    },
  );

  it("keeps the token out of the subject", () => {
    expect(undoNotice("ro").subject).not.toContain(TOKEN);
  });

  it.each(["short", `${TOKEN}=`, `${TOKEN}.`, ""])(
    "refuses a token that is not the generator's shape: %j",
    (token) => {
      expect(() => undoNotice("ro", token)).toThrow(AccountMailLinkError);
    },
  );

  it("refuses a request with no link at all", () => {
    const withoutLink = {
      kind: "email-changed",
      locale: "ro",
    } as unknown as AccountMailRequest;

    expect(() => buildAccountMail(withoutLink)).toThrow();
  });
});

describe("accountMailKey", () => {
  const HASH = "0123456789abcdef".repeat(4);

  it("keys the undo notice by the first half of the undo row's hash", () => {
    expect(accountMailKey("email-changed", HASH)).toBe(
      "account-mail/email-changed/0123456789abcdef",
    );
  });

  it("gives each request notice a key of its own", () => {
    expect(accountMailKey("email-change-requested")).not.toBe(
      accountMailKey("email-change-requested"),
    );
  });
});
