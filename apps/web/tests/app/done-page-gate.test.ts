import { createHash } from "node:crypto";

import {
  InvalidDesignError,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactPage from "../../src/app/[locale]/d/[id]/contact/page";
import DonePage from "../../src/app/[locale]/d/[id]/done/page";
import DesignPage from "../../src/app/[locale]/d/[id]/page";
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";

import { readSource } from "../lib/server/server-source-support";

/**
 * The confirmation page is the fourth door to a design, and opens only in its owning browser (ADR 0114 decision 5, ADR
 * 0148 A1; 8M criterion 9). Each refusal must be the editor's, the review's and the contact page's, class for class,
 * and a refused request makes no read of the contact store at all. For the owner it reads the store once, for that
 * design at the revision the owned load answered, and hands its client the design, the id, the revision and the one
 * answer about the request: a reference string or a kind, never a row.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
const FOREIGN_VALUE = "F".repeat(43);
const OWNED_ROW_ID = "ownedRow____________1";
const OWNED_INVALID_ROW_ID = "ownedInvalidRow_____2";
const UNKNOWN_ROW_ID = "noSuchRow___________3";
const STORED_REVISION = "7";

const DOORS = ["editor", "review", "contact", "done"] as const;
type Door = (typeof DOORS)[number];

type LoadOwnedResult =
  | { kind: "found"; design: Design; revision: DesignRevision }
  | { kind: "none" };

const state = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  cookieName: "__Host-lemnaria_visitor",
}));
const loadOwned = vi.hoisted(() =>
  vi.fn<
    (lookup: { id: string; visitorHash: string }) => Promise<LoadOwnedResult>
  >(),
);
const findSentReference = vi.hoisted(() => vi.fn());
const designLoadError = vi.hoisted(() => vi.fn(() => null));
const hydrators = vi.hoisted(() => ({
  editor: vi.fn(() => null),
  review: vi.fn(() => null),
  contact: vi.fn(() => null),
  done: vi.fn(() => null),
}));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({ findSentReference }),
}));
vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrators.editor,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrators.review,
}));
vi.mock("@/app/d/[id]/contact/hydrate-and-contact", () => ({
  HydrateAndContact: hydrators.contact,
}));
vi.mock("@/app/d/[id]/done/hydrate-and-done", () => ({
  HydrateAndDone: hydrators.done,
}));
vi.mock("@/app/d/[id]/design-load-error", () => ({
  DesignLoadError: designLoadError,
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === state.cookieName && state.cookieValue !== undefined
          ? { value: state.cookieValue }
          : undefined,
    }),
}));

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** What the real `loadOwned` answers: the owner's rows, the invalid one refused for its owner alone, `none` otherwise. */
function ownerOnlyRepository(): void {
  const ownerHash = sha256Hex(OWNER_VALUE);
  loadOwned.mockImplementation(({ id, visitorHash }) => {
    if (visitorHash !== ownerHash) return Promise.resolve({ kind: "none" });
    if (id === OWNED_INVALID_ROW_ID)
      return Promise.reject(
        new InvalidDesignError("stored document is invalid"),
      );
    if (id !== OWNED_ROW_ID) return Promise.resolve({ kind: "none" });
    return Promise.resolve({
      kind: "found",
      design: KITCHEN_L_DESIGN,
      revision: STORED_REVISION,
    });
  });
}

function renderDoor(door: Door, id: string): Promise<unknown> {
  const params = Promise.resolve({ locale: "ro", id });
  switch (door) {
    case "editor":
      return DesignPage({ params });
    case "review":
      return ReviewPage({ params });
    case "contact":
      return ContactPage({ params });
    case "done":
      return DonePage({ params });
  }
}

function propsOf(element: unknown): Record<string, unknown> {
  if (!isValidElement<Record<string, unknown>>(element))
    throw new Error("the page returned a non-element");
  return element.props;
}

beforeEach(() => {
  loadOwned.mockReset();
  findSentReference.mockReset();
  findSentReference.mockResolvedValue({ kind: "none" });
  for (const hydrator of Object.values(hydrators)) hydrator.mockClear();
  state.cookieValue = undefined;
  state.cookieName = VISITOR_COOKIE_NAME;
  ownerOnlyRepository();
});

describe("the four doors refuse one request alike", () => {
  const cases: {
    name: string;
    cookie: string | undefined;
    cookieName?: string;
    id: string;
    reachesRepository: boolean;
    reason: "unavailable" | "invalid";
  }[] = [
    {
      name: "no cookie",
      cookie: undefined,
      id: OWNED_ROW_ID,
      reachesRepository: false,
      reason: "unavailable",
    },
    {
      name: "a malformed cookie",
      cookie: "O".repeat(42),
      id: OWNED_ROW_ID,
      reachesRepository: false,
      reason: "unavailable",
    },
    {
      name: "a cookie under another name",
      cookie: OWNER_VALUE,
      cookieName: "__host-lemnaria_visitor",
      id: OWNED_ROW_ID,
      reachesRepository: false,
      reason: "unavailable",
    },
    {
      name: "a foreign cookie",
      cookie: FOREIGN_VALUE,
      id: OWNED_ROW_ID,
      reachesRepository: true,
      reason: "unavailable",
    },
    {
      name: "a foreign cookie on an invalid row",
      cookie: FOREIGN_VALUE,
      id: OWNED_INVALID_ROW_ID,
      reachesRepository: true,
      reason: "unavailable",
    },
    {
      name: "an unknown id",
      cookie: OWNER_VALUE,
      id: UNKNOWN_ROW_ID,
      reachesRepository: true,
      reason: "unavailable",
    },
    {
      name: "an id too short to be a design id's, for the owner",
      cookie: OWNER_VALUE,
      id: "owned-row",
      reachesRepository: false,
      reason: "unavailable",
    },
    {
      name: "an id one character too long, for the owner",
      cookie: OWNER_VALUE,
      id: `${OWNED_ROW_ID}x`,
      reachesRepository: false,
      reason: "unavailable",
    },
    {
      name: "an invalid row, for its owner",
      cookie: OWNER_VALUE,
      id: OWNED_INVALID_ROW_ID,
      reachesRepository: true,
      reason: "invalid",
    },
  ];

  for (const door of DOORS)
    for (const testCase of cases)
      it(`${door} / ${testCase.name}: renders exactly { reason: "${testCase.reason}" }, no design and no contact-store read`, async () => {
        state.cookieValue = testCase.cookie;
        state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

        const page = await renderDoor(door, testCase.id);

        expect(isValidElement(page) && page.type).toBe(designLoadError);
        expect(propsOf(page)).toEqual({ reason: testCase.reason });
        expect(loadOwned).toHaveBeenCalledTimes(
          testCase.reachesRepository ? 1 : 0,
        );
        expect(findSentReference).not.toHaveBeenCalled();
        for (const hydrator of Object.values(hydrators))
          expect(hydrator).not.toHaveBeenCalled();
      });

  for (const testCase of cases)
    it(`${testCase.name}: the confirmation door answers the very element the other three do`, async () => {
      state.cookieValue = testCase.cookie;
      state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

      const [editor, review, contact, done] = [
        await renderDoor("editor", testCase.id),
        await renderDoor("review", testCase.id),
        await renderDoor("contact", testCase.id),
        await renderDoor("done", testCase.id),
      ];

      expect(done).toEqual(editor);
      expect(done).toEqual(review);
      expect(done).toEqual(contact);
    });

  it("rethrows a driver failure of the owned load and reads no contact store", async () => {
    state.cookieValue = OWNER_VALUE;
    loadOwned.mockRejectedValue(new Error("connection reset"));

    await expect(renderDoor("done", OWNED_ROW_ID)).rejects.toThrow(
      "connection reset",
    );
    expect(findSentReference).not.toHaveBeenCalled();
  });
});

describe("the owner is served the confirmation", () => {
  beforeEach(() => {
    state.cookieValue = OWNER_VALUE;
  });

  it("with the stored design, its id and revision and the reference of the request the store holds", async () => {
    findSentReference.mockResolvedValue({ kind: "sent", reference: "LM-2614" });

    const page = await renderDoor("done", OWNED_ROW_ID);

    expect(isValidElement(page) && page.type).toBe(hydrators.done);
    expect(propsOf(page)).toEqual({
      design: KITCHEN_L_DESIGN,
      designId: OWNED_ROW_ID,
      revision: STORED_REVISION,
      sentReference: { kind: "sent", reference: "LM-2614" },
    });
    expect(loadOwned).toHaveBeenCalledWith({
      id: OWNED_ROW_ID,
      visitorHash: sha256Hex(OWNER_VALUE),
    });
  });

  it("reads the store once, for this design at the revision the owned load answered", async () => {
    await renderDoor("done", OWNED_ROW_ID);

    expect(findSentReference.mock.calls).toEqual([
      [{ designId: OWNED_ROW_ID, revision: STORED_REVISION }],
    ]);
  });

  it("with the kind none when the store holds no notified request for it", async () => {
    findSentReference.mockResolvedValue({ kind: "none" });

    const page = await renderDoor("done", OWNED_ROW_ID);

    expect(propsOf(page).sentReference).toEqual({ kind: "none" });
  });

  it("with the kind unknown, and no error, when the read fails", async () => {
    findSentReference.mockRejectedValue(new Error("password=hunter2"));

    const page = await renderDoor("done", OWNED_ROW_ID);

    expect(propsOf(page).sentReference).toEqual({ kind: "unknown" });
    expect(JSON.stringify(propsOf(page))).not.toContain("hunter2");
  });

  it("handing the client nothing of a row: the answer is a reference string or a kind", async () => {
    findSentReference.mockResolvedValue({
      kind: "sent",
      reference: "LM-2614",
      phone: "069 123 456",
      clientRequestId: "request-id-of-the-row",
    });

    const handedOn = JSON.stringify(
      propsOf(await renderDoor("done", OWNED_ROW_ID)),
    );

    expect(handedOn).toContain("LM-2614");
    expect(handedOn).not.toContain("069 123 456");
    expect(handedOn).not.toContain("request-id-of-the-row");
  });
});

describe("the confirmation page's own source", () => {
  it.each([
    "app/[locale]/d/[id]/done/page.tsx",
    "app/d/[id]/done/hydrate-and-done.tsx",
  ])("reads source: %s names no browser storage and no cookie", (path) => {
    expect(readSource(path)).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie/,
    );
  });

  it("reads source: the hydrator makes no request of its own", () => {
    expect(readSource("app/d/[id]/done/hydrate-and-done.tsx")).not.toMatch(
      /\bfetch\b|\buseEffect\b|\/api\//,
    );
  });

  it("reads source: the page asks for the owned design before it reads the contact store", () => {
    const source = readSource("app/[locale]/d/[id]/done/page.tsx");

    expect(source.indexOf("loadOwnedDesign(id)")).toBeGreaterThan(-1);
    expect(source.indexOf("readSentReference(")).toBeGreaterThan(
      source.indexOf("loadOwnedDesign(id)"),
    );
    expect(source.indexOf("readSentReference(")).toBeGreaterThan(
      source.indexOf('load.kind === "refused"'),
    );
  });

  it("reads source: the page is not prerendered, as the other doors are not: no static export, no generated params", () => {
    expect(readSource("app/[locale]/d/[id]/done/page.tsx")).not.toMatch(
      /generateStaticParams|dynamic\s*=\s*["']force-static|revalidate\s*=/,
    );
  });
});
