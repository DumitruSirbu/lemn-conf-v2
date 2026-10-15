import { createHash } from "node:crypto";

import {
  InvalidDesignError,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContactPage from "../../src/app/[locale]/d/[id]/contact/page";
import DesignPage from "../../src/app/[locale]/d/[id]/page";
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";

import { readSource } from "../lib/server/server-source-support";

/**
 * The contact page is a third door to a design that opens only in its owning browser (ADR 0114 decision 5, ADR 0148
 * A1; 8L criterion 15). Each refusal, a segment that is not a design id's shape included (8L.13, criterion 16), must be the editor's and the review's, class for class, and the three doors must
 * answer one request with one thing; a request with no usable cookie reaches no repository. What the page hands its
 * client is a design, its revision and one boolean (8L criterion 7).
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
const FOREIGN_VALUE = "F".repeat(43);
const OWNED_ROW_ID = "ownedRow____________1";
const OWNED_INVALID_ROW_ID = "ownedInvalidRow_____2";
const UNKNOWN_ROW_ID = "noSuchRow___________3";
const DIGEST_SECRET_VALUE =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const DOORS = ["editor", "review", "contact"] as const;
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
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));
const hydrateAndReview = vi.hoisted(() => vi.fn(() => null));
const hydrateAndContact = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({ loadOwned }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({ findSentReference }),
}));
vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrateAndReview,
}));
vi.mock("@/app/d/[id]/contact/hydrate-and-contact", () => ({
  HydrateAndContact: hydrateAndContact,
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
      revision: "7",
    });
  });
}

function renderDoor(door: Door, id: string): Promise<unknown> {
  const params = Promise.resolve({ locale: "ro", id });
  if (door === "editor") return DesignPage({ params });
  return door === "review" ? ReviewPage({ params }) : ContactPage({ params });
}

function propsOf(element: unknown): Record<string, unknown> {
  if (!isValidElement<Record<string, unknown>>(element))
    throw new Error("the page returned a non-element");
  return element.props;
}

function stubTheServersEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  for (const [name, value] of Object.entries(environment))
    vi.stubEnv(name, value);
}

const SENDABLE_ENVIRONMENT = {
  GOOGLE_EMAIL: undefined,
  GOOGLE_APP_PASSWORD: undefined,
  LEAD_NOTIFICATION_ADDRESS: undefined,
  RESEND_API_KEY: undefined,
  MAIL_FROM_ADDRESS: undefined,
  LEMNARIA_E2E_FAKE_MAIL: "1",
  DIGEST_SECRET: DIGEST_SECRET_VALUE,
} as const;

beforeEach(() => {
  loadOwned.mockReset();
  findSentReference.mockReset();
  findSentReference.mockResolvedValue({ kind: "none" });
  for (const hydrator of [
    hydrateAndConfigure,
    hydrateAndReview,
    hydrateAndContact,
  ])
    hydrator.mockClear();
  state.cookieValue = undefined;
  state.cookieName = VISITOR_COOKIE_NAME;
  ownerOnlyRepository();
  stubTheServersEnvironment(SENDABLE_ENVIRONMENT);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the three doors refuse one request alike", () => {
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
        for (const hydrator of [
          hydrateAndConfigure,
          hydrateAndReview,
          hydrateAndContact,
        ])
          expect(hydrator).not.toHaveBeenCalled();
      });

  for (const testCase of cases)
    it(`${testCase.name}: the contact door answers the very element the editor's does`, async () => {
      state.cookieValue = testCase.cookie;
      state.cookieName = testCase.cookieName ?? VISITOR_COOKIE_NAME;

      const editor = await renderDoor("editor", testCase.id);
      const review = await renderDoor("review", testCase.id);
      const contact = await renderDoor("contact", testCase.id);

      expect(contact).toEqual(editor);
      expect(contact).toEqual(review);
    });

  it("rethrows a driver failure and never maps it to a refusal", async () => {
    state.cookieValue = OWNER_VALUE;
    loadOwned.mockRejectedValue(new Error("connection reset"));

    await expect(renderDoor("contact", OWNED_ROW_ID)).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("the owner is served the contact page", () => {
  beforeEach(() => {
    state.cookieValue = OWNER_VALUE;
  });

  it("with the stored design, its revision, the id, whether the server can send and what it knows of a sent request, and nothing else", async () => {
    findSentReference.mockResolvedValue({ kind: "sent", reference: "LM-2614" });

    const page = await renderDoor("contact", OWNED_ROW_ID);

    expect(isValidElement(page) && page.type).toBe(hydrateAndContact);
    expect(propsOf(page)).toEqual({
      design: KITCHEN_L_DESIGN,
      designId: OWNED_ROW_ID,
      revision: "7",
      isSendable: true,
      sentReference: { kind: "sent", reference: "LM-2614" },
    });
    expect(loadOwned).toHaveBeenCalledWith({
      id: OWNED_ROW_ID,
      visitorHash: sha256Hex(OWNER_VALUE),
    });
  });

  it("with isSendable false when the server has no usable digest secret", async () => {
    vi.stubEnv("DIGEST_SECRET", undefined);

    const page = await renderDoor("contact", OWNED_ROW_ID);

    expect(propsOf(page).isSendable).toBe(false);
  });

  it("with isSendable false when the server has no mail sender", async () => {
    vi.stubEnv("LEMNARIA_E2E_FAKE_MAIL", undefined);

    const page = await renderDoor("contact", OWNED_ROW_ID);

    expect(propsOf(page).isSendable).toBe(false);
  });

  it("reading the environment when it is asked for and not when it was imported", async () => {
    const first = await renderDoor("contact", OWNED_ROW_ID);
    vi.stubEnv("DIGEST_SECRET", undefined);
    const second = await renderDoor("contact", OWNED_ROW_ID);

    expect([propsOf(first).isSendable, propsOf(second).isSendable]).toEqual([
      true,
      false,
    ]);
  });

  it("handing the client no variable's name and no value of one", async () => {
    stubTheServersEnvironment({
      GOOGLE_EMAIL: "orders@mail.example.com",
      GOOGLE_APP_PASSWORD: "ZxQ8vK3pWmRt5Yn2",
      LEAD_NOTIFICATION_ADDRESS: "inbox@example.com",
      RESEND_API_KEY: undefined,
      MAIL_FROM_ADDRESS: undefined,
      LEMNARIA_E2E_FAKE_MAIL: undefined,
    });

    const handedOn = JSON.stringify(
      propsOf(await renderDoor("contact", OWNED_ROW_ID)),
    );

    for (const secret of [
      DIGEST_SECRET_VALUE,
      "ZxQ8vK3pWmRt5Yn2",
      "orders@mail.example.com",
      "inbox@example.com",
      "DIGEST_SECRET",
      "GOOGLE_EMAIL",
      "GOOGLE_APP_PASSWORD",
      "RESEND_API_KEY",
      "MAIL_FROM_ADDRESS",
      "LEAD_NOTIFICATION_ADDRESS",
      "LEMNARIA_E2E_FAKE_MAIL",
    ])
      expect(handedOn).not.toContain(secret);
    expect(handedOn).toContain('"isSendable":true');
  });
});

describe("the contact page's own source", () => {
  it.each([
    "app/[locale]/d/[id]/contact/page.tsx",
    "app/d/[id]/contact/hydrate-and-contact.tsx",
  ])(
    "reads source: %s names no browser storage and no cookie (8L criterion 6)",
    (path) => {
      expect(readSource(path)).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
    },
  );

  it("reads source: the page makes no request of its own to hydrate", () => {
    expect(
      readSource("app/d/[id]/contact/hydrate-and-contact.tsx"),
    ).not.toMatch(/\bfetch\b|\buseEffect\b|\/api\//);
  });
});
