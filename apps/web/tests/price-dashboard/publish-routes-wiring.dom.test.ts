// @vitest-environment happy-dom
//
// The publish screens are handed no client in the application, and what they write goes to the dashboard's routes: the
// request a press makes is the route's own, the answer is what the page then shows, and no sample stands in for either.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftChange } from "@lemnaria/configurator-domain";

import { PublishScreen } from "@/price-dashboard/publish-page";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import {
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import { inputWithDraft, settle } from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import {
  contextOf,
  leaveTheStaffServer,
  stubTheStaffServer,
} from "./staff-frame-harness";

const ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: "cabinet.base-cabinet",
    field: "anchorMinor",
  },
  value: 400_000,
} as DraftChange;
const DRAFT_ROUTE = "/api/staff/prices/draft";

interface Sent {
  readonly address: string;
  readonly method: string;
  readonly body: unknown;
  readonly referrerPolicy: string | undefined;
}

let screen: MountedScreen | undefined;
let sent: Sent[];

beforeEach(() => {
  stubTheStaffServer();
  resetStaffSessionExpiryForTests();
  sent = [];
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

/** The routes answer `status` with `body` to the dashboard's addresses; the account control's own calls are the stub's. */
function answerRoutesWith(status: number, body: unknown): void {
  const accountServer = globalThis.fetch;
  vi.stubGlobal("fetch", (address: string, init?: RequestInit) => {
    if (!address.startsWith("/api/staff/prices")) {
      return accountServer(address, init);
    }
    sent.push({
      address,
      method: init?.method ?? "GET",
      body:
        init?.body === undefined ? undefined : JSON.parse(init.body as string),
      referrerPolicy: init?.referrerPolicy,
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

async function mountPublish(): Promise<HTMLElement> {
  screen = mountInCatalogue(
    createElement(PublishScreen, {
      locale: "ro",
      context: contextOf("administrator", ["kitchens", "publish"]),
      input: inputWithDraft([ANCHOR], "3"),
      initialView: "pending",
    }),
    "ro",
  );
  await settle();
  return screen.container;
}

describe("the publish page with no client handed in", () => {
  it("takes a change back through the draft route, at the revision it holds, and draws the draft the route answers", async () => {
    answerRoutesWith(200, { draftRevision: "4", changes: [] });
    const container = await mountPublish();

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(sent).toEqual([
      {
        address: DRAFT_ROUTE,
        method: "DELETE",
        body: {
          expectedDraftRevision: "3",
          target: { kind: "change", address: ANCHOR.address },
        },
        referrerPolicy: "same-origin",
      },
    ]);
    expect(
      requireIn(container, '[data-testid="publish-empty"]').isConnected,
    ).toBe(true);
  });

  it("raises the staff frame's sheet when the route says the session ended, and keeps the change on the page", async () => {
    answerRoutesWith(401, {});
    const container = await mountPublish();

    click(requireIn(container, '[data-testid="diff-revert"]'));
    await settle();

    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(container.querySelector('[data-testid="diff-row"]')).not.toBeNull();
  });
});

describe("the unreadable draft's page with no client handed in", () => {
  it("gives the draft up through the draft route, at the revision the read named", async () => {
    answerRoutesWith(200, { draftRevision: "10", changes: [] });
    screen = mountInCatalogue(
      createElement(PublishDraftUnreadableScreen, {
        locale: "ro",
        context: contextOf("administrator", ["kitchens", "publish"]),
        draftRevision: "rev-9",
      }),
      "ro",
    );
    await settle();
    const discard = roCopy("priceDashboard.publish.discardAction");
    click(byWords(screen.container, "button", discard));
    await settle();

    click(
      byWords(
        requireIn(document.body, '[role="alertdialog"]'),
        "button",
        discard,
      ),
    );
    await settle();

    expect(sent).toEqual([
      {
        address: DRAFT_ROUTE,
        method: "DELETE",
        body: { expectedDraftRevision: "rev-9", scope: "all" },
        referrerPolicy: "same-origin",
      },
    ]);
    expect(
      requireIn(screen.container, '[data-testid="publish-unreadable-resolved"]')
        .textContent,
    ).toContain(roCopy("priceDashboard.publish.discardedBody"));
  });
});
