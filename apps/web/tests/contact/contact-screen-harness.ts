// The contact page rendered as a customer meets it, with real events. A test file that uses this declares the mocks
// for the scene probe, the locale menu and the editor's exit screen itself (`vi.mock` is per file); here is only what
// they share: the render, the typing, the leaving of a field and the press.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

import { ContactScreen } from "@/contact/contact-screen";
import { CONTACT_SUBMISSIONS_ENDPOINT } from "@/contact/send-contact-request";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { DESIGN_ID, FIRST_REVISION } from "./contact-submission-harness";

export const MESSAGES = { ro: roMessages, ru: ruMessages } as const;
export type ScreenLocale = keyof typeof MESSAGES;

export interface MountedScreen {
  readonly container: HTMLElement;
  readonly unmount: () => void;
}

export interface ScreenOptions {
  readonly design?: Design;
  readonly locale?: ScreenLocale;
}

export function mountContactScreen(options: ScreenOptions = {}): MountedScreen {
  const { design = KITCHEN_L_DESIGN, locale = "ro" } = options;
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  useConfiguratorStore.getState().hydrate({
    design,
    designId: DESIGN_ID,
    revision: FIRST_REVISION,
    canWrite: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale,
        messages: MESSAGES[locale] as typeof roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(ContactScreen, { designId: DESIGN_ID }),
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

/** What the page sent to the contact endpoint, as parsed JSON, and every other request it made. */
export interface RecordedTraffic {
  readonly contactBodies: Record<string, unknown>[];
  readonly otherUrls: string[];
}

/** A `fetch` that records and never answers: a request stays outstanding, as it does while the server is working. */
export function recordTraffic(): RecordedTraffic {
  const traffic: RecordedTraffic = { contactBodies: [], otherUrls: [] };
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (
      url === CONTACT_SUBMISSIONS_ENDPOINT &&
      typeof init?.body === "string"
    ) {
      traffic.contactBodies.push(
        JSON.parse(init.body) as Record<string, unknown>,
      );
    } else {
      traffic.otherUrls.push(url);
    }
    return new Promise<Response>(() => undefined);
  });
  return traffic;
}

type ElementKind<T extends HTMLElement> = abstract new (
  ...constructorArguments: never[]
) => T;

/** The one element a selector names, of the kind the caller needs; a page that draws none or another is a failure. */
export function elementIn(container: ParentNode, selector: string): HTMLElement;
export function elementIn<T extends HTMLElement>(
  container: ParentNode,
  selector: string,
  kind: ElementKind<T>,
): T;
export function elementIn(
  container: ParentNode,
  selector: string,
  kind: ElementKind<HTMLElement> = HTMLElement,
): HTMLElement {
  const element = container.querySelector(selector);
  if (element === null) throw new Error(`nothing matches ${selector}`);
  if (!(element instanceof kind)) {
    throw new Error(`${selector} is not a ${kind.name}`);
  }
  return element;
}

export function inputNamed(
  container: ParentNode,
  name: string,
): HTMLInputElement {
  return elementIn(container, `input[name="${name}"]`, HTMLInputElement);
}

/** What a keyboard does to a controlled input: the value changes and the page is told. */
export function typeInto(input: HTMLInputElement, text: string): void {
  act(() => {
    // The prototype's setter, so that React's own record of the value does not hide the change from it.
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The customer moves on from a field: focus is in it, then goes elsewhere. */
export function leave(input: HTMLInputElement): void {
  act(() => {
    input.focus();
  });
  act(() => {
    input.blur();
  });
}

export function typeAndLeave(input: HTMLInputElement, text: string): void {
  typeInto(input, text);
  leave(input);
}

export function tickConsent(container: ParentNode): void {
  act(() => {
    inputNamed(container, "consent").click();
  });
}

export const VALID_NAME = "Ana Popescu";
export const VALID_PHONE = "069 123 456";
export const VALID_LOCALITY = "Chisinau";

export function fillNameAndLocality(container: ParentNode): void {
  typeInto(inputNamed(container, "name"), VALID_NAME);
  typeInto(inputNamed(container, "locality"), VALID_LOCALITY);
}

export function fillWholeForm(container: ParentNode): void {
  fillNameAndLocality(container);
  typeInto(inputNamed(container, "phone"), VALID_PHONE);
  tickConsent(container);
}

/** A press as a finger does it: a click on the call to action, which submits the form it is in. */
export function pressCallToAction(container: ParentNode): void {
  act(() => {
    elementIn(
      container,
      '[data-testid="contact-cta"]',
      HTMLButtonElement,
    ).click();
  });
}

/** The error sentences standing now, in document order, without the mark that stands before each. */
export function sentencesShown(container: ParentNode): string[] {
  return [...container.querySelectorAll('[role="alert"]')].map(
    (alert) => alert.lastElementChild?.textContent ?? "",
  );
}
