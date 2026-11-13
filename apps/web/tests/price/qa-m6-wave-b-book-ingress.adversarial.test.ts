// @vitest-environment happy-dom
// Adversarial QA for M6 remediation wave B, ingress half, moved by M10 wave R1 to where the book now enters.
//
// The book is no longer parsed at module scope of the browser's hook: the server parses the active version once per
// request, in `readActivePriceBook`. The premise survives the move and gets sharper. A refusal returned from
// `parsePriceBook` degrades the price and keeps the application; anything the parser *raises* happens inside the page's
// server component, before any component exists to fail, so the customer gets no page at all. These cases hold the
// parser to the contract its own header states, at the one call site where breaking it is worst, with the stored book
// (not a book this build ships) as the hostile input.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import type {
  CatalogueAvailabilityStore,
  PriceBookStore,
} from "@lemnaria/persistence";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { usePricedDesign } from "@/price/use-priced-design";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { renderHook } from "../support/render-hook";

const VERSION_ID = "the-stored-version";

/** The store state the hook under test reads: the real store, so the hook composes over real fields. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

function storesHoldingStoredBook(book: unknown) {
  return {
    priceBook: {
      readActive: () =>
        Promise.resolve({
          kind: "found" as const,
          version: {
            versionId: VERSION_ID,
            sequenceNumber: 1,
            label: "Stored",
            publishedAt: new Date(0),
            book,
          },
        }),
    } as unknown as PriceBookStore,
    availability: {
      readCurrent: () => Promise.resolve({ revision: "0", disabled: [] }),
    } as unknown as CatalogueAvailabilityStore,
  };
}

function aSampleBookWith(section: string, value: unknown): unknown {
  return { ...SAMPLE_PRICE_BOOK, [section]: value };
}

beforeEach(() => {
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-07T12:00:00.000Z",
  });
  storeState.current = store.getState();
});

describe("a stored book that cannot be read", () => {
  it("is no book for a book missing a section, and the price hook then answers a refusal", async () => {
    // The M6-AUD-002 reproduction, at the ingress: the section `listRuleIds` used to dereference bare. What the
    // customer loses is the figure; what they keep is the application.
    const malformed = { ...KITCHEN_L_DESIGN };

    const root = await readActivePriceBook(storesHoldingStoredBook(malformed));

    expect(root).toBe(NO_PRICE_BOOK);
    const hook = renderHook(usePricedDesign, (children) => children, root);
    const result = hook.result.current;
    hook.unmount();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
  });

  it("is no book, and not a raised error, for a book carrying a value JSON cannot render", async () => {
    // `describeDeclared` stringifies whatever the book declared, and `JSON.stringify` raises for a BigInt. In the page's
    // server component that would not be a refusal a surface renders: it would be the request failing outright.
    const unrenderable = { version: 1n };

    await expect(
      readActivePriceBook(storesHoldingStoredBook(unrenderable)),
    ).resolves.toBe(NO_PRICE_BOOK);
  });

  it("never raises, whatever one section of the sample book is replaced by", async () => {
    const sections = Object.keys(SAMPLE_PRICE_BOOK);
    const hostileValue = fc.anything({
      withBigInt: true,
      withNullPrototype: true,
      withObjectString: true,
      withSparseArray: true,
      withTypedArray: true,
    });

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...sections),
        hostileValue,
        async (section, value) => {
          const root = await readActivePriceBook(
            storesHoldingStoredBook(aSampleBookWith(section, value)),
          );

          expect(root.kind === "none" || root.versionId === VERSION_ID).toBe(
            true,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never raises for a stored book that is any value at all", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.anything({ withBigInt: true, withNullPrototype: true }),
        async (stored) => {
          const root = await readActivePriceBook(
            storesHoldingStoredBook(stored),
          );

          expect(root.kind === "none" || root.versionId === VERSION_ID).toBe(
            true,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
