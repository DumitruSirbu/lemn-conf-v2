// @vitest-environment happy-dom
//
// The read-only link card under the picture of the staff kitchen page: the address as text, the button that copies it
// and says how that went, and the origin the address is written under. The server is a stand-in for `fetch`; the 3D
// canvas is a stub.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenIn3dLink } from "@/staff/staff-kitchen-3d-link";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { click, requireIn, type TestLocale } from "../support/render-with-intl";
import {
  STAFF_KITCHEN_ID,
  wireDraftKitchen,
  wireKitchen,
} from "../support/staff-kitchen-wire";
import {
  FEWER_BODIES_DESIGN,
  PAGE_ORIGIN,
  chooseVersion,
  mountWith,
  inPage,
  server,
  setUpLinkCardPage,
  settle,
  stubClipboard,
} from "../support/staff-link-card-page";

const headersOfTheRequest = vi.hoisted(() => vi.fn());

// A forged `Host` a caller could send. The card is drawn in the browser, so nothing of the request reaches it; the mock
// is how the test would hear of any attempt to read one.
vi.mock("next/headers", () => ({ headers: headersOfTheRequest }));

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () =>
      element("canvas", { "data-testid": "stub-canvas" }),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const FORGED_HOST = "evil.example";
const CARD = "staff-kitchen-link";
const ADDRESS = "staff-kitchen-link-address";
const COPY_BUTTON = "staff-kitchen-link-copy";
const OUTCOME = "staff-kitchen-link-outcome";
const OPEN_LINK = "staff-kitchen-open-3d";

setUpLinkCardPage();

beforeEach(() => {
  headersOfTheRequest.mockReset();
  headersOfTheRequest.mockReturnValue(
    new Headers({ host: FORGED_HOST, "x-forwarded-host": FORGED_HOST }),
  );
});

function addressText(): string {
  return inPage(ADDRESS).textContent;
}

async function pressCopy(): Promise<void> {
  click(inPage(COPY_BUTTON));
  await settle();
}

