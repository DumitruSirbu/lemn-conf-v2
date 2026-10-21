// @vitest-environment happy-dom
//
// **Adversarial QA of wave L3-U1: the desktop bar's account control inside the staff frame (frame S1E).**
//
// The phone's sheet leaves for the start of the configurator once the server has ended the session, "so no staff page
// stays on screen with clients' data after it" (`staff-nav-sheet.tsx`). On a desktop the person signs out through the
// bar's `AccountControl`, whose "Ieși din cont" keeps the screen and shows a toast (`account-control.tsx`): the
// configurator's behaviour, which `use-logout.ts` says an account page must replace with the full load (plan P14).
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { StaffShell } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import { flushPromises } from "../support/render-hook";
import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";

const ADDRESS = "mihai.rusu@lemnaria.md";
const ACCOUNT_TRIGGER = '[data-testid="top-bar-account-trigger"]';
const LOGOUT_PATH = "/api/account/logout";
const STAFF_SESSION = {
  state: "signed-in",
  email: ADDRESS,
  capabilities: ["design.read.any", "account.manage.own"],
};

let screen: MountedScreen | undefined;
let assignedAddresses: string[];

beforeEach(() => {
  resetAccountSessionForTests();
  assignedAddresses = [];
  vi.stubGlobal("location", {
    assign: (address: string) => assignedAddresses.push(address),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string) =>
      Promise.resolve(
        address === LOGOUT_PATH
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify(STAFF_SESSION), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
      ),
    ),
  );
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("signing out from the staff bar's account control (a desktop)", () => {
  it("leaves the staff page for the start of the configurator once the server has ended the session, as the phone's sheet does", async () => {
    screen = mountInCatalogue(
      createElement(StaffShell, {
        locale: "ro",
        page: "kitchens",
        context: { role: "operator", email: ADDRESS, navigation: ["kitchens"] },
        children: createElement("h1", null, "a client's kitchen"),
      }),
      "ro",
    );
    await flushPromises(5);

    click(requireIn(screen.container, ACCOUNT_TRIGGER));
    click(
      byWords(document.body, "button", roMessages.accountControl.signOutHere),
    );
    await flushPromises(5);

    const logoutRequests = vi
      .mocked(fetch)
      .mock.calls.filter(([address]) => address === LOGOUT_PATH);
    expect(logoutRequests).toHaveLength(1);
    expect(assignedAddresses).toEqual(["/ro"]);
  });
});
