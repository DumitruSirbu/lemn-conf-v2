import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NO_ACTIVE_VERSION } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";

import { priceBookRootOf } from "../support/price-book-wrapper";

// Adversarial QA of the surfaces with production's stores the database's and no version ever published: every surface that
// prices a kitchen is handed no book (A-10). The stores are the ones `getPriceStores` makes for a production process, so
// the route from the environment to the surface is whole; only the Neon driver is replaced.

const world = vi.hoisted(() => ({
  readActive: undefined as undefined | (() => Promise<unknown>),
  priceBookStores: 0,
}));

vi.mock("@lemnaria/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lemnaria/persistence")>()),
  NeonPriceBookStore: vi.fn(function PriceBookStore() {
    world.priceBookStores += 1;
    return { readActive: () => world.readActive?.() };
  }),
  NeonCatalogueAvailabilityStore: vi.fn(function AvailabilityStore() {
    return {
      readCurrent: () => Promise.reject(new Error("availability was read")),
    };
  }),
}));

const OWNED = {
  kind: "found",
  design: KITCHEN_L_DESIGN,
  revision: "1",
} as const;

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () => Promise.resolve(OWNED),
}));
vi.mock("@/lib/server/contact/sent-reference", () => ({
  CONTACT_PAGE_READ_DEADLINE_MS: 1,
  readSentReference: () => Promise.resolve({ kind: "none" }),
}));
vi.mock("@/lib/server/repository", () => ({
  getShareLinkRepository: () => ({
    loadShared: () =>
      Promise.resolve({ kind: "found", design: KITCHEN_L_DESIGN }),
  }),
  getSentKitchenViewRepository: () => ({}),
}));
vi.mock("@/lib/server/account/signed-in-page", () => ({
  readSignedInPage: () => Promise.resolve({ kind: "signed-in" }),
}));
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: () =>
    Promise.resolve({
      kind: "signed-in",
      shell: { role: "operator", email: "staff@example.test", navigation: [] },
    }),
}));
vi.mock("@/lib/server/contact/contact-submission-store-instance", () => ({
  getContactSubmissionStore: () => ({}),
}));
vi.mock("@/lib/server/contact/judge-contact-request", () => ({
  makeContactJudge: () => ({}),
}));
vi.mock("@/lib/server/mail/create-mail-sender", () => ({
  createMailSender: () => ({}),
}));

const { default: DesignPage } = await import("@/app/[locale]/d/[id]/page");
const { default: ReviewPage } = await import(
  "@/app/[locale]/d/[id]/review/page"
);
const { default: ContactPage } = await import(
  "@/app/[locale]/d/[id]/contact/page"
);
const { default: SharedDesignPage } = await import(
  "@/app/[locale]/s/[token]/page"
);
const { default: KitchensPage } = await import(
  "@/app/[locale]/account/kitchens/page"
);
const { default: StaffKitchenPage } = await import(
  "@/app/[locale]/staff/kitchens/[id]/page"
);
const { makeContactProductionPorts } = await import(
  "@/lib/server/contact/contact-production-ports"
);
const { PRICE_STORES_GLOBAL_KEY } = await import("@/lib/server/price-stores");

const DESIGN_ID = "d".repeat(21);
const locale = "ro";

const SURFACES: readonly (readonly [string, () => Promise<unknown>])[] = [
  [
    "the editor",
    () => DesignPage({ params: Promise.resolve({ locale, id: DESIGN_ID }) }),
  ],
  [
    "the review",
    () => ReviewPage({ params: Promise.resolve({ locale, id: DESIGN_ID }) }),
  ],
  [
    "the contact page",
    () => ContactPage({ params: Promise.resolve({ locale, id: DESIGN_ID }) }),
  ],
  [
    "the share view",
    () =>
      SharedDesignPage({ params: Promise.resolve({ token: "abcDEF123456" }) }),
  ],
  [
    "the account's kitchens",
    () => KitchensPage({ params: Promise.resolve({ locale }) }),
  ],
  [
    "the staff's kitchen",
    () =>
      StaffKitchenPage({ params: Promise.resolve({ locale, id: DESIGN_ID }) }),
  ],
];

function forgetTheProcessStores(): void {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
}

beforeEach(() => {
  forgetTheProcessStores();
  world.priceBookStores = 0;
  world.readActive = () => Promise.resolve(NO_ACTIVE_VERSION);
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@w1-qa.database.invalid/db");
});

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("with the database's stores and no version ever published", () => {
  it.each(SURFACES)("%s is handed no book", async (_, draw) => {
    const written = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(priceBookRootOf(await draw())).toBe(NO_PRICE_BOOK);

    expect(world.priceBookStores).toBe(1);
    expect(written).not.toHaveBeenCalled();
  });

  it("the contact route makes no ports, so it prices nothing and answers unavailable", async () => {
    await expect(
      makeContactProductionPorts(new Headers()),
    ).rejects.toMatchObject({ name: "ContactFailure" });
    expect(world.priceBookStores).toBe(1);
  });

  it("every surface is handed no book when the database cannot answer either, and each says so in a line", async () => {
    const { DashboardStoreError } = await import("@lemnaria/persistence");
    world.readActive = () =>
      Promise.reject(
        new DashboardStoreError("read the active price version", "unavailable"),
      );
    const written = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    for (const [, draw] of SURFACES) {
      expect(priceBookRootOf(await draw())).toBe(NO_PRICE_BOOK);
    }

    expect(written).toHaveBeenCalledTimes(SURFACES.length);
  });
});
