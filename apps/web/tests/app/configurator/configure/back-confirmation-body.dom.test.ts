// @vitest-environment happy-dom
//
// **Lot 2 U15c (plan M8B Lot 2 section 14.2, U15-3): the back confirmation's body is chosen by who is signed in.**
//
// Leaving the editor loses nothing under autosave, and what is kept differs by who is asking. The client's body is
// shown only on a definite signed-in client answer from the server; every other state, the pending, the failed and the
// signed-out ones included, reads the visitor's. The session module is the real one, fed by a stubbed `fetch`, so the
// answers are the ones the route gives and the "definite" flag is the module's own.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  markSignedOut,
  refreshSession,
  resetAccountSessionForTests,
} from "@/account/session/use-account-session";
import { BackConfirmationDialog } from "@/app/configurator/configure/back-confirmation";

import roMessages from "../../../../src/messages/ro.json";
import ruMessages from "../../../../src/messages/ru.json";
import { flushPromises } from "../../../support/render-hook";
import {
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../../../support/render-with-intl";

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const BODY_TEST_ID = "back-confirm-confirm-body";
const LOSS_WORDING = /pierd|потер/i;

const CLIENT_SESSION = {
  state: "signed-in",
  email: "ana@example.com",
  capabilities: ["design.read.own", "design.edit.own", "account.manage.own"],
};
const STAFF_SESSION = {
  state: "signed-in",
  email: "staff@example.com",
  capabilities: ["contact.read", "account.manage.own"],
};
const ANONYMOUS_SESSION = { state: "anonymous" };

let screen: MountedScreen | undefined;

beforeEach(() => {
  resetAccountSessionForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function answerWith(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function openDialogAfter(
  fetchStub: () => Promise<Response>,
  locale: TestLocale = "ro",
): Promise<string> {
  vi.stubGlobal("fetch", vi.fn(fetchStub));
  screen = mountInCatalogue(
    createElement(BackConfirmationDialog, {
      onConfirm: () => undefined,
      onStay: () => undefined,
    }),
    locale,
  );
  await flushPromises(5);
  return shownBody();
}

function shownBody(): string {
  if (screen === undefined) throw new Error("nothing is mounted");
  return requireIn(screen.container, `[data-testid="${BODY_TEST_ID}"]`)
    .textContent;
}

describe("which body the dialog shows", () => {
  it.each(LOCALES)(
    "%s: the client body on a definite signed-in client answer",
    async (locale) => {
      const shown = await openDialogAfter(
        () => answerWith(CLIENT_SESSION),
        locale,
      );

      expect(shown).toBe(CATALOGUES[locale].configure.backConfirm.bodyClient);
    },
  );

  it.each([
    ["a definite anonymous answer", () => answerWith(ANONYMOUS_SESSION)],
    ["a definite staff answer", () => answerWith(STAFF_SESSION)],
    [
      "an answer that is signed in but names no capabilities",
      () => answerWith({ state: "signed-in", email: "a@b.c" }),
    ],
    [
      "a refused request (a failed read stands in as anonymous)",
      () => Promise.resolve(new Response("{}", { status: 503 })),
    ],
    ["a request that fails", () => Promise.reject(new Error("offline"))],
    [
      "a request not yet answered",
      () => new Promise<Response>(() => undefined),
    ],
  ] as const)("the visitor body on %s", async (_label, fetchStub) => {
    const shown = await openDialogAfter(fetchStub);

    expect(shown).toBe(roMessages.configure.backConfirm.bodyVisitor);
  });

  it("falls back to the visitor body when the person signs out while the dialog is open", async () => {
    expect(await openDialogAfter(() => answerWith(CLIENT_SESSION))).toBe(
      roMessages.configure.backConfirm.bodyClient,
    );

    markSignedOut();
    await flushPromises(3);

    expect(shownBody()).toBe(roMessages.configure.backConfirm.bodyVisitor);
  });

  it("falls back to the visitor body when a fresh read of a signed-in session fails", async () => {
    expect(await openDialogAfter(() => answerWith(CLIENT_SESSION))).toBe(
      roMessages.configure.backConfirm.bodyClient,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    refreshSession();
    await flushPromises(5);

    expect(shownBody()).toBe(roMessages.configure.backConfirm.bodyVisitor);
  });

  it("shows the visitor body to a dialog opened while the server is being asked again, though the last answer was a client", async () => {
    await openDialogAfter(() => answerWith(CLIENT_SESSION));
    screen?.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    refreshSession();
    screen = mountInCatalogue(
      createElement(BackConfirmationDialog, {
        onConfirm: () => undefined,
        onStay: () => undefined,
      }),
    );
    await flushPromises(3);

    expect(shownBody()).toBe(roMessages.configure.backConfirm.bodyVisitor);
  });

  it("asks the server who is signed in only once, as the rest of the editor does", async () => {
    const fetchStub = vi.fn(() => answerWith(CLIENT_SESSION));
    vi.stubGlobal("fetch", fetchStub);
    screen = mountInCatalogue(
      createElement(BackConfirmationDialog, {
        onConfirm: () => undefined,
        onStay: () => undefined,
      }),
    );
    await flushPromises(5);

    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe("what the two bodies promise", () => {
  it.each(LOCALES)(
    "%s: neither the heading nor either body speaks of a loss, and the two bodies differ",
    (locale) => {
      const { title, bodyClient, bodyVisitor } =
        CATALOGUES[locale].configure.backConfirm;

      expect(title).not.toMatch(LOSS_WORDING);
      expect(bodyClient).not.toMatch(LOSS_WORDING);
      expect(bodyVisitor).not.toMatch(LOSS_WORDING);
      expect(bodyClient).not.toBe(bodyVisitor);
    },
  );

  it.each(LOCALES)(
    "%s: the dialog's leaves are the heading, the two bodies and the two buttons, with no single 'body' left",
    (locale) => {
      const leaves = Object.keys(CATALOGUES[locale].configure.backConfirm);

      expect(leaves.sort()).toEqual(
        ["bodyClient", "bodyVisitor", "confirm", "stay", "title"].sort(),
      );
    },
  );
});

describe("the guard's mechanism", () => {
  it("leaves the back-guard hook ignorant of the session: only the dialog's body is chosen by it", () => {
    const hookSource = readFileSync(
      resolve(
        __dirname,
        "../../../../src/app/configurator/configure/use-back-guard.ts",
      ),
      "utf8",
    );

    expect(hookSource).not.toContain("use-account-session");
    expect(hookSource).not.toContain("backConfirm");
  });
});