describe.each(LOCALES)("the link card in %s", (locale) => {
  const words = CATALOGUES[locale].staffKitchen;
  const path = `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d`;

  it("stands under the picture with its title, its read-only badge and its note", async () => {
    await mountWith(wireKitchen(), locale);

    const card = inPage(CARD);
    expect(card.textContent).toContain(words.linkTitle);
    expect(card.textContent).toContain(words.linkBadge);
    expect(card.textContent).toContain(words.linkNote);
    const view = inPage("staff-kitchen-view");
    expect(
      view.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("writes the address as the page origin and the staff 3D route, and links to that route", async () => {
    await mountWith(
      wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } }),
      locale,
    );

    expect(addressText()).toBe(`${PAGE_ORIGIN}${path}?version=sent`);
    expect(inPage(OPEN_LINK).getAttribute("href")).toBe(`${path}?version=sent`);
  });

  it("changes the address text and the link's href together when the version changes", async () => {
    await mountWith(
      wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } }),
      locale,
    );

    chooseVersion("current");

    expect(addressText()).toBe(`${PAGE_ORIGIN}${path}?version=current`);
    expect(inPage(OPEN_LINK).getAttribute("href")).toBe(
      `${path}?version=current`,
    );
  });

  it("names no copy when the page has no version switch", async () => {
    await mountWith(wireDraftKitchen(), locale);

    expect(addressText()).toBe(`${PAGE_ORIGIN}${path}`);
  });

  it("keeps the new tab and the opener protection on the link that opens the view", async () => {
    await mountWith(wireKitchen(), locale);

    const link = inPage(OPEN_LINK);
    expect(link.textContent).toBe(words.open3d);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual([
      "noopener",
      "noreferrer",
    ]);
  });

  it("keeps its live region on the page from the start, polite and empty, so the first answer is announced", async () => {
    await mountWith(wireKitchen(), locale);

    const outcome = inPage(OUTCOME);
    expect(outcome.getAttribute("role")).toBe("status");
    expect(outcome.getAttribute("aria-live")).toBe("polite");
    expect(outcome.textContent).toBe("");
  });

  it("copies exactly the address it shows and says so in the live region", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    await mountWith(
      wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } }),
      locale,
    );
    const requestsBefore = server?.requests.length;

    await pressCopy();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(addressText());
    expect(inPage(OUTCOME).textContent).toBe(words.linkCopied);
    expect(server?.requests.length).toBe(requestsBefore);
  });

  it("stops saying the address was copied once the version, and so the address, has changed", async () => {
    stubClipboard(() => Promise.resolve());
    await mountWith(
      wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } }),
      locale,
    );
    await pressCopy();

    chooseVersion("current");

    expect(inPage(OUTCOME).textContent).toBe("");
  });

  it.each([
    [
      "a clipboard that rejects",
      () => {
        stubClipboard(() => Promise.reject(new Error("denied")));
      },
    ],
    [
      "a clipboard whose write throws at once",
      () => {
        stubClipboard(() => {
          throw new Error("blocked");
        });
      },
    ],
    [
      "a browser with no clipboard",
      () => {
        vi.stubGlobal("navigator", {});
      },
    ],
  ])(
    "says the copy was refused with %s, leaves the address as text, and throws nothing",
    async (_, installClipboard) => {
      installClipboard();
      await mountWith(wireKitchen(), locale);
      const shown = addressText();

      await pressCopy();

      expect(inPage(OUTCOME).textContent).toBe(words.linkCopyRefused);
      expect(addressText()).toBe(shown);
      expect(inPage(OPEN_LINK).getAttribute("href")).not.toBeNull();
    },
  );

  it("takes its origin from the page, never from a request's Host or X-Forwarded-Host", async () => {
    await mountWith(wireKitchen(), locale);

    expect(addressText().startsWith(`${PAGE_ORIGIN}/`)).toBe(true);
    expect(addressText()).not.toContain(FORGED_HOST);
    expect(inPage(CARD).outerHTML).not.toContain(FORGED_HOST);
    expect(headersOfTheRequest).not.toHaveBeenCalled();
  });

  it.each(["null", "file://", "javascript:alert(1)", "", undefined])(
    "writes the route alone when the page's origin is %s, which is no web origin",
    async (origin) => {
      vi.stubGlobal("location", { assign: () => undefined, origin });
      await mountWith(wireKitchen(), locale);

      expect(addressText().startsWith("/")).toBe(true);
      expect(addressText()).toContain(path);
    },
  );
});

describe.each(LOCALES)("the link card's markup in %s", (locale) => {
  it("agrees between the server and the first browser render, then takes the page's origin", async () => {
    const element = createElement(NextIntlClientProvider, {
      locale,
      messages: CATALOGUES[locale] as typeof roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(OpenIn3dLink, {
        locale,
        kitchenId: STAFF_KITCHEN_ID,
        version: "sent",
      }),
    });
    const route = `/${locale}/staff/kitchens/${STAFF_KITCHEN_ID}/3d?version=sent`;
    const onServer = renderToString(element);
    const container = document.createElement("div");
    container.innerHTML = onServer;
    document.body.append(container);
    const complaints = vi.spyOn(console, "error").mockImplementation(() => {
      // React reports a hydration mismatch here, which is the failure this test is for.
    });

    expect(onServer).toContain(route);
    expect(onServer).not.toContain(PAGE_ORIGIN);
    const root = await hydrateInAct(container, element);

    expect(complaints).not.toHaveBeenCalled();
    expect(requireIn(container, `[data-testid="${ADDRESS}"]`).textContent).toBe(
      `${PAGE_ORIGIN}${route}`,
    );
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

async function hydrateInAct(
  container: HTMLElement,
  element: ReactElement,
): Promise<Root> {
  let root: Root | undefined;
  await act(() => {
    root = hydrateRoot(container, element);
    return Promise.resolve();
  });
  if (root === undefined) throw new Error("nothing was hydrated");
  return root;
}
