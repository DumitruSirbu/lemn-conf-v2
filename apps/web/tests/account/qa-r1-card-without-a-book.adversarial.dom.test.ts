// @vitest-environment happy-dom
// Adversarial QA for M10 wave R1, criterion R-b, the account's card: with no book to price from, every kitchen of the list
// is still listed and opened, and none shows a price, a "from" prefix or a zero. The same list under a book shows both, so a
// card that shows no price because the list failed to draw cannot pass.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";
import { NO_PRICE_BOOK } from "@/price/price-book-root";

import roMessages from "../../src/messages/ro.json";
import { wireKitchen, wirePage } from "../support/account-kitchens-wire";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));

const { KitchensScreen } = await import("@/account/kitchens/kitchens-screen");

const A_PRICE = /\d[\d\s]*MDL/u;
const KITCHEN_COUNT = 3;

let screen: MountedScreen | undefined;

beforeEach(() => {
  sendSignedInRequest.mockImplementation(
    (request: SignedInRequest): Promise<SignedInOutcome> =>
      Promise.resolve(
        request.flow === "kitchens"
          ? {
              kind: "received",
              body: wirePage(
                [1, 2, 3].map((serial) =>
                  wireKitchen(serial, { name: `Casa ${String(serial)}` }),
                ),
                { total: KITCHEN_COUNT },
              ),
            }
          : { kind: "succeeded" },
      ),
  );
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

async function openListUnder(
  priceBook: typeof NO_PRICE_BOOK | typeof SAMPLE_PRICE_ROOT,
): Promise<MountedScreen> {
  screen = mountInCatalogue(
    createElement(KitchensScreen, { locale: "ro" }),
    "ro",
    priceBook,
  );
  await flushPromises(5);
  return screen;
}

describe("the account's kitchens without a book", () => {
  it("lists every kitchen and shows no price on any card", async () => {
    const page = await openListUnder(NO_PRICE_BOOK);

    expect(allIn(page.container, "article")).toHaveLength(KITCHEN_COUNT);
    expect(page.container.textContent).not.toContain(
      roMessages.price.startingPrefix,
    );
    expect(page.container.textContent).not.toMatch(A_PRICE);
    expect(page.container.textContent).not.toMatch(/\b0\s*MDL/u);
  });

  it("shows a price on every card under a book, which is what the case above lacks", async () => {
    const page = await openListUnder(SAMPLE_PRICE_ROOT);

    const priced = allIn(page.container, "article").filter((card) =>
      A_PRICE.test(card.textContent),
    );
    expect(priced).toHaveLength(KITCHEN_COUNT);
  });
});
