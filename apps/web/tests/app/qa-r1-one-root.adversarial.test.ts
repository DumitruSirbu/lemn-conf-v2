import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  type CatalogueAvailabilityStore,
  type PriceBookStore,
} from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

import { priceBookRootOf } from "../support/price-book-wrapper";

// Adversarial QA for M10 wave R1 (backlog 176): the pages and the contact route are handed one root of the active version,
// read once per request, and every way of having no book is the same refusal on every surface. The process's stores are
// planted under their global key, so each case counts what the surfaces asked of them.

const OWNED = {
  kind: "found",
  design: KITCHEN_L_DESIGN,
  revision: "1",
} as const;

const world = vi.hoisted(() => ({
  ownedLoad: "found" as "found" | "refused",
  staffGate: "signed-in" as "signed-in" | "forbidden",
  accountGate: "signed-in" as "signed-in" | "forbidden",
  shareLookup: "found" as "found" | "none",
}));

const parse = vi.hoisted(() => ({ parsePriceBook: vi.fn() }));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@lemnaria/configurator-domain")>();
  parse.parsePriceBook.mockImplementation(original.parsePriceBook);
  return { ...original, parsePriceBook: parse.parsePriceBook };
});
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/server/load-owned-design", () => ({
  loadOwnedDesign: () =>
    Promise.resolve(
      world.ownedLoad === "found"
        ? OWNED
        : { kind: "refused", reason: "unavailable" },
    ),
}));
vi.mock("@/lib/server/contact/sent-reference", () => ({
  CONTACT_PAGE_READ_DEADLINE_MS: 1,
  readSentReference: () => Promise.resolve({ kind: "none" }),
}));
vi.mock("@/lib/server/repository", () => ({
  getShareLinkRepository: () => ({
    loadShared: () =>
      Promise.resolve(
        world.shareLookup === "found"
          ? { kind: "found", design: KITCHEN_L_DESIGN }
          : { kind: "none" },
      ),
  }),
  getSentKitchenViewRepository: () => ({
    load: () => Promise.resolve({ kind: "none" }),
  }),
}));
vi.mock("@/lib/server/account/signed-in-page", () => ({
  readSignedInPage: () => Promise.resolve({ kind: world.accountGate }),
}));
vi.mock("@/lib/server/staff/staff-page", () => ({
  readStaffPage: () =>
    Promise.resolve(
      world.staffGate === "signed-in"
        ? {
            kind: "signed-in",
            shell: {
              role: "operator",
              email: "staff@example.test",
              navigation: [],
            },
          }
        : { kind: "forbidden" },
    ),
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
const SHARE_TOKEN = "abcDEF123456";
const AVAILABILITY = { revision: "3", disabled: [] };

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
    () => SharedDesignPage({ params: Promise.resolve({ token: SHARE_TOKEN }) }),
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

interface StoredVersion {
  readonly versionId: string;
  readonly book: unknown;
  /** A store states a book's own `version` as its version's id; a test of a book that does not says so. */
  readonly isUnstamped?: boolean;
}

function bookAsStored(version: StoredVersion): unknown {
  return version.isUnstamped === true
    ? version.book
    : { ...(version.book as object), version: version.versionId };
}

interface PlantedStores {
  readonly readActive: ReturnType<typeof vi.fn>;
  readonly readCurrent: ReturnType<typeof vi.fn>;
  readonly publish: (version: StoredVersion) => void;
}

function plantStores(
  initial: StoredVersion | "none" | DashboardStoreError,
  availability: () => Promise<unknown> = () => Promise.resolve(AVAILABILITY),
): PlantedStores {
  let stored = initial;
  const readActive = vi.fn(() => {
    if (stored instanceof DashboardStoreError) return Promise.reject(stored);
    if (stored === "none") return Promise.resolve(NO_ACTIVE_VERSION);
    return Promise.resolve({
      kind: "found" as const,
      version: {
        versionId: stored.versionId,
        sequenceNumber: 1,
        label: "A label",
        publishedAt: new Date(0),
        book: bookAsStored(stored),
      },
    });
  });
  const readCurrent = vi.fn(availability);
  const stores = {
    priceBook: { readActive } as unknown as PriceBookStore,
    availability: { readCurrent } as unknown as CatalogueAvailabilityStore,
  };
  Reflect.set(globalThis, PRICE_STORES_GLOBAL_KEY, Promise.resolve(stores));
  return {
    readActive,
    readCurrent,
    publish: (version) => {
      stored = version;
    },
  };
}

const UNAVAILABLE = new DashboardStoreError(
  "read the active price version",
  "unavailable",
);

beforeEach(() => {
  world.ownedLoad = "found";
  world.staffGate = "signed-in";
  world.accountGate = "signed-in";
  world.shareLookup = "found";
  parse.parsePriceBook.mockClear();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, PRICE_STORES_GLOBAL_KEY);
  vi.unstubAllEnvs();
});

describe("one request reads the store once and parses once, on every surface (R-a)", () => {
  it.each(SURFACES)(
    "%s asks for the active version once, for the availability once and parses once",
    async (_, draw) => {
      const stores = plantStores({
        versionId: "v-1",
        book: SAMPLE_PRICE_BOOK,
      });

      const root = priceBookRootOf(await draw());

      expect(root.kind === "active" && root.versionId).toBe("v-1");
      expect(stores.readActive).toHaveBeenCalledTimes(1);
      expect(stores.readCurrent).toHaveBeenCalledTimes(1);
      expect(parse.parsePriceBook).toHaveBeenCalledTimes(1);
    },
  );

  it("is one read and one parse for the contact route's ports", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });

    const ports = await makeContactProductionPorts(new Headers());

    expect(ports.bookVersionId).toBe("v-1");
    expect(stores.readActive).toHaveBeenCalledTimes(1);
    expect(stores.readCurrent).toHaveBeenCalledTimes(1);
    expect(parse.parsePriceBook).toHaveBeenCalledTimes(1);
  });

  it("is read again by the next request, so a publish between two requests is seen by the second alone, on every surface and the contact route", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    const before: (string | undefined)[] = [];
    for (const [, draw] of SURFACES) {
      const root = priceBookRootOf(await draw());
      before.push(root.kind === "active" ? root.versionId : undefined);
    }

    stores.publish({ versionId: "v-2", book: SAMPLE_PRICE_BOOK });

    const after: (string | undefined)[] = [];
    for (const [, draw] of SURFACES) {
      const root = priceBookRootOf(await draw());
      after.push(root.kind === "active" ? root.versionId : undefined);
    }
    const ports = await makeContactProductionPorts(new Headers());
    expect(new Set(before)).toEqual(new Set(["v-1"]));
    expect(new Set(after)).toEqual(new Set(["v-2"]));
    expect(ports.bookVersionId).toBe("v-2");
    expect(stores.readActive).toHaveBeenCalledTimes(SURFACES.length * 2 + 1);
  });

  it("states the book's own version as the version id it was read as, before and after a publish, on a page and on the contact route", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    const page = priceBookRootOf(await SURFACES[0]?.[1]());
    stores.publish({ versionId: "v-2", book: SAMPLE_PRICE_BOOK });
    const nextPage = priceBookRootOf(await SURFACES[0]?.[1]());

    const ports = await makeContactProductionPorts(new Headers());

    expect(page.kind === "active" && page.book.version).toBe("v-1");
    expect(nextPage.kind === "active" && nextPage.book.version).toBe("v-2");
    expect(ports.book.version).toBe(ports.bookVersionId);
    expect(ports.bookVersionId).toBe("v-2");
  });

  it("carries the availability current at the read, beside the book and never inside it", async () => {
    plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK }, () =>
      Promise.resolve({ revision: "9", disabled: ["accessory.x"] }),
    );

    const root = priceBookRootOf(await SURFACES[0]?.[1]());

    expect(root.kind === "active" && root.availability).toEqual({
      revision: "9",
      disabled: ["accessory.x"],
    });
    expect(root.kind === "active" && "availability" in root.book).toBe(false);
  });
});

