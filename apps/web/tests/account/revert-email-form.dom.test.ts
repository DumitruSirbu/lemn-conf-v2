// @vitest-environment happy-dom
// The undo page of an address change (Lot 2 plan 14.3.3 and R-13; Lot 1 criteria 4 and 15). The notice to the old
// address links here with a token in the fragment. The page takes the token out of the address at once, asks for a new
// password (whoever moved the account knows the old one) and sends both only when the person presses the button.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { firstArgumentsOf } from "../support/mock-calls";
import { flushPromises, renderHook } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));

const { RevertEmailForm } = await import("@/account/profile/revert-email-form");
const { useRevertEmail } = await import("@/account/profile/use-revert-email");

const copy = roMessages.accountRevertEmail;
const kit = roMessages.accountForm;
const errors = roMessages.accountFieldErrors;
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const PATH = "/ro/account/revert-email";
const FRESH_PASSWORD = "a brand new passphrase";
const NOW_MS = Date.UTC(2026, 9, 20, 10, 0, 0);

let events: string[] = [];
let screen: MountedScreen | undefined;
let addressInTest: { hash: string } = { hash: "" };
let replaceState: ReturnType<typeof vi.spyOn>;

/** An address that behaves as the browser's does: replacing it with a path alone takes the fragment out of `hash`. */
function setAddress(hash: string): void {
  const address = { hash, pathname: PATH, search: "", assign: vi.fn() };
  vi.stubGlobal("location", address);
  addressInTest = address;
}

beforeEach(() => {
  events = [];
  sendSignedInRequest.mockReset();
  sendSignedInRequest.mockImplementation((request: SignedInRequest) => {
    events.push(`request:${request.flow}`);
    return Promise.resolve({
      kind: "email-reverted",
    } satisfies SignedInOutcome);
  });
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((_state, _unused, url) => {
      events.push(`replaceState:${String(url)}`);
      addressInTest.hash = "";
    });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function mountPage(locale: TestLocale = "ro"): MountedScreen {
  screen = mountInCatalogue(createElement(RevertEmailForm, { locale }), locale);
  return screen;
}

const passwordInput = (page: MountedScreen): HTMLInputElement =>
  requireIn<HTMLInputElement>(page.container, "input[name=newPassword]");
const submitButton = (page: MountedScreen): HTMLButtonElement =>
  requireIn<HTMLButtonElement>(page.container, "button[type=submit]");
const linkTo = (page: MountedScreen, words: string): HTMLAnchorElement =>
  byWords<HTMLAnchorElement>(page.container, "a", words);

async function press(page: MountedScreen): Promise<void> {
  submitFormIn(page.container);
  await flushPromises(5);
}

async function pressWith(
  page: MountedScreen,
  password = FRESH_PASSWORD,
): Promise<void> {
  typeInto(passwordInput(page), password);
  await press(page);
}

const requests = (): SignedInRequest[] =>
  firstArgumentsOf<SignedInRequest>(sendSignedInRequest);
const tokensSent = (): unknown[] =>
  requests().map((request) =>
    request.flow === "revert-email" ? request.body.token : request,
  );

describe("the form that is ready", () => {
  it("asks for one new password, never shown in plain text until the person shows it, and starts on it", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    expect(allIn(page.container, "input")).toHaveLength(1);
    expect(passwordInput(page).type).toBe("password");
    expect(passwordInput(page).autocomplete).toBe("new-password");
    expect(document.activeElement).toBe(passwordInput(page));
    expect(page.container.textContent).toContain(copy.title);
    expect(submitButton(page).textContent).toContain(copy.submit);
    expect(submitButton(page).getAttribute("aria-disabled")).toBeNull();
  });

  it("warns, before the field, not to reuse the old password", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    expect(page.container.textContent).toContain(copy.lead);
    expect(copy.lead).toMatch(/nu o refolosi pe cea veche/);
  });

  it("shows and hides the password with the toggle every account password field has", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    click(byWords(page.container, "button", kit.showPasswordName));
    expect(passwordInput(page).type).toBe("text");
    click(byWords(page.container, "button", kit.hidePasswordName));
    expect(passwordInput(page).type).toBe("password");
  });

  it("counts the password's characters live while it is shorter than the rule asks, and stops at the minimum", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    typeInto(passwordInput(page), "abc");
    expect(page.container.textContent).toContain("3 / 12");
    typeInto(passwordInput(page), "abcdefghijkl");
    expect(page.container.textContent).not.toContain("/ 12");
  });

  it("reads in Russian from the Russian catalogue", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage("ru");
    expect(page.container.textContent).toContain(
      ruMessages.accountRevertEmail.title,
    );
    expect(page.container.textContent).toContain(
      ruMessages.accountRevertEmail.lead,
    );
  });
});

