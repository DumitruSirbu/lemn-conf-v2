// @vitest-environment happy-dom
// The page a refused design load falls back to (Lot 2 U9b): a signed-in client is also offered their kitchens and told
// the kitchen is unavailable in one sentence that names no cause. The server cannot know the session, so what it draws
// is the reason's own sentence, identically whoever asks; the client action depends on the session alone, never on the
// reason, so what is drawn tells nothing about why the design was refused (criterion 1: one refusal).
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import {
  DesignLoadError,
  type DesignLoadFailureReason,
} from "@/app/d/[id]/design-load-error";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const REASONS: readonly DesignLoadFailureReason[] = [
  "not-found",
  "invalid",
  "unavailable",
];
const CATALOGUES = {
  ro: roMessages,
  ru: ruMessages as typeof roMessages,
} as const;

let screen: MountedScreen | undefined;

function sessionAnswer(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

const clientSession = {
  state: "signed-in",
  email: "ana@example.com",
  capabilities: ["design.read.own"],
};
const staffSession = {
  state: "signed-in",
  email: "staff@example.com",
  capabilities: ["contact.read.all"],
};
const anonymousSession = { state: "anonymous" };

beforeEach(() => {
  resetAccountSessionForTests();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function bodyOf(locale: TestLocale, reason: DesignLoadFailureReason): string {
  const copy = CATALOGUES[locale].designLoadError;
  return {
    "not-found": copy.bodyNotFound,
    invalid: copy.bodyInvalid,
    unavailable: copy.bodyUnavailable,
  }[reason];
}

function escaped(text: string): string {
  const holder = document.createElement("div");
  holder.textContent = text;
  return holder.innerHTML;
}

function serverMarkup(
  locale: TestLocale,
  reason: DesignLoadFailureReason,
): string {
  return renderToString(
    createElement(NextIntlClientProvider, {
      locale,
      messages: CATALOGUES[locale],
      timeZone: "Europe/Chisinau",
      children: createElement(DesignLoadError, { reason }),
    }),
  );
}

async function hydrateWith(
  session: unknown,
  reason: DesignLoadFailureReason,
  locale: TestLocale = "ro",
): Promise<MountedScreen> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => sessionAnswer(session)),
  );
  screen = mountInCatalogue(createElement(DesignLoadError, { reason }), locale);
  await flushPromises(5);
  return screen;
}

const kitchensAnchor = (page: MountedScreen): HTMLAnchorElement | undefined =>
  allIn<HTMLAnchorElement>(page.container, "a").find((anchor) =>
    anchor.getAttribute("href")?.endsWith("/account/kitchens"),
  );

describe("what the server draws", () => {
  it.each(
    REASONS.flatMap((reason) =>
      (["ro", "ru"] as const).map((locale) => [locale, reason] as const),
    ),
  )(
    "%s / %s: the reason's own sentence, no client action and the kitchens' place held",
    (locale, reason) => {
      const markup = serverMarkup(locale, reason);
      expect(markup).toContain(escaped(bodyOf(locale, reason)));
      expect(markup).not.toContain("/account/kitchens");
      expect(markup).not.toContain(
        escaped(CATALOGUES[locale].designLoadError.bodyClient),
      );
      expect(markup).toContain('aria-hidden="true"');
    },
  );

  it("is the same markup whatever the module already knows of the session: a signed-in tab renders what an anonymous one does", async () => {
    const before = serverMarkup("ro", "not-found");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => sessionAnswer(clientSession)),
    );
    screen = mountInCatalogue(
      createElement(DesignLoadError, { reason: "not-found" }),
    );
    await flushPromises(5);
    expect(kitchensAnchor(screen)).toBeDefined();
    expect(serverMarkup("ro", "not-found")).toBe(before);
  });

  it("differs between reasons only by the reason's sentence", () => {
    const sentences = REASONS.map((reason) => bodyOf("ro", reason));
    const stripped = REASONS.map((reason, index) =>
      serverMarkup("ro", reason).replace(
        escaped(sentences[index] ?? ""),
        "BODY",
      ),
    );
    expect(new Set(stripped).size).toBe(1);
  });
});

