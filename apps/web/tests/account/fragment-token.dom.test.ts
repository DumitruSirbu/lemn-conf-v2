// @vitest-environment happy-dom
// A token page gets its single-use token from the address fragment and takes the fragment out of the address before
// anything else happens (Lot 1 criterion 4; Lot 2 criterion 22). The confirm-address page then sends the token only when
// the person presses "Confirma": a mail scanner that opens the link confirms nothing.
import { act, createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import {
  takeTokenFromFragment,
  tellRouterTheFragmentIsGone,
  useFragmentToken,
  type FragmentSource,
} from "@/account/fragment-token";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import { flushPromises, renderHook } from "../support/render-hook";
import {
  byWords,
  mountInCatalogue,
  requireIn,
  click,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));

const { ConfirmEmailForm } = await import(
  "@/account/profile/confirm-email-form"
);
const { useConfirmEmail } = await import("@/account/profile/use-confirm-email");

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const PATH = "/ro/account/confirm-email";

let events: string[] = [];
let addressInTest: { hash: string } = { hash: "" };
let replaceState: ReturnType<typeof vi.spyOn>;

/** An address that behaves as the browser's does: replacing it with a path alone takes the fragment out of `hash`. */
function setAddress(hash: string, search = ""): void {
  const address = { hash, pathname: PATH, search, assign: vi.fn() };
  vi.stubGlobal("location", address);
  addressInTest = address;
}

