// Mounts a React element in a real root inside the shipped catalogue, the way the DOM tests of this project mount a
// screen: `react-dom/client` through `act`, no testing library. The catalogue is the real `ro.json` or `ru.json`, so a
// test reads the words a person reads.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

export type TestLocale = "ro" | "ru";

// `Messages` is typed from the Romanian catalogue (`global.d.ts`), whose literal strings the Russian one cannot match.
const CATALOGUE_OF: Readonly<Record<"ro" | "ru", typeof roMessages>> = {
  ro: roMessages,
  ru: ruMessages as typeof roMessages,
};

export interface MountedScreen {
  readonly container: HTMLDivElement;
  readonly unmount: () => void;
}

export function mountInCatalogue(
  element: ReactElement,
  locale: TestLocale = "ro",
): MountedScreen {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale,
        messages: CATALOGUE_OF[locale],
        timeZone: "Europe/Chisinau",
        children: element,
      }),
    );
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** The elements matching a selector, as a typed array. */
export function allIn<Element extends HTMLElement = HTMLElement>(
  container: ParentNode,
  selector: string,
): Element[] {
  return Array.from(container.querySelectorAll<Element>(selector));
}

/** The one element matching, or a failure that names the selector. */
// A generic that only types the return, as `querySelector`'s own signature does: the caller states the element it expects.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- see above.
export function requireIn<Element extends HTMLElement = HTMLElement>(
  container: ParentNode,
  selector: string,
): Element {
  const found = container.querySelector<Element>(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** A button or link found by the words it shows (or its accessible name). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- a return-type-only generic, as `requireIn`.
export function byWords<Element extends HTMLElement = HTMLElement>(
  container: ParentNode,
  selector: string,
  words: string,
): Element {
  const found = allIn<Element>(container, selector).find(
    (candidate) =>
      candidate.textContent.trim() === words ||
      candidate.getAttribute("aria-label") === words,
  );
  if (found === undefined) throw new Error(`no ${selector} says "${words}"`);
  return found;
}

export function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

/** Types into a controlled input the way a keystroke does: through the prototype's setter, because React tracks `value`
 *  on the element and a plain assignment would make the `input` event look like no change. */
export function typeInto(input: HTMLInputElement, value: string): void {
  const valueProperty = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  act(() => {
    valueProperty?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Submits the first form in the container, as pressing its submit button does after the browser's own checks. */
export function submitFormIn(container: ParentNode): void {
  act(() => {
    requireIn<HTMLFormElement>(container, "form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
