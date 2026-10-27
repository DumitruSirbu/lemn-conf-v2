import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

import { priceBookRootOf } from "../support/price-book-wrapper";

// Every surface that prices a kitchen reads the same book root, once per request (backlog 176, R1): the three owner
// doors, the share view, the account's kitchens, the staff's kitchen, and the contact route's ports. With no active
// version every one of them is handed no book (A-10).

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

beforeEach(forgetTheProcessStores);

afterEach(() => {
  forgetTheProcessStores();
  vi.unstubAllEnvs();
});

describe("every surface is handed the one book root of the active version", () => {
  it.each(SURFACES)(
    "%s gets {versionId, book, availability} as a server prop",
    async (_, draw) => {
      const root = priceBookRootOf(await draw());

      expect(root.kind).toBe("active");
      if (root.kind !== "active") return;
      expect(Object.keys(root).sort()).toEqual([
        "availability",
        "book",
        "kind",
        "versionId",
      ]);
      expect(typeof root.versionId).toBe("string");
      expect(root.availability.disabled).toEqual([]);
    },
  );

  it("prices every surface and the contact route under one version id", async () => {
    const roots: PriceBookRoot[] = [];
    for (const [, draw] of SURFACES) roots.push(priceBookRootOf(await draw()));

    const ports = await makeContactProductionPorts(new Headers());

    const versionIds = roots.map((root) =>
      root.kind === "active" ? root.versionId : undefined,
    );
    expect(new Set(versionIds).size).toBe(1);
    expect(ports.bookVersionId).toBe(versionIds[0]);
    const [editor] = roots;
    expect(editor?.kind === "active" && editor.book).toEqual(ports.book);
  });
});

describe("with no active version every surface refuses (A-10)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it.each(SURFACES)("%s is handed no book", async (_, draw) => {
    expect(priceBookRootOf(await draw())).toBe(NO_PRICE_BOOK);
  });

  it("the contact route makes no ports, so it prices nothing and answers unavailable", async () => {
    await expect(
      makeContactProductionPorts(new Headers()),
    ).rejects.toMatchObject({ name: "ContactFailure" });
  });
});