beforeEach(() => {
  events = [];
  sendSignedInRequest.mockReset();
  sendSignedInRequest.mockImplementation((request: SignedInRequest) => {
    events.push(`request:${request.flow}`);
    return Promise.resolve({ kind: "email-changed" } satisfies SignedInOutcome);
  });
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation((_state, _unused, url) => {
      events.push(`replaceState:${String(url)}`);
      addressInTest.hash = "";
    });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("takeTokenFromFragment", () => {
  function sourceAt(
    hash: string,
    search = "",
  ): { source: FragmentSource; replaced: string[] } {
    const replaced: string[] = [];
    return {
      replaced,
      source: {
        location: { hash, pathname: PATH, search },
        history: {
          replaceState: (_state, _unused, url) =>
            void replaced.push(String(url)),
        },
      },
    };
  }

  it("reads exactly the 43-character token after #t= and removes the fragment, keeping path and query", () => {
    const { source, replaced } = sourceAt(`#t=${TOKEN}`, "?a=1");
    expect(takeTokenFromFragment(source)).toEqual({
      kind: "token",
      token: TOKEN,
    });
    expect(replaced).toEqual([`${PATH}?a=1`]);
  });

  it("reads nothing and replaces nothing when there is no fragment", () => {
    const { source, replaced } = sourceAt("");
    expect(takeTokenFromFragment(source)).toEqual({ kind: "none" });
    expect(replaced).toEqual([]);
  });

  it.each([
    ["too short", `#t=${TOKEN.slice(1)}`],
    ["too long", `#t=${TOKEN}x`],
    ["a character outside base64url", `#t=${TOKEN.slice(0, 42)}+`],
    ["a padded token", `#t=${TOKEN.slice(0, 42)}=`],
    ["another name", `#token=${TOKEN}`],
    ["no name", `#${TOKEN}`],
    ["more members", `#t=${TOKEN}&x=1`],
    ["upper-case name", `#T=${TOKEN}`],
    ["a bare #t=", "#t="],
    ["a line break after", `#t=${TOKEN}\n`],
  ])(
    "reads no token from a fragment that is %s, and still removes it: it may be part of one",
    (_, hash) => {
      const { source, replaced } = sourceAt(hash);
      expect(takeTokenFromFragment(source)).toEqual({ kind: "none" });
      expect(replaced).toEqual([PATH]);
    },
  );

  it("tells the router the fragment is gone by replacing the address with itself, without it", () => {
    const { source, replaced } = sourceAt("", "?b=2");
    tellRouterTheFragmentIsGone(source);
    expect(replaced).toEqual([`${PATH}?b=2`]);
  });
});

describe("useFragmentToken", () => {
  it("reads the token into a ref, not into state, and reports it present", () => {
    setAddress(`#t=${TOKEN}`);
    const hook = renderHook(() => useFragmentToken());
    expect(hook.result.current.status).toBe("present");
    expect(hook.result.current.tokenRef.current).toBe(TOKEN);
    expect(
      JSON.stringify({ ...hook.result.current, tokenRef: undefined }),
    ).not.toContain(TOKEN);
    hook.unmount();
  });

  it("removes the fragment from the address at once, and tells the router a second time", () => {
    setAddress(`#t=${TOKEN}`, "?q=1");
    const hook = renderHook(() => useFragmentToken());
    expect(events).toEqual([
      `replaceState:${PATH}?q=1`,
      `replaceState:${PATH}?q=1`,
    ]);
    hook.unmount();
  });

  it("reports absent without touching the address when there was no fragment", () => {
    setAddress("");
    const hook = renderHook(() => useFragmentToken());
    expect(hook.result.current.status).toBe("absent");
    expect(hook.result.current.tokenRef.current).toBeUndefined();
    expect(replaceState).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("reports absent and clears a fragment that is not a token", () => {
    setAddress("#t=junk");
    const hook = renderHook(() => useFragmentToken());
    expect(hook.result.current.status).toBe("absent");
    expect(replaceState).toHaveBeenCalledWith(null, "", PATH);
    hook.unmount();
  });

  it("forgets the token on discard", () => {
    setAddress(`#t=${TOKEN}`);
    const hook = renderHook(() => useFragmentToken());
    act(() => {
      hook.result.current.discard();
    });
    expect(hook.result.current.tokenRef.current).toBeUndefined();
    hook.unmount();
  });

  it("reads the fragment once even when the tree is mounted twice over (strict mode)", () => {
    setAddress(`#t=${TOKEN}`);
    const hook = renderHook(
      () => useFragmentToken(),
      (children) => createElement(StrictMode, null, children),
    );
    expect(hook.result.current.status).toBe("present");
    expect(hook.result.current.tokenRef.current).toBe(TOKEN);
    hook.unmount();
  });
});

describe("the confirm-address page", () => {
  let screen: MountedScreen | undefined;

  afterEach(() => {
    screen?.unmount();
    screen = undefined;
  });

  function mountPage(): MountedScreen {
    screen = mountInCatalogue(
      createElement(ConfirmEmailForm, { locale: "ro" }),
    );
    return screen;
  }

  const confirmButton = (page: MountedScreen) =>
    byWords<HTMLButtonElement>(
      page.container,
      "button",
      roMessages.accountEmailChange.confirm,
    );

  it("takes the fragment out of the address before it sends anything, and never sends on its own", async () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    expect(events[0]).toBe(`replaceState:${PATH}`);
    await flushPromises();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(events.filter((event) => event.startsWith("request:"))).toEqual([]);
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    expect(confirmButton(page).getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps the token out of the page's markup", () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    expect(page.container.innerHTML).not.toContain(TOKEN);
    expect(document.documentElement.outerHTML).not.toContain(TOKEN);
  });

  it("sends the token in the body of one request when the person presses Confirm, and a second press while it is out sends nothing", async () => {
    setAddress(`#t=${TOKEN}`);
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReset();
    sendSignedInRequest.mockReturnValue(
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      }),
    );
    const page = mountPage();
    click(confirmButton(page));
    click(
      byWords(
        page.container,
        "button",
        roMessages.accountEmailChange.confirming,
      ),
    );
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(sendSignedInRequest).toHaveBeenCalledWith({
      flow: "confirm-email",
      body: { token: TOKEN },
    });
    await act(async () => {
      answer({ kind: "email-changed" });
      await Promise.resolve();
    });
    await flushPromises();
    expect(page.container.textContent).toContain(
      roMessages.accountEmailChange.changedTitle,
    );
  });

  it("arrives with no token and shows the invalid-link screen, with no request and no button to press", async () => {
    setAddress("");
    const page = mountPage();
    await flushPromises();
    expect(page.container.textContent).toContain(
      roMessages.accountEmailChange.linkInvalidTitle,
    );
    expect(page.container.querySelector("button[type=submit]")).toBeNull();
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it("treats a malformed fragment as no link, clears it and sends nothing", async () => {
    setAddress("#t=short");
    const page = mountPage();
    await flushPromises();
    expect(replaceState).toHaveBeenCalledWith(null, "", PATH);
    expect(page.container.textContent).toContain(
      roMessages.accountEmailChange.linkInvalidTitle,
    );
    expect(sendSignedInRequest).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a link the server refused",
      { kind: "link-invalid" } as SignedInOutcome,
      roMessages.accountEmailChange.linkInvalidTitle,
    ],
  ])("shows %s and keeps no token to send again", async (_, outcome, title) => {
    setAddress(`#t=${TOKEN}`);
    sendSignedInRequest.mockReset();
    sendSignedInRequest.mockResolvedValue(outcome);
    const page = mountPage();
    click(confirmButton(page));
    await flushPromises();
    expect(page.container.textContent).toContain(title);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "a service that was not there",
      { kind: "unavailable" } as SignedInOutcome,
    ],
    ["no answer at all", { kind: "unanswered" } as SignedInOutcome],
    [
      "a platform failure no word explains",
      { kind: "platform-failed" } as SignedInOutcome,
    ],
    [
      "a limit",
      {
        kind: "rate-limited",
        wait: { kind: "minutes", minutes: 10 },
      } as SignedInOutcome,
    ],
  ])(
    "keeps the token for another press after %s: the server spends it only on a confirmation",
    async (_, outcome) => {
      setAddress(`#t=${TOKEN}`);
      sendSignedInRequest.mockReset();
      sendSignedInRequest.mockResolvedValueOnce(outcome);
      const page = mountPage();
      click(confirmButton(page));
      await flushPromises();
      sendSignedInRequest.mockResolvedValueOnce({ kind: "email-changed" });
      click(
        requireIn<HTMLButtonElement>(page.container, "button[type=submit]"),
      );
      await flushPromises();
      expect(
        sendSignedInRequest.mock.calls.map(
          ([request]) => (request as { body: { token: string } }).body.token,
        ),
      ).toEqual([TOKEN, TOKEN]);
      expect(page.container.textContent).toContain(
        roMessages.accountEmailChange.changedTitle,
      );
    },
  );

  it("does not send again after a confirmation: the token was spent", async () => {
    setAddress(`#t=${TOKEN}`);
    const page = mountPage();
    click(confirmButton(page));
    await flushPromises();
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(page.container.querySelector("button[type=submit]")).toBeNull();
  });

  it("makes no request to any other origin", async () => {
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
});

describe("useConfirmEmail, below the page", () => {
  it("sends nothing from a press when the address held no token", async () => {
    setAddress("");
    const hook = renderHook(() => useConfirmEmail());
    act(() => {
      hook.result.current.submit();
    });
    await flushPromises();
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("sends one request for two presses made before the first is answered", async () => {
    setAddress(`#t=${TOKEN}`);
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReset();
    sendSignedInRequest.mockReturnValue(
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      }),
    );
    const hook = renderHook(() => useConfirmEmail());
    act(() => {
      hook.result.current.submit();
      hook.result.current.submit();
    });
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer({ kind: "email-changed" });
      await Promise.resolve();
    });
    await flushPromises();
    expect(hook.result.current.feedback).toEqual({ kind: "confirmed" });
    hook.unmount();
  });

  it("never sends on its own, however long the page is open", async () => {
    setAddress(`#t=${TOKEN}`);
    vi.useFakeTimers();
    try {
      const hook = renderHook(() => useConfirmEmail());
      await vi.advanceTimersByTimeAsync(60_000);
      expect(hook.result.current.tokenStatus).toBe("present");
      expect(sendSignedInRequest).not.toHaveBeenCalled();
      hook.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
