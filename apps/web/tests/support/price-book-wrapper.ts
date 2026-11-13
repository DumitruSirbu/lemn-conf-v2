import { isValidElement, type ReactNode } from "react";

import { PriceBookProvider } from "@/price/price-book-provider";
import type { PriceBookRoot } from "@/price/price-book-root";

// A server page hands its screen to the browser inside the price-book provider (`PriceBookProvider`, R1). A test of what
// the page hands to the screen looks through the provider for the screen, and a test of the book looks at the provider.

interface ProviderProps {
  readonly root: PriceBookRoot;
  readonly children: ReactNode;
}

function providerPropsOf(page: unknown): ProviderProps | undefined {
  if (!isValidElement(page) || page.type !== PriceBookProvider) {
    return undefined;
  }
  return page.props as ProviderProps;
}

/**
 * The screen a page draws, whether or not the page put it inside the price-book provider. Typed as the page, because a
 * test reads the screen's props as the page's own return type declares them.
 */
export function withoutPriceBook<Page>(page: Page): Page {
  return (providerPropsOf(page)?.children ?? page) as Page;
}

/** The root the page handed to the provider; a failure when the page drew no provider at all. */
export function priceBookRootOf(page: unknown): PriceBookRoot {
  const props = providerPropsOf(page);
  if (props === undefined) {
    throw new Error("the page draws no price-book provider");
  }
  return props.root;
}