describe("a client", () => {
  it.each(REASONS)(
    "is offered their kitchens as a plain anchor, whatever the reason (%s)",
    async (reason) => {
      const page = await hydrateWith(clientSession, reason);
      const anchor = kitchensAnchor(page);
      expect(anchor?.getAttribute("href")).toBe("/ro/account/kitchens");
      expect(anchor?.textContent).toBe(roMessages.accountControl.myKitchens);
    },
  );

  it("is told the one sentence that names no cause, for every reason alike", async () => {
    const texts = new Set<string>();
    for (const reason of REASONS) {
      const page = await hydrateWith(clientSession, reason);
      texts.add(page.container.querySelector("p")?.textContent ?? "");
      page.unmount();
      screen = undefined;
      resetAccountSessionForTests();
    }
    expect([...texts]).toEqual([roMessages.designLoadError.bodyClient]);
  });

  it("is offered the Russian words on the Russian site", async () => {
    const page = await hydrateWith(clientSession, "unavailable", "ru");
    expect(kitchensAnchor(page)?.getAttribute("href")).toBe(
      "/ru/account/kitchens",
    );
    expect(kitchensAnchor(page)?.textContent).toBe(
      ruMessages.accountControl.myKitchens,
    );
  });

  it("keeps the way to start over", async () => {
    const page = await hydrateWith(clientSession, "not-found");
    expect(
      allIn(page.container, "a").some(
        (anchor) => anchor.textContent === roMessages.designLoadError.startOver,
      ),
    ).toBe(true);
  });
});

describe("everyone else gets the reason's sentence and nothing more", () => {
  it.each([
    ["a visitor", anonymousSession],
    ["staff", staffSession],
  ])(
    "%s: no kitchens action, no held place, the reason's own sentence",
    async (_, session) => {
      for (const reason of REASONS) {
        resetAccountSessionForTests();
        const page = await hydrateWith(session, reason);
        expect(kitchensAnchor(page)).toBeUndefined();
        expect(page.container.querySelector("[aria-hidden=true]")).toBeNull();
        expect(page.container.querySelector("p")?.textContent).toBe(
          bodyOf("ro", reason),
        );
        page.unmount();
        screen = undefined;
      }
    },
  );

  it("a session that cannot be read counts as nobody", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    screen = mountInCatalogue(
      createElement(DesignLoadError, { reason: "invalid" }),
    );
    await flushPromises(5);
    expect(kitchensAnchor(screen)).toBeUndefined();
    expect(screen.container.querySelector("p")?.textContent).toBe(
      bodyOf("ro", "invalid"),
    );
  });

  it("a refused session request counts as nobody, not as a client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
    );
    screen = mountInCatalogue(
      createElement(DesignLoadError, { reason: "not-found" }),
    );
    await flushPromises(5);
    expect(kitchensAnchor(screen)).toBeUndefined();
  });

  it("holds the action's height while the session is unknown, and shows no anchor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    screen = mountInCatalogue(
      createElement(DesignLoadError, { reason: "not-found" }),
    );
    await flushPromises(5);
    expect(kitchensAnchor(screen)).toBeUndefined();
    expect(screen.container.querySelector("[aria-hidden=true]")).not.toBeNull();
    expect(screen.container.querySelector("p")?.textContent).toBe(
      bodyOf("ro", "not-found"),
    );
  });

  it("never names a reason in the markup other than through its sentence: no reason word reaches the DOM", async () => {
    for (const reason of REASONS) {
      resetAccountSessionForTests();
      const page = await hydrateWith(clientSession, reason);
      expect(page.container.innerHTML).not.toContain(`"${reason}"`);
      expect(page.container.innerHTML).not.toContain(`data-reason`);
      page.unmount();
      screen = undefined;
    }
  });
});