describe("the token in the address", () => {
  it("is taken out of the address before anything is sent, twice, and never sent on its own", async () => {
    setAddress(`#t=${TOKEN}`);
    mountPage();
    expect(events).toEqual([`replaceState:${PATH}`, `replaceState:${PATH}`]);
    await flushPromises();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(addressInTest.hash).toBe("");
  });

  it("is kept out of the page's markup", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    expect(page.container.innerHTML).not.toContain(TOKEN);
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  });

  it("is read once even when React mounts the tree twice over", () => {
    setAddress(`#t=${TOKEN}`);
    screen = mountInCatalogue(
      createElement(
        StrictMode,
        null,
        createElement(RevertEmailForm, { locale: "ro" }),
      ),
    );
    expect(screen.container.textContent).toContain(copy.title);
    expect(screen.container.textContent).not.toContain(copy.linkInvalidTitle);
  });

  it("is sent in the body of exactly one request, with the new password, and nowhere else", async () => {
    setAddress(`#t=${TOKEN}`);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const page = mountPage();
    await pressWith(page);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(requests()[0]).toEqual({
      flow: "revert-email",
      body: { token: TOKEN, newPassword: FRESH_PASSWORD },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  });

  it.each([
    ["missing", ""],
    ["empty", "#t="],
    ["42 characters", `#t=${TOKEN.slice(1)}`],
    ["44 characters", `#t=${TOKEN}x`],
    ["outside the alphabet", `#t=${TOKEN.slice(0, 42)}+`],
  ])("is %s: the invalid-link screen, no form, no request", async (_, hash) => {
    setAddress(hash);
    const page = mountPage();
    await flushPromises();
    expect(page.container.textContent).toContain(copy.linkInvalidTitle);
    expect(page.container.querySelector("form")).toBeNull();
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    if (hash !== "") expect(replaceState).toHaveBeenCalledWith(null, "", PATH);
  });
});

describe("a press with the token held", () => {
  it("refuses an empty password beside the field with no request, and keeps the link", async () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    await press(page);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(page.container.textContent).toContain(errors.passwordRequired);
    expect(passwordInput(page).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(passwordInput(page));
  });

  it("refuses a password shorter than the rule with no request", async () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    await pressWith(page, "short");
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(page.container.textContent).toContain(
      errors.passwordTooShort.replace("{min, number}", "12"),
    );
  });

  it("is busy while the request is out, and a second press sends nothing", async () => {
    setAddress(`#t=${TOKEN}`);
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReset();
    sendSignedInRequest.mockReturnValue(
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      }),
    );
    const page = mountPage();
    typeInto(passwordInput(page), FRESH_PASSWORD);
    submitFormIn(page.container);
    submitFormIn(page.container);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(page.container.textContent).toContain(copy.submitting);
    expect(submitButton(page).getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      answer({ kind: "email-reverted" });
      await Promise.resolve();
    });
    await flushPromises();
    expect(page.container.textContent).toContain(copy.doneTitle);
  });
});

describe("the restored screen", () => {
  it("says the address is back and every session ended, and offers a full-load link to sign in", async () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    await pressWith(page);
    expect(page.container.textContent).toContain(copy.doneTitle);
    expect(page.container.textContent).toContain(copy.doneBody);
    expect(copy.doneBody).toMatch(/adresa veche/);
    expect(copy.doneBody).toMatch(/deconectat de pe toate dispozitivele/);
    expect(linkTo(page, copy.logIn).getAttribute("href")).toBe(
      "/ro/account/login",
    );
    expect(page.container.querySelector("form")).toBeNull();
    expect(page.container.textContent).not.toContain(FRESH_PASSWORD);
    expect(document.activeElement?.textContent).toBe(copy.doneTitle);
  });
});

