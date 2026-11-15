// @vitest-environment happy-dom
//
// Adversarial QA of M12 W6f's profile contact block (ADR 0185 decision 7; plan W6f-3 to W6f-5; security S3, S4, N4). The
// implementer's DOM test proves the happy anchors and a handful of refusals. This file attacks what it leaves open: a
// request's contact never reaching a client with no account or no phone, the visible label being part of the accessible
// name, ICU-hostile values in the name, a value that merely looks like a link, a phone whose stored text carries a direction
// control, and the 44 px target resolving to a real size.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAccountSessionForTests } from "@/account/session/use-account-session";
import { isolated } from "@/staff/bidi-isolate";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import type { StaffShellContext } from "@/staff/staff-shell";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { STAFF_KITCHEN_ID, wireKitchen } from "../support/staff-kitchen-wire";
import { installStaffKitchensServer } from "../support/staff-kitchens-wire";

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

const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const CONTEXT: StaffShellContext = {
  role: "operator",
  email: "mihai.rusu@lemnaria.md",
  navigation: ["kitchens"],
};
const KITCHEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}`;
const PROFILE = '[data-testid="staff-kitchen-profile"]';
const WRITE = '[data-testid="staff-kitchen-profile-write"]';
const CALL = '[data-testid="staff-kitchen-profile-call"]';
const CONTACT_ANCHORS = "a[href^='tel:' i], a[href^='mailto:' i]";
const SENT_REQUEST_WITH_OTHER_CONTACT = {
  sentAt: "2026-10-17T11:08:00.000Z",
  name: "Altcineva",
  phone: "+40 721 000 000",
  locality: "Chisinau",
  contactEmail: "other@mail.md",
  email: "other@mail.md",
  address: "Strada Falsa 1",
};
const STAFF_STYLESHEET = readFileSync(
  join(import.meta.dirname, "../../src/staff/staff-kitchen.module.css"),
  "utf8",
);
const GLOBAL_STYLESHEET = readFileSync(
  join(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);
const MINIMUM_TARGET_PX = 44;

let screen: MountedScreen | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetAccountSessionForTests();
  resetStaffSessionExpiryForTests();
  vi.stubGlobal("location", { assign: () => undefined });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mountWith(
  wire: Record<string, unknown>,
  locale: TestLocale,
): Promise<HTMLElement> {
  installStaffKitchensServer().script((request) =>
    request.url.pathname === KITCHEN_ADDRESS
      ? { body: wire }
      : {
          body: {
            state: "signed-in",
            email: CONTEXT.email,
            capabilities: ["design.read.any", "account.manage.own"],
          },
        },
  );
  screen = mountInCatalogue(
    createElement(StaffKitchenScreen, {
      locale,
      context: CONTEXT,
      designId: STAFF_KITCHEN_ID,
    }),
    locale,
  );
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await flushPromises(2);
  return screen.container;
}

function mountClient(
  client: Record<string, unknown>,
  locale: TestLocale,
): Promise<HTMLElement> {
  return mountWith(
    wireKitchen({
      client: {
        email: "ana.popescu@mail.md",
        name: "Ana Popescu",
        phone: "069 123 456",
        address: null,
        ...client,
      },
    }),
    locale,
  );
}

function wordsIn(locale: TestLocale) {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchen",
  });
}

function hrefsOf(root: Element): (string | null)[] {
  return allIn(root, CONTACT_ANCHORS).map((anchor) =>
    anchor.getAttribute("href"),
  );
}

describe.each(LOCALES)("W6f adversarial: the contact block in %s", (locale) => {
  const words = wordsIn(locale);

  it("draws no contact anchor anywhere on the page for a client with no account, whatever contact the request holds", async () => {
    const container = await mountWith(
      wireKitchen({
        client: null,
        request: SENT_REQUEST_WITH_OTHER_CONTACT,
      }),
      locale,
    );

    expect(hrefsOf(container)).toEqual([]);
    expect(container.textContent).not.toContain("other@mail.md");
    expect(container.textContent).not.toContain("+40 721 000 000");
    expect(container.textContent).not.toContain("Strada Falsa 1");
  });

  it("draws no call link and no request phone for a profile without a phone, whatever phone the request holds", async () => {
    const container = await mountWith(
      wireKitchen({
        client: {
          email: "ana.popescu@mail.md",
          name: null,
          phone: null,
          address: null,
        },
        request: SENT_REQUEST_WITH_OTHER_CONTACT,
      }),
      locale,
    );

    expect(allIn(container, CALL)).toHaveLength(0);
    expect(hrefsOf(container)).toEqual(["mailto:ana.popescu@mail.md"]);
    expect(requireIn(container, PROFILE).textContent).not.toContain("721");
    expect(requireIn(container, PROFILE).textContent).not.toContain(
      "Strada Falsa",
    );
  });

  it("draws a profile with nothing but an e-mail as one action and no row for what is absent", async () => {
    const container = await mountClient(
      { name: null, phone: null, address: null },
      locale,
    );

    const profile = requireIn(container, PROFILE);
    expect(hrefsOf(profile)).toEqual(["mailto:ana.popescu@mail.md"]);
    expect(profile.textContent).not.toContain(words("profileAddress"));
    expect(allIn(profile, "a")).toHaveLength(1);
  });

  it("names each action starting with its own visible word (WCAG 2.5.3 label in name)", async () => {
    const container = await mountClient({}, locale);

    for (const selector of [WRITE, CALL]) {
      const anchor = requireIn<HTMLAnchorElement>(container, selector);
      expect(
        anchor.getAttribute("aria-label")?.startsWith(anchor.textContent),
      ).toBe(true);
    }
  });

  it("keeps an apostrophe, a plus and a mixed case of a stored address intact in the href and in the name (no ICU rewriting)", async () => {
    const stored = "O'Neil+Kitchen@Mail.MD";
    const container = await mountClient({ email: stored }, locale);

    const write = requireIn<HTMLAnchorElement>(container, WRITE);
    expect(write.getAttribute("href")).toBe(`mailto:${stored}`);
    expect(write.getAttribute("aria-label")).toBe(
      words("profileWriteTo", { email: isolated(stored) }),
    );
    expect(write.getAttribute("aria-label")).toContain(stored);
  });

  it("draws a typed value that spells a link or markup as text, and makes no anchor of it", async () => {
    const container = await mountClient(
      {
        name: "<a href='tel:+37369123456'>x</a>",
        address: "mailto:evil@x.md?cc=boss@x.md tel:+1 javascript:alert(1)",
      },
      locale,
    );

    const profile = requireIn(container, PROFILE);
    expect(profile.querySelector("a[href*='evil']")).toBeNull();
    expect(profile.querySelector("dd a:not([data-testid])")).toBeNull();
    expect(hrefsOf(profile)).toEqual([
      "mailto:ana.popescu@mail.md",
      "tel:+37369123456",
    ]);
    expect(profile.textContent).toContain("javascript:alert(1)");
    expect(profile.textContent).toContain("<a href='tel:+37369123456'>");
  });

  it("gives neither anchor a target, a rel with opener risk, a download or a ping", async () => {
    const container = await mountClient({}, locale);

    for (const anchor of allIn(requireIn(container, PROFILE), "a")) {
      for (const attribute of ["target", "download", "ping"]) {
        expect(anchor.hasAttribute(attribute)).toBe(false);
      }
      expect(anchor.getAttribute("href")).toMatch(/^(tel|mailto):/);
    }
  });

  it("answers a 5000-character phone, e-mail and address without a link and without losing the page", async () => {
    const container = await mountClient(
      {
        email: `${"a".repeat(5000)}@mail.md`,
        phone: "1".repeat(5000),
        address: "Orhei ".repeat(800),
      },
      locale,
    );

    expect(allIn(container, `${WRITE}, ${CALL}`)).toHaveLength(0);
    expect(requireIn(container, PROFILE).textContent).toContain("Orhei Orhei");
  });

  it("draws an e-mail carrying a direction override as text with no action", async () => {
    const spoofed = "ana@mail.md\u202E";
    const container = await mountClient({ email: spoofed }, locale);

    expect(allIn(container, WRITE)).toHaveLength(0);
    expect(requireIn(container, PROFILE).textContent).toContain(spoofed);
  });

  it("wraps the name of the call between isolate marks and no other control in the dialled number", async () => {
    const container = await mountClient({ phone: "+40 721 000 000" }, locale);

    const label = requireIn(container, CALL).getAttribute("aria-label") ?? "";
    expect(label).toContain("\u2068+40721000000\u2069");
    expect(
      label.match(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu),
    ).toHaveLength(2);
  });

  // FINDING candidate (low severity, defence in depth): the link dials the normal form the domain computes after it has
  // thrown away format characters, but the visible phone is the stored text, shown as it is. A direction override stored
  // inside the number reorders the digits staff READ while "Sună" DIALS the other order. The write path strips format
  // characters (`composeVisibleText`), so the case needs a value stored by another route; the wire reader does not refuse it.
  it("does not show a number that reads differently from the one it dials: a stored phone holding a direction override is not linked or is shown without it", async () => {
    const stored = "+373\u202E78900555";
    const container = await mountClient({ phone: stored }, locale);

    const profile = requireIn(container, PROFILE);
    const isLinked = allIn(profile, CALL).length > 0;
    const showsOverride = profile.textContent.includes("\u202E");
    expect(isLinked && showsOverride).toBe(false);
  });
});

describe("W6f adversarial: the stylesheet of the two actions", () => {
  it("resolves the shared touch-target variable to at least 44 px and uses it for both dimensions", () => {
    const declared = /--touch-target:\s*(\d+)px/.exec(GLOBAL_STYLESHEET)?.[1];
    const rule = /\.factAction\s*\{([^}]*)\}/.exec(STAFF_STYLESHEET)?.[1] ?? "";

    expect(Number(declared)).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
    expect(rule).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(rule).toMatch(/min-width:\s*var\(--touch-target\)/);
    expect(rule).not.toMatch(
      /(^|[;\s])(max-height|height|max-width|width)\s*:/,
    );
  });

  it("isolates the profile value's own text from the sentence around it", () => {
    const rule = /\.factValue\s*\{([^}]*)\}/.exec(STAFF_STYLESHEET)?.[1] ?? "";

    expect(rule).toMatch(/unicode-bidi:\s*isolate/);
  });
});
