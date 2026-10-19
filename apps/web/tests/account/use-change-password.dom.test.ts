// @vitest-environment happy-dom
// What the password-change page remembers (Lot 2 criterion 8): both passwords live in memory and nowhere else, and neither
// is kept once the change is made, since the form is gone and nothing should hold them. Every other answer keeps what was
// typed, since the person has only to mend or retry.
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";

import { flushPromises, renderHook } from "../support/render-hook";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor: vi.fn(),
}));

const { useChangePassword } = await import(
  "@/account/profile/use-change-password"
);

const CURRENT = "the current one";
const FRESH = "a brand new passphrase";

beforeEach(() => {
  sendSignedInRequest.mockReset();
});

async function submitWith(outcome: SignedInOutcome) {
  sendSignedInRequest.mockResolvedValueOnce(outcome);
  const hook = renderHook(() => useChangePassword("ro"));
  act(() => {
    hook.result.current.editField("currentPassword", CURRENT);
    hook.result.current.editField("newPassword", FRESH);
  });
  act(() => {
    hook.result.current.submit();
  });
  await flushPromises(5);
  return hook;
}

describe("what is kept after an answer", () => {
  it.each([
    ["a change that is made", { kind: "password-changed" } as SignedInOutcome],
    [
      "a change whose new session could not start",
      { kind: "password-changed-sign-in" } as SignedInOutcome,
    ],
  ])("empties both passwords after %s", async (_, outcome) => {
    const hook = await submitWith(outcome);
    expect(hook.result.current.values).toEqual({
      currentPassword: "",
      newPassword: "",
    });
    hook.unmount();
  });

  it.each([
    ["a wrong current password", { kind: "wrong-password" } as SignedInOutcome],
    [
      "a service that was not there",
      { kind: "unavailable" } as SignedInOutcome,
    ],
    ["no answer", { kind: "unanswered" } as SignedInOutcome],
    ["a refused request", { kind: "request-failed" } as SignedInOutcome],
    [
      "a limit",
      {
        kind: "rate-limited",
        wait: { kind: "minutes", minutes: 3 },
      } as SignedInOutcome,
    ],
  ])("keeps both passwords after %s", async (_, outcome) => {
    const hook = await submitWith(outcome);
    expect(hook.result.current.values).toEqual({
      currentPassword: CURRENT,
      newPassword: FRESH,
    });
    hook.unmount();
  });
});
