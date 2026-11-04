import { createHash } from "node:crypto";

import {
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import {
  FakeContactSubmissionStore,
  FakeSentKitchenViewRepository,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeMailSender } from "@/lib/server/mail/fake-mail-sender";

import { bodyOf } from "../../../lib/server/contact/submit-contact-harness";
import { parseNotice } from "../../../lib/server/mail/notice-html-dom-support";
import { withoutPriceBook } from "../../../support/price-book-wrapper";

/**
 * The shop's link from the request to the page it opens: the route with its real orchestration and production ports,
 * and the share page, over one fake of the frozen copies. Only what reaches outside the process is a fake.
 */
const ORIGIN = "https://lemnaria.example";
const KITCHEN_HREF = /^https:\/\/lemnaria\.example\/ro\/s\/([0-9A-Za-z]{12})$/;
const UNKNOWN_TOKEN = "zyxWVU654321";

const fakes = vi.hoisted(() => ({
  store: undefined as unknown,
  sender: undefined as unknown,
  views: undefined as unknown,
}));
const page = vi.hoisted(() => ({
  designLoadError: vi.fn(() => null),
  sharedDesignView: vi.fn(() => null),
}));

vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => fakes.store,
}));
vi.mock("@/lib/server/contact/sent-mark-store-instance", () =>
  import("../../../support/sent-mark-store-fake").then((fake) =>
    fake.fakeSentMarkStoreModule(),
  ),
);
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({ kind: "sender", sender: fakes.sender }),
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve({ kind: "found", design: KITCHEN_L_DESIGN, revision: "1" }),
}));
vi.mock("@/lib/server/repository", () => ({
  getShareLinkRepository: () => ({
    loadShared: () => Promise.resolve({ kind: "none" }),
  }),
  getSentKitchenViewRepository: () => fakes.views,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: page.designLoadError,
}));
vi.mock("@/app/s/[token]/shared-design-view", () => ({
  SharedDesignView: page.sharedDesignView,
}));

const { POST } = await import(
  "../../../../src/app/api/contact-submissions/route"
);
const { default: SharedDesignPage } = await import(
  "@/app/[locale]/s/[token]/page"
);

let store: FakeContactSubmissionStore;
let sender: ReturnType<typeof createFakeMailSender>;
let views: FakeSentKitchenViewRepository;

beforeEach(() => {
  store = new FakeContactSubmissionStore();
  sender = createFakeMailSender();
  views = new FakeSentKitchenViewRepository();
  fakes.store = store;
  fakes.sender = sender;
  fakes.views = views;
  vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", ORIGIN);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function post(body: string): Promise<Response> {
  return POST(
    new NextRequest("https://lemnaria.test/api/contact-submissions", {
      method: "POST",
      body,
      headers: {
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
    }),
  );
}

function sha256Of(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** The one kitchen link of the HTML part, and the text part's first line naming the same address. */
function kitchenTokenOfTheNotice(): string {
  const [message] = sender.sent;
  const { document } = parseNotice(message?.html ?? "");
  const kitchenHrefs = [...document.querySelectorAll("a")]
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => href.includes("/s/"));
  expect(kitchenHrefs).toHaveLength(1);
  const [href = ""] = kitchenHrefs;
  expect(message?.text.split("\n")[0]).toContain(href);
  return KITCHEN_HREF.exec(href)?.[1] ?? "";
}

async function pageFor(token: string): Promise<ReactElement> {
  const element: unknown = withoutPriceBook(
    await SharedDesignPage({
      params: Promise.resolve({ token }),
    }),
  );
  if (!isValidElement(element)) throw new Error("the page drew no element");
  return element;
}

function propsOf(element: ReactElement): Record<string, unknown> {
  return element.props as Record<string, unknown>;
}

describe("a design's request through the route, and the link the shop is sent", () => {
  it("sends a notice whose two parts carry the link, under the configured origin, of the view recorded for it", async () => {
    const answer = await post(bodyOf());

    const token = kitchenTokenOfTheNotice();
    const [held] = store.heldSubmissions();
    expect(answer.status).toBe(200);
    expect(token).toMatch(/^[0-9A-Za-z]{12}$/);
    expect(views.heldViews()).toMatchObject([
      {
        tokenHash: sha256Of(token),
        clientRequestId: held?.submission.clientRequestId,
        document: held?.submission.snapshot?.document,
      },
    ]);
  });

  it("opens the kitchen as it was sent through the share page", async () => {
    await post(bodyOf());

    const element = await pageFor(kitchenTokenOfTheNotice());

    expect(element.type).toBe(page.sharedDesignView);
    const design = propsOf(element).design as typeof KITCHEN_L_DESIGN;
    expect(canonicalSerializeDesign(design)).toBe(
      canonicalSerializeDesign(KITCHEN_L_DESIGN),
    );
  });

  it("draws the one not-found for the link once its view is revoked, as for a token nothing names", async () => {
    await post(bodyOf());
    const token = kitchenTokenOfTheNotice();

    views.revoke(sha256Of(token));

    for (const element of [
      await pageFor(token),
      await pageFor(UNKNOWN_TOKEN),
    ]) {
      expect(element.type).toBe(page.designLoadError);
      expect(propsOf(element)).toEqual({ reason: "not-found" });
    }
  });

  it("sends the notice without a link, and answers the same 200, on a server with no public origin", async () => {
    vi.stubEnv("LEMNARIA_PUBLIC_ORIGIN", undefined);

    const answer = await post(bodyOf());

    const [message] = sender.sent;
    expect(answer.status).toBe(200);
    expect(sender.sent).toHaveLength(1);
    expect(message?.html).not.toContain("/s/");
    expect(views.heldViews()).toEqual([]);
    expect(store.heldSubmissions()[0]?.notifiedAt).toBeDefined();
  });
});
