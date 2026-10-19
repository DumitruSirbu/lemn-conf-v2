// @vitest-environment happy-dom
// "Schimba parola" (Lot 2 frames A11A to A11G; criterion 8): the current password and the new one. Where each answer is
// placed matters: a wrong current password is said beside the current field, a refusal of the new one beside the new
// one, and a person whose session is refused after a request that may have been carried out is not told it expired.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import { firstArgumentsOf } from "../support/mock-calls";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());
const leaveFor = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor,
}));

const { ChangePasswordForm } = await import(
  "@/account/profile/change-password-form"
);

const copy = roMessages.accountPassword;
const errors = roMessages.accountFieldErrors;
const CURRENT = "the current one";
const FRESH = "a brand new passphrase";

let screen: MountedScreen | undefined;
let answers: SignedInOutcome[];

beforeEach(() => {
  sendSignedInRequest.mockReset();
  leaveFor.mockReset();
  answers = [];
  sendSignedInRequest.mockImplementation(() =>
    Promise.resolve(answers.shift() ?? { kind: "password-changed" }),
  );
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

function mountForm(): MountedScreen {
  screen = mountInCatalogue(
    createElement(ChangePasswordForm, { locale: "ro" }),
  );
  return screen;
}

const current = (page: MountedScreen): HTMLInputElement =>
  requireIn<HTMLInputElement>(page.container, "input[name=currentPassword]");
const fresh = (page: MountedScreen): HTMLInputElement =>
  requireIn<HTMLInputElement>(page.container, "input[name=newPassword]");

function fillBoth(
  page: MountedScreen,
  currentValue = CURRENT,
  freshValue = FRESH,
): void {
  typeInto(current(page), currentValue);
  typeInto(fresh(page), freshValue);
}

async function submit(page: MountedScreen): Promise<void> {
  submitFormIn(page.container);
  await flushPromises(5);
}

const bodies = (): unknown[] =>
  firstArgumentsOf<SignedInRequest>(sendSignedInRequest).map((request) =>
    request.flow === "password" ? request.body : request,
  );
const errorOf = (input: HTMLInputElement): string => {
  const id = input.getAttribute("aria-describedby")?.split(" ")[0] ?? "";
  return document.getElementById(id)?.textContent ?? "";
};

describe("the form", () => {
  it("has two password fields and no 'repeat the password', and opens on the current one", () => {
    const page = mountForm();
    expect(current(page).type).toBe("password");
    expect(fresh(page).type).toBe("password");
    expect(allIn(page.container, "input")).toHaveLength(2);
    expect(document.activeElement).toBe(current(page));
    expect(current(page).autocomplete).toBe("current-password");
    expect(fresh(page).autocomplete).toBe("new-password");
  });

  it("counts the new password's characters live while it is shorter than the rule asks, and stops counting at the minimum", () => {
    const page = mountForm();
    typeInto(fresh(page), "abc");
    expect(page.container.textContent).toContain("3 / 12");
    typeInto(fresh(page), "abcdefghijkl");
    expect(page.container.textContent).not.toContain("/ 12");
    typeInto(fresh(page), "");
    expect(page.container.textContent).not.toContain("/ 12");
  });
});

describe("what is refused without asking the server", () => {
  it("sends nothing for two empty fields and summarises both in a notice that takes focus", async () => {
    const page = mountForm();
    await submit(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(errorOf(current(page))).toContain(errors.passwordRequired);
    expect(errorOf(fresh(page))).toContain(errors.passwordRequired);
    expect(document.activeElement).toBe(
      requireIn(page.container, "[role=alert]"),
    );
  });

  it("sends nothing for a new password shorter than the rule, beside the new field, with focus on it", async () => {
    const page = mountForm();
    typeInto(current(page), CURRENT);
    typeInto(fresh(page), "short");
    await submit(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(errorOf(fresh(page))).toContain(
      errors.passwordTooShort.replace("{min, number}", "12"),
    );
    expect(current(page).getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(fresh(page));
  });

  it("asks only for the current password when that alone is missing", async () => {
    const page = mountForm();
    typeInto(fresh(page), FRESH);
    await submit(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(errorOf(current(page))).toContain(errors.passwordRequired);
    expect(fresh(page).getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(current(page));
  });

  it("does not judge the current password's length: the server treats an odd one as a wrong password", async () => {
    const page = mountForm();
    fillBoth(page, "x");
    await submit(page);
    expect(bodies()).toEqual([{ currentPassword: "x", newPassword: FRESH }]);
  });

  it("does not refuse a new password for being the e-mail: the address is not known on this page", async () => {
    const page = mountForm();
    fillBoth(page, CURRENT, "someone@example.com");
    await submit(page);
    expect(bodies()).toHaveLength(1);
  });
});

describe("where the server's answers are placed", () => {
  it("says a wrong current password beside the current field, with focus on it, and keeps both values", async () => {
    answers = [{ kind: "wrong-password" }];
    const page = mountForm();
    fillBoth(page);
    fresh(page).focus();
    await submit(page);
    expect(errorOf(current(page))).toContain(copy.currentPasswordWrong);
    expect(current(page).getAttribute("aria-invalid")).toBe("true");
    expect(fresh(page).getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(current(page));
    expect(current(page).value).toBe(CURRENT);
    expect(fresh(page).value).toBe(FRESH);
    expect(page.container.querySelector("[role=alert]:not([id])")).toBeNull();
  });

  it("takes the wrong-password sentence back when the current field is edited, but not when the new one is", async () => {
    answers = [{ kind: "wrong-password" }];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    typeInto(fresh(page), `${FRESH}!`);
    expect(current(page).getAttribute("aria-invalid")).toBe("true");
    typeInto(current(page), `${CURRENT}!`);
    expect(current(page).getAttribute("aria-invalid")).toBeNull();
  });

  it("places the server's refusal of the new password beside the new field", async () => {
    answers = [
      {
        kind: "invalid-input",
        issues: [{ field: "newPassword", code: "PASSWORD_BREACHED" }],
      },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(errorOf(fresh(page))).toContain(errors.passwordBreached);
    expect(current(page).getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(fresh(page));
  });

  it("places a refusal of the current password's shape beside the current field", async () => {
    answers = [
      {
        kind: "invalid-input",
        issues: [{ field: "currentPassword", code: "PASSWORD_REQUIRED" }],
      },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(errorOf(current(page))).toContain(errors.passwordRequired);
  });
});

describe("a change that is made", () => {
  it("sends both passwords in one request and replaces the form with the success, which says the other devices are signed out", async () => {
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(bodies()).toEqual([
      { currentPassword: CURRENT, newPassword: FRESH },
    ]);
    expect(page.container.querySelector("form")).toBeNull();
    expect(page.container.textContent).toContain(copy.changedTitle);
    expect(page.container.textContent).toContain(copy.changedBody);
    expect(byLink(page, "/ro/account/profile")).toBe(copy.backToProfile);
    expect(document.activeElement?.textContent).toBe(copy.changedTitle);
  });

  it("holds neither password anywhere in the page afterwards", async () => {
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(document.body.innerHTML).not.toContain(CURRENT);
    expect(document.body.innerHTML).not.toContain(FRESH);
  });

  it("tells a change whose new session could not be started as made, and asks the person to sign in again", async () => {
    answers = [{ kind: "password-changed-sign-in" }];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(page.container.textContent).toContain(copy.changedTitle);
    expect(page.container.textContent).toContain(copy.changedSignInBody);
    expect(page.container.textContent).not.toContain(copy.changedBody);
    expect(byLink(page, "/ro/account/login")).toBe(copy.logIn);
    expect(leaveFor).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain(FRESH);
  });

  function byLink(page: MountedScreen, href: string): string | undefined {
    return allIn<HTMLAnchorElement>(page.container, "main a")
      .find((anchor) => anchor.getAttribute("href") === href)
      ?.textContent.trim();
  }
});

describe("a session that is refused", () => {
  it("sends a person whose session ended, with nothing in doubt, to sign in as expired", async () => {
    answers = [{ kind: "unauthenticated" }];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });

  it("does not tell a person it expired when an earlier request got no answer: it may have been carried out", async () => {
    answers = [{ kind: "unanswered" }, { kind: "unauthenticated" }];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.offlineTitle,
    );
    await submit(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=password-maybe-changed",
    );
  });

  it("keeps the doubt through an outage and a platform failure, which prove nothing", async () => {
    answers = [
      { kind: "unanswered" },
      { kind: "unavailable" },
      { kind: "request-failed" },
      { kind: "unauthenticated" },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    await submit(page);
    await submit(page);
    await submit(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=password-maybe-changed",
    );
  });

  it("settles the doubt when a live session answers: a later refusal is an expiry again", async () => {
    answers = [
      { kind: "unanswered" },
      { kind: "wrong-password" },
      { kind: "unauthenticated" },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    await submit(page);
    await submit(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });

  it("settles the doubt for a refused field and for a limit too", async () => {
    answers = [
      { kind: "unanswered" },
      { kind: "rate-limited", wait: { kind: "minutes", minutes: 5 } },
      { kind: "unauthenticated" },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    await submit(page);
    await submit(page);
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });

  it("draws the forbidden page for a 403: the session is live, so it never reads as an expiry", async () => {
    answers = [{ kind: "forbidden" }];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(page.container.querySelector("form")).toBeNull();
    expect(page.container.textContent).toContain(
      roMessages.accountForbidden.title,
    );
    expect(leaveFor).not.toHaveBeenCalled();
  });
});

describe("answers that leave the form as it was", () => {
  it.each([
    [
      "a service that was not there",
      { kind: "unavailable" } as SignedInOutcome,
      roMessages.accountForm.unavailableTitle,
    ],
    [
      "no answer at all",
      { kind: "unanswered" } as SignedInOutcome,
      roMessages.accountForm.offlineTitle,
    ],
    [
      "a server error no word explains",
      { kind: "platform-failed" } as SignedInOutcome,
      roMessages.accountForm.offlineTitle,
    ],
    [
      "a refused request",
      { kind: "request-failed" } as SignedInOutcome,
      roMessages.accountForm.requestFailedTitle,
    ],
  ])(
    "keeps what was typed after %s, so a retry sends it again",
    async (_, outcome, title) => {
      answers = [outcome];
      const page = mountForm();
      fillBoth(page);
      await submit(page);
      expect(page.container.textContent).toContain(title);
      expect(current(page).value).toBe(CURRENT);
      expect(fresh(page).value).toBe(FRESH);
      await submit(page);
      expect(bodies()).toEqual([
        { currentPassword: CURRENT, newPassword: FRESH },
        { currentPassword: CURRENT, newPassword: FRESH },
      ]);
    },
  );

  it("does not send a second request while the first is out", async () => {
    let resolveChange: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReturnValueOnce(
      new Promise<SignedInOutcome>((resolve) => {
        resolveChange = resolve;
      }),
    );
    const page = mountForm();
    fillBoth(page);
    submitFormIn(page.container);
    submitFormIn(page.container);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    resolveChange({ kind: "wrong-password" });
    await flushPromises(5);
  });

  it("tells a limit with the wait, beside nothing else", async () => {
    answers = [
      { kind: "rate-limited", wait: { kind: "minutes", minutes: 12 } },
    ];
    const page = mountForm();
    fillBoth(page);
    await submit(page);
    expect(page.container.textContent).toContain("12 min");
    expect(current(page).getAttribute("aria-invalid")).toBeNull();
  });
});