describe("the invalid-link screen", () => {
  it("answers a link the server refused, with a way to sign in and no new link to ask for", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValue({ kind: "link-invalid" });
    const page = mountPage();
    await pressWith(page);
    expect(page.container.textContent).toContain(copy.linkInvalidTitle);
    expect(page.container.textContent).toContain(copy.linkInvalidBody);
    expect(linkTo(page, copy.logIn).getAttribute("href")).toBe(
      "/ro/account/login",
    );
    expect(
      allIn<HTMLAnchorElement>(page.container, "a").map((anchor) =>
        anchor.getAttribute("href"),
      ),
    ).not.toContain("/ro/account/forgot-password");
    expect(page.container.querySelector("form")).toBeNull();
  });

  it("is the same screen for an address with no token as for a refused link", async () => {
    setAddress("");
    const absent = mountPage();
    await flushPromises();
    const absentText = absent.container.textContent;
    absent.unmount();
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValue({ kind: "link-invalid" });
    const refused = mountPage();
    await pressWith(refused);
    expect(refused.container.textContent).toBe(absentText);
  });
});

describe("a limit (429)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  it("counts the wait down live in the notice, holds the button until it is over, then lets the same token go again", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "rate-limited",
      wait: { kind: "countdown", seconds: 30 },
    });
    const page = mountPage();
    await pressWith(page);
    const notice = requireIn(page.container, "[role=status]");
    expect(notice.textContent).toContain("0:30");
    expect(submitButton(page).getAttribute("aria-disabled")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(12_000);
    });
    expect(requireIn(page.container, "[role=status]").textContent).toContain(
      "0:18",
    );
    expect(submitButton(page).getAttribute("aria-disabled")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(page.container.textContent).toContain(kit.rateLimitedReady);
    expect(submitButton(page).getAttribute("aria-disabled")).toBeNull();
    submitFormIn(page.container);
    await flushPromises(5);
    expect(tokensSent()).toEqual([TOKEN, TOKEN]);
    expect(page.container.textContent).toContain(copy.doneTitle);
  });

  it("states a long wait as minutes, with no clock running", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "rate-limited",
      wait: { kind: "minutes", minutes: 20 },
    });
    const page = mountPage();
    await pressWith(page);
    expect(page.container.textContent).toContain("20 min");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("an answer a retry can mend keeps the token", () => {
  it.each([
    [
      "a service that was not there (503)",
      { kind: "unavailable" },
      kit.unavailableTitle,
    ],
    ["no answer at all", { kind: "unanswered" }, kit.offlineTitle],
    [
      "a platform failure no word explains",
      { kind: "platform-failed" },
      kit.offlineTitle,
    ],
  ] as const)(
    "%s: the form stays with what was typed, and the same button sends the same token again",
    async (_, outcome, noticeTitle) => {
      setAddress(`#t=${TOKEN}`);
      sendSignedInRequest.mockResolvedValueOnce(outcome);
      const page = mountPage();
      await pressWith(page);
      expect(page.container.textContent).toContain(noticeTitle);
      expect(passwordInput(page).value).toBe(FRESH_PASSWORD);
      expect(submitButton(page).textContent).toContain(kit.retry);
      expect(document.activeElement?.getAttribute("role")).toBe("alert");
      await press(page);
      expect(requests()).toEqual([
        {
          flow: "revert-email",
          body: { token: TOKEN, newPassword: FRESH_PASSWORD },
        },
        {
          flow: "revert-email",
          body: { token: TOKEN, newPassword: FRESH_PASSWORD },
        },
      ]);
      expect(page.container.textContent).toContain(copy.doneTitle);
    },
  );

  it("a refused password is said beside the field, keeps the token, and the corrected password goes with the same token", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_BREACHED" }],
    });
    const page = mountPage();
    await pressWith(page, "password1234567");
    expect(page.container.textContent).toContain(errors.passwordBreached);
    expect(document.activeElement).toBe(passwordInput(page));
    expect(page.container.textContent).not.toContain(copy.linkInvalidTitle);
    await pressWith(page, FRESH_PASSWORD);
    expect(tokensSent()).toEqual([TOKEN, TOKEN]);
    expect(page.container.textContent).toContain(copy.doneTitle);
  });
});