describe("every way of having no book is one refusal on every surface (A-10, R-b)", () => {
  const NO_BOOK_CAUSES: readonly (readonly [string, () => PlantedStores])[] = [
    ["no version was ever published", () => plantStores("none")],
    ["the price store cannot answer", () => plantStores(UNAVAILABLE)],
    [
      "the price store fails with a database error",
      () =>
        plantStores(
          new DashboardStoreError("read the active price version", "database"),
        ),
    ],
    [
      "the stored book does not parse",
      () => plantStores({ versionId: "v-1", book: { not: "a price book" } }),
    ],
    [
      "the stored book's version is not its version's id",
      () =>
        plantStores({
          versionId: "v-1",
          book: SAMPLE_PRICE_BOOK,
          isUnstamped: true,
        }),
    ],
    [
      "the stored book is null",
      () => plantStores({ versionId: "v-1", book: null }),
    ],
    [
      "the availability cannot be read",
      () =>
        plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK }, () =>
          Promise.reject(
            new DashboardStoreError(
              "read the catalogue availability",
              "unavailable",
            ),
          ),
        ),
    ],
  ];

  describe.each(NO_BOOK_CAUSES)("when %s", (_, plant) => {
    it.each(SURFACES)("%s is handed the one no-book root", async (__, draw) => {
      plant();

      expect(priceBookRootOf(await draw())).toBe(NO_PRICE_BOOK);
    });

    it("the contact route makes no ports, so nothing is priced and the request is the one unavailable answer", async () => {
      plant();

      await expect(
        makeContactProductionPorts(new Headers()),
      ).rejects.toMatchObject({
        name: "ContactFailure",
        unavailableCause: "no-price-book",
      });
    });
  });

  it("is never a sample book: no surface prices from anything when the store holds none", async () => {
    plantStores("none");
    const roots: PriceBookRoot[] = [];
    for (const [, draw] of SURFACES) roots.push(priceBookRootOf(await draw()));

    for (const root of roots) expect(root).toStrictEqual({ kind: "none" });
  });
});

describe("a refused visitor costs the price store nothing", () => {
  it("reads no book for the editor, the review or the contact page when the owned load refuses", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    world.ownedLoad = "refused";

    for (const [name, draw] of SURFACES.slice(0, 3)) {
      const page = await draw();
      expect(() => priceBookRootOf(page), name).toThrow("no price-book");
    }

    expect(stores.readActive).not.toHaveBeenCalled();
  });

  it("reads no book for an account page the gate refuses", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    world.accountGate = "forbidden";

    await KitchensPage({ params: Promise.resolve({ locale }) });

    expect(stores.readActive).not.toHaveBeenCalled();
  });

  it("reads no book for a staff page the gate refuses", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    world.staffGate = "forbidden";

    await StaffKitchenPage({
      params: Promise.resolve({ locale, id: DESIGN_ID }),
    }).catch(() => undefined);

    expect(stores.readActive).not.toHaveBeenCalled();
  });

  it("reads no book for a share link that names nothing, or is malformed", async () => {
    const stores = plantStores({ versionId: "v-1", book: SAMPLE_PRICE_BOOK });
    world.shareLookup = "none";

    await SharedDesignPage({ params: Promise.resolve({ token: SHARE_TOKEN }) });
    await SharedDesignPage({ params: Promise.resolve({ token: "short" }) });

    expect(stores.readActive).not.toHaveBeenCalled();
  });
});
