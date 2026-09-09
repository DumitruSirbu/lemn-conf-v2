// Adversarial QA for M6 remediation wave B, ingress half: `use-priced-design.ts` parses the book at
// **module scope**.
//
// That moves the failure mode M6-AUD-002 named rather than only fixing it. A refusal returned from
// `parsePriceBook` degrades the price and keeps the application; anything the parser *raises*
// happens while the module is being evaluated, before any component exists to fail — so no error
// boundary, no `UnreadablePriceBookError`, and no render at all. These cases hold the parser to the
// contract its own header states, at the one call site where breaking it is worst.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

/** The store state the hook under test reads — the real store, so the hook composes over real
 *  fields rather than over a fixture shaped like them. */
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

/** React's server renderer is this suite's only renderer (M4 wave 4A: no jsdom, no RTL), and the
 *  claim under test is what the hook composes rather than how it reacts. */
function readFromHook<TValue>(useHook: () => TValue): TValue {
  let seen: TValue | undefined;
  function Probe() {
    seen = useHook();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (seen === undefined) throw new Error("the hook produced nothing");
  return seen;
}

/** Loads the pricing composition root over a supplied sample book, from a fresh module registry so
 *  the module-scope parse runs again for each case. */
async function loadPricingRootShipping(book: unknown) {
  vi.resetModules();
  vi.doMock("@lemnaria/configurator-domain", async (importActual) => {
    const actual =
      await importActual<typeof import("@lemnaria/configurator-domain")>();
    return { ...actual, SAMPLE_PRICE_BOOK: book };
  });
  return import("@/price/use-priced-design");
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

describe("a book this build ships that cannot be read", () => {
  it("evaluates the module and answers a refusal for a book missing a section", () => {
    // The M6-AUD-002 reproduction, at the ingress: the section `listRuleIds` used to dereference
    // bare. What the customer loses is the figure; what they keep is the application.
    const malformed = { ...KITCHEN_L_DESIGN } as unknown as PriceBook;

    return loadPricingRootShipping(malformed).then((pricingRoot) => {
      const result = readFromHook(pricingRoot.usePricedDesign);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe("INVALID_PRICE_BOOK");
    });
  });

  it("evaluates the module for a book carrying a value JSON cannot render", async () => {
    // `describeDeclared` stringifies whatever the book declared, and `JSON.stringify` raises for a
    // BigInt. At module scope that is not a refusal a surface renders — it is the module failing to
    // load, and every component that imports it going with it.
    const unrenderable = { version: 1n } as unknown as PriceBook;

    await expect(loadPricingRootShipping(unrenderable)).resolves.toBeDefined();
  });
});