describe("the password the account holds now", () => {
  it("is refused in the page's own words beside the field, not in the generic request-failed sentence, and the token is kept", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_UNCHANGED" }],
    });
    const page = mountPage();
    await pressWith(page, "password1234567");
    expect(page.container.textContent).toContain(copy.passwordUnchanged);
    expect(page.container.textContent).not.toContain(
      roMessages.accountForm.requestFailedBody,
    );
    expect(document.activeElement).toBe(passwordInput(page));
    expect(page.container.textContent).not.toContain(copy.linkInvalidTitle);
    await pressWith(page, FRESH_PASSWORD);
    expect(tokensSent()).toEqual([TOKEN, TOKEN]);
    expect(page.container.textContent).toContain(copy.doneTitle);
  });

  it("is said in Russian from the Russian catalogue's own leaf", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "invalid-input",
      issues: [{ field: "newPassword", code: "PASSWORD_UNCHANGED" }],
    });
    const page = mountPage("ru");
    await pressWith(page, "password1234567");
    expect(ruMessages.accountRevertEmail.passwordUnchanged).not.toBe(
      copy.passwordUnchanged,
    );
    expect(page.container.textContent).toContain(
      ruMessages.accountRevertEmail.passwordUnchanged,
    );
  });
});

describe("a refusal no retry mends", () => {
  it("replaces the form with the token-page failure screen, which offers no reload, and sends no more", async () => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockResolvedValue({ kind: "request-failed" });
    const page = mountPage();
    await pressWith(page);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.requestFailedTitle,
    );
    expect(page.container.textContent).toContain(
      roMessages.accountForm.requestFailedTokenBody,
    );
    expect(page.container.querySelector("form")).toBeNull();
    expect(
      allIn(page.container, "button").map((button) => button.textContent),
    ).not.toContain(kit.reloadPage);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
  });
});

describe("what the page loads and what it may call", () => {
  it("draws no script, frame, image or style link, and makes no request of its own", async () => {
    setAddress(`#t=${TOKEN}`);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const page = mountPage();
    await flushPromises();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      page.container.querySelector("script, iframe, img, link[rel=stylesheet]"),
    ).toBeNull();
  });

  it.each([
    ["the form", `#t=${TOKEN}`],
    ["the invalid-link screen", ""],
  ])(
    "draws no language chip on %s: the other language's document would have no token to read",
    async (_, hash) => {
      setAddress(hash);
      const page = mountPage();
      await flushPromises();
      expect(
        page.container.querySelector(
          `[aria-label="${roMessages.accountShell.localeMenu}"]`,
        ),
      ).toBeNull();
      expect(page.container.querySelector("a[lang]")).toBeNull();
      expect(
        allIn<HTMLAnchorElement>(page.container, "a").map((anchor) =>
          anchor.getAttribute("href"),
        ),
      ).not.toContain("/ru/account/revert-email");
    },
  );

  it.each(["use-revert-email.ts", "revert-email-form.tsx"])(
    "%s makes no router action and keeps nothing in storage (Lot 1 criterion 15)",
    (file) => {
      const source = readFileSync(
        join(import.meta.dirname, "../../src/account/profile", file),
        "utf8",
      );
      expect(source).not.toMatch(
        /next\/navigation|next\/link|@\/i18n\/navigation|useRouter|document\.cookie|localStorage|sessionStorage/,
      );
    },
  );
});

describe("useRevertEmail, below the page", () => {
  it.each([
    ["a revert", { kind: "email-reverted" }],
    ["a link the server refused", { kind: "link-invalid" }],
    ["a refusal no retry mends", { kind: "request-failed" }],
  ] as const)(
    "sends no second request after %s: the token was spent",
    async (_, outcome) => {
      setAddress(`#t=${TOKEN}`);
      sendSignedInRequest.mockResolvedValue(outcome);
      const hook = renderHook(() => useRevertEmail());
      act(() => {
        hook.result.current.editPassword(FRESH_PASSWORD);
      });
      act(() => {
        hook.result.current.submit();
      });
      await flushPromises();
      act(() => {
        hook.result.current.submit();
      });
      await flushPromises();
      expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
      hook.unmount();
    },
  );

  it("sends nothing from a press when the address held no token", async () => {
    setAddress("");
    const hook = renderHook(() => useRevertEmail());
    act(() => {
      hook.result.current.editPassword(FRESH_PASSWORD);
    });
    act(() => {
      hook.result.current.submit();
    });
    await flushPromises();
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("never sends on its own, however long the page is open", async () => {
    setAddress(`#t=${TOKEN}`);
    vi.useFakeTimers();
    const hook = renderHook(() => useRevertEmail());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(hook.result.current.tokenStatus).toBe("present");
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    hook.unmount();
  });
});
