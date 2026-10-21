// @vitest-environment happy-dom
// Where a finished sign-in goes (Lot 2 C26, plan L14b criterion 1): designs to claim are asked about first, on the page;
// otherwise the open kitchen the person came from, else a client's list of kitchens, else the start of the configurator.
// The role is not in the sign-in answer, so the session is asked, and waited for no longer than four seconds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccountSessionState } from "@/account/session/use-account-session";

const askSessionOnce = vi.hoisted(() => vi.fn());
const assign = vi.hoisted(() => vi.fn());

vi.mock("@/account/session/use-account-session", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/account/session/use-account-session")
  >()),
  askSessionOnce,
}));

const { leaveAfterSignIn, leaveFor, onSignedIn } = await import(
  "@/account/on-signed-in"
);

const DESIGN_PATH = "/ro/d/k00000000000000000001";
const LANDING_WAIT_MS = 4_000;

beforeEach(() => {
  askSessionOnce.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", { assign });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settleLanding(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function answerSessionWith(state: AccountSessionState | undefined): void {
  askSessionOnce.mockResolvedValueOnce(state);
}

describe("onSignedIn: designs to claim are asked about before anything else", () => {
  it.each([1, 2, 50])(
    "asks about %i and leaves nowhere, the way back included",
    async (claimable) => {
      const askToClaim = vi.fn();
      onSignedIn(
        { locale: "ro", returnPath: DESIGN_PATH, claimable },
        askToClaim,
      );
      await settleLanding();
      expect(askToClaim).toHaveBeenCalledExactlyOnceWith(claimable);
      expect(assign).not.toHaveBeenCalled();
      expect(askSessionOnce).not.toHaveBeenCalled();
    },
  );

  it("never asks about nothing: a count of 0 leaves at once", () => {
    const askToClaim = vi.fn();
    onSignedIn(
      { locale: "ro", returnPath: DESIGN_PATH, claimable: 0 },
      askToClaim,
    );
    expect(askToClaim).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledExactlyOnceWith(DESIGN_PATH);
  });
});

describe("leaveAfterSignIn: the way back wins over the role", () => {
  it("goes to the open kitchen at once, without asking who signed in", async () => {
    leaveAfterSignIn({ locale: "ro", returnPath: DESIGN_PATH });
    expect(assign).toHaveBeenCalledExactlyOnceWith(DESIGN_PATH);
    await settleLanding();
    expect(askSessionOnce).not.toHaveBeenCalled();
  });

  it("does so for a staff session too: precedence is the path's, not the role's", async () => {
    answerSessionWith({ kind: "staff", email: "staff@lemnaria.md" });
    leaveAfterSignIn({
      locale: "ru",
      returnPath: "/ru/d/k00000000000000000002",
    });
    await settleLanding();
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      "/ru/d/k00000000000000000002",
    );
  });
});

describe("leaveAfterSignIn without a way back: the session says where", () => {
  it.each([
    ["ro", "/ro/account/kitchens"],
    ["ru", "/ru/account/kitchens"],
  ] as const)(
    "lands a client of the %s site on their kitchens",
    async (locale, expected) => {
      answerSessionWith({ kind: "client", email: "a@example.com" });
      leaveAfterSignIn({ locale, returnPath: undefined });
      expect(assign).not.toHaveBeenCalled();
      await settleLanding();
      expect(assign).toHaveBeenCalledExactlyOnceWith(expected);
    },
  );

  it.each([
    [
      "staff",
      { kind: "staff", email: "staff@lemnaria.md" } as AccountSessionState,
    ],
    ["an anonymous answer", { kind: "anonymous" } as AccountSessionState],
    ["a pending answer", { kind: "pending" } as AccountSessionState],
    ["an answer the server did not give", undefined],
  ])("lands %s on the start of the configurator", async (_, state) => {
    answerSessionWith(state);
    leaveAfterSignIn({ locale: "ru", returnPath: undefined });
    await settleLanding();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/ru");
  });

  it("waits no longer than four seconds for a session that never answers, then lands on the start", async () => {
    askSessionOnce.mockReturnValueOnce(new Promise(() => undefined));
    leaveAfterSignIn({ locale: "ro", returnPath: undefined });
    await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
    expect(assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(assign).toHaveBeenCalledExactlyOnceWith("/ro");
  });

  it("goes where a client's late answer says if it arrives inside the limit, and stops the clock", async () => {
    let resolveSession: (state: AccountSessionState) => void = () => undefined;
    askSessionOnce.mockReturnValueOnce(
      new Promise<AccountSessionState>((resolve) => {
        resolveSession = resolve;
      }),
    );
    leaveAfterSignIn({ locale: "ro", returnPath: undefined });
    await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 1);
    resolveSession({ kind: "client", email: "a@example.com" });
    await settleLanding();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/ro/account/kitchens");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS * 2);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("leaves once even when the answer arrives after the limit has already sent the person to the start", async () => {
    let resolveSession: (state: AccountSessionState) => void = () => undefined;
    askSessionOnce.mockReturnValueOnce(
      new Promise<AccountSessionState>((resolve) => {
        resolveSession = resolve;
      }),
    );
    leaveAfterSignIn({ locale: "ro", returnPath: undefined });
    await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS);
    resolveSession({ kind: "client", email: "a@example.com" });
    await settleLanding();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/ro");
  });
});

describe("leaveFor", () => {
  it("is a document load, never a router action", () => {
    leaveFor("/ro/account/login?reason=session-expired");
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });
});
