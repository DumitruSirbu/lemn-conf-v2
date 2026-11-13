// The one screen a DOM test has mounted, read and driven by test id. State is the module's, so a suite calls
// `unmountScreen` in `afterEach` and each test mounts its own.
import { act, createElement, type ReactElement } from "react";

import { GlobalSettings } from "@/settings/global-settings";
import type { PriceBookRoot } from "@/price/price-book-root";

import { mountInCatalogue, type MountedScreen } from "./render-with-intl";

const DEFAULT_VISIBLE_SETTING_COUNT = 3;

let mounted: MountedScreen | undefined;

export function mountScreen(
  element: ReactElement,
  priceBook: PriceBookRoot,
): MountedScreen {
  mounted = mountInCatalogue(element, "ro", priceBook);
  return mounted;
}

/** The settings pill and sheet alone, in a `<main>` as the page has them. */
export function mountSettings(
  priceBook: PriceBookRoot,
  visibleCount: number = DEFAULT_VISIBLE_SETTING_COUNT,
): MountedScreen {
  return mountScreen(
    createElement(
      "main",
      null,
      createElement(GlobalSettings, { visibleCount }),
    ),
    priceBook,
  );
}

export function unmountScreen(): void {
  mounted?.unmount();
  mounted = undefined;
}

export function within(): HTMLElement {
  if (mounted === undefined) throw new Error("nothing is mounted");
  return mounted.container;
}

export function all(testId: string): HTMLElement[] {
  return [
    ...within().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];
}

export function one(testId: string): HTMLElement {
  const found = all(testId)[0];
  if (found === undefined) throw new Error(`no element has test id ${testId}`);
  return found;
}

export function press(testId: string): void {
  act(() => {
    one(testId).click();
  });
}

export function openSheet(): void {
  press("global-settings-trigger");
}
