// @vitest-environment happy-dom
// The undo page takes its token from the address fragment and from nowhere else (Lot 1 criterion 4, R-13). A token in
// the query string would travel in the request line, the server log and a Referer, so a page that honoured it would
// undo the very protection the fragment gives. These cases put a perfectly good token everywhere but the fragment.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import { firstArgumentsOf } from "../support/mock-calls";
import { flushPromises } from "../support/render-hook";
import {
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));

const { RevertEmailForm } = await import("@/account/profile/revert-email-form");

const copy = roMessages.accountRevertEmail;
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const OTHER_TOKEN = "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-_ZYXWV";
const PATH = "/ro/account/revert-email";
const FRESH_PASSWORD = "a brand new passphrase";

let screen: MountedScreen | undefined;
let replaceState: ReturnType<typeof vi.spyOn>;
let address: { hash: string; pathname: string; search: string };

function setAddress(hash: string, search: string): void {
  address = { hash, pathname: PATH, search };
  vi.stubGlobal("location", { ...address, assign: vi.fn() });
}

beforeEach(() => {
  sendSignedInRequest.mockReset();
  sendSignedInRequest.mockResolvedValue({
    kind: "email-reverted",
  } satisfies SignedInOutcome);
  replaceState = vi
    .spyOn(window.history, "replaceState")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const requests = (): SignedInRequest[] =>
  firstArgumentsOf<SignedInRequest>(sendSignedInRequest);

describe("a token that is not in the fragment", () => {
  it.each([
    ["the query as t", "", `?t=${TOKEN}`],
    ["the query as token", "", `?token=${TOKEN}`],
    ["the query with a fragment that has no token", "#", `?t=${TOKEN}`],
    ["the query beside a malformed fragment", "#t=short", `?t=${TOKEN}`],
    ["a query written inside the fragment", `#?t=${TOKEN}`, ""],
    ["the fragment without its t=", `#${TOKEN}`, ""],
    ["another key in the fragment", `#token=${TOKEN}`, ""],
    ["the fragment followed by more", `#t=${TOKEN}&x=1`, ""],
    ["the fragment after another pair", `#x=1&t=${TOKEN}`, ""],
    ["the fragment with a leading space", `# t=${TOKEN}`, ""],
  ])(
    "is not read from %s: the invalid-link screen, no form, no request",
    async (_label, hash, search) => {
      setAddress(hash, search);

      screen = mountInCatalogue(
        createElement(RevertEmailForm, { locale: "ro" }),
      );
      await flushPromises();

      expect(screen.container.textContent).toContain(copy.linkInvalidTitle);
      expect(screen.container.querySelector("form")).toBeNull();
      expect(screen.container.querySelector("input")).toBeNull();
      expect(sendSignedInRequest).not.toHaveBeenCalled();
    },
  );

  it("sends the fragment's token and never the query's when both are present", async () => {
    setAddress(`#t=${TOKEN}`, `?t=${OTHER_TOKEN}`);
    screen = mountInCatalogue(createElement(RevertEmailForm, { locale: "ro" }));

    typeInto(
      requireIn<HTMLInputElement>(screen.container, "input[name=newPassword]"),
      FRESH_PASSWORD,
    );
    submitFormIn(screen.container);
    await flushPromises(5);

    expect(requests()).toEqual([
      {
        flow: "revert-email",
        body: { token: TOKEN, newPassword: FRESH_PASSWORD },
      },
    ]);
  });

  it("takes the fragment out of the address and keeps the rest of it, query included, as it was", async () => {
    setAddress(`#t=${TOKEN}`, "?utm=1");

    screen = mountInCatalogue(createElement(RevertEmailForm, { locale: "ro" }));
    await flushPromises();

    const addressesWritten = replaceState.mock.calls.map(([, , url]) => url);
    expect(addressesWritten.length).toBeGreaterThan(0);
    expect(new Set(addressesWritten)).toEqual(new Set([`${PATH}?utm=1`]));
  });
});
