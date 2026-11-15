// @vitest-environment happy-dom
//
// The profile contact block of the staff kitchen page (ADR 0185 decision 7; plan W6f-3 to W6f-5): the two actions, their
// addresses and accessible names, the locality row, and the account-less client. Which values earn a link is
// `contact-links.test.ts`'s; this file holds what the page draws from it.
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
const REQUEST_CARD = '[data-testid="staff-kitchen-request"]';
const STYLESHEET = readFileSync(
  join(import.meta.dirname, "../../src/staff/staff-kitchen.module.css"),
  "utf8",
);

interface ClientOverrides {
  readonly email?: string;
  readonly name?: string | null;
  readonly phone?: string | null;
  readonly address?: string | null;
}

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
  client: ClientOverrides,
  locale: TestLocale,
): Promise<HTMLElement> {
  const profile = {
    email: "ana.popescu@mail.md",
    name: "Ana Popescu",
    phone: "069 123 456",
    address: null,
    ...client,
  };
  return mountWith(wireKitchen({ client: profile }), locale);
}

function wordsIn(locale: TestLocale) {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchen",
  });
}

function listsIn(locale: TestLocale) {
  return createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffKitchens",
  });
}

describe.each(LOCALES)("the profile contact block in %s", (locale) => {
  const words = wordsIn(locale);
  const lists = listsIn(locale);

  it("writes to the stored e-mail and calls the phone's normal form, as anchors with visible text and no target", async () => {
    const container = await mountClient({}, locale);

    const write = requireIn<HTMLAnchorElement>(container, WRITE);
    const call = requireIn<HTMLAnchorElement>(container, CALL);
    expect(write.tagName).toBe("A");
    expect(write.getAttribute("href")).toBe("mailto:ana.popescu@mail.md");
    expect(write.textContent).toBe(words("profileWrite"));
    expect(call.tagName).toBe("A");
    expect(call.getAttribute("href")).toBe("tel:+37369123456");
    expect(call.textContent).toBe(words("profileCall"));
    for (const anchor of [write, call]) {
      expect(anchor.hasAttribute("target")).toBe(false);
      expect(requireIn(container, PROFILE).contains(anchor)).toBe(true);
    }
  });

  it("names each action by its value, isolated, and the call by the dialled number rather than the typed text", async () => {
    const container = await mountClient({}, locale);

    expect(requireIn(container, WRITE).getAttribute("aria-label")).toBe(
      words("profileWriteTo", { email: isolated("ana.popescu@mail.md") }),
    );
    expect(requireIn(container, CALL).getAttribute("aria-label")).toBe(
      words("profileCallTo", { phone: isolated("+37369123456") }),
    );
    expect(requireIn(container, PROFILE).textContent).toContain("069 123 456");
  });

  it("keeps the phone's 'unverified' beside it and shows the typed phone as text", async () => {
    const container = await mountClient({}, locale);

    const profile = requireIn(container, PROFILE).textContent;
    expect(profile).toContain(`069 123 456${lists("phoneUnverified")}`);
  });

  it.each([
    ["a phone with letters", { phone: "069 123 45x" }, "call"],
    [
      "a phone with a javascript scheme",
      { phone: "javascript:alert(1)" },
      "call",
    ],
    ["a phone with a line break", { phone: "069 123\n456" }, "call"],
    ["a phone too short to dial", { phone: "069 123" }, "call"],
    [
      "an e-mail carrying a cc query",
      { email: "ana@mail.md?cc=boss@mail.md" },
      "write",
    ],
    [
      "an e-mail carrying an encoded line break",
      { email: "ana@mail.md%0Abcc:x@y.md" },
      "write",
    ],
    ["an e-mail with a space", { email: "ana popescu@mail.md" }, "write"],
    [
      "an e-mail with a letter outside ASCII",
      { email: "ané@mail.md" },
      "write",
    ],
  ] as const)(
    "draws %s as text with no action of that kind",
    async (_, client, kind) => {
      const container = await mountClient(client, locale);

      const typed = "phone" in client ? client.phone : client.email;
      expect(allIn(container, kind === "call" ? CALL : WRITE)).toHaveLength(0);
      expect(requireIn(container, PROFILE).textContent).toContain(typed);
      expect(
        allIn(container, "a[href^='tel:' i], a[href^='mailto:' i]").map(
          (anchor) => anchor.getAttribute("href"),
        ),
      ).toEqual(
        kind === "call" ? ["mailto:ana.popescu@mail.md"] : ["tel:+37369123456"],
      );
    },
  );

  it("offers no call to a client with no phone, and still offers to write", async () => {
    const container = await mountClient({ phone: null }, locale);

    expect(allIn(container, CALL)).toHaveLength(0);
    expect(allIn(container, WRITE)).toHaveLength(1);
    expect(requireIn(container, PROFILE).textContent).not.toContain(
      lists("phoneUnverified"),
    );
  });

  it("offers neither action to a client with no account, and says so", async () => {
    const container = await mountWith(wireKitchen({ client: null }), locale);

    expect(allIn(container, `${WRITE}, ${CALL}`)).toHaveLength(0);
    expect(requireIn(container, PROFILE).textContent).toContain(
      lists("noAccount"),
    );
  });

  it("draws the locality row, labelled as the profile words it, as text, only when the profile holds one", async () => {
    const container = await mountClient(
      { address: "Orhei, str. <b>Florilor</b> 4" },
      locale,
    );

    const profile = requireIn(container, PROFILE);
    expect(profile.textContent).toContain(
      `${words("profileAddress")}Orhei, str. <b>Florilor</b> 4`,
    );
    expect(profile.querySelector("b")).toBeNull();
    expect(allIn(profile, "a[href]")).toHaveLength(2);
  });

  it("draws no locality row for a profile without an address", async () => {
    const container = await mountClient({ address: null }, locale);

    expect(requireIn(container, PROFILE).textContent).not.toContain(
      words("profileAddress"),
    );
  });

  it("reads the client's contact from the profile alone: a request holding other contact values changes nothing", async () => {
    const container = await mountWith(
      wireKitchen({
        request: {
          sentAt: "2026-10-17T11:08:00.000Z",
          name: "Altcineva",
          phone: "+40 721 000 000",
          locality: "Chisinau",
          contactEmail: "other@mail.md",
        },
      }),
      locale,
    );

    expect(
      allIn(container, "a[href^='tel:' i], a[href^='mailto:' i]").map(
        (anchor) => anchor.getAttribute("href"),
      ),
    ).toEqual(["mailto:ana.popescu@mail.md", "tel:+37378900555"]);
    expect(allIn(container, REQUEST_CARD)).toHaveLength(1);
    expect(requireIn(container, REQUEST_CARD).textContent).not.toContain(
      "Altcineva",
    );
  });
});

describe("the stylesheet of the two actions", () => {
  it("makes each at least 44 px both ways, by the shared touch-target size", () => {
    const rule = /\.factAction\s*\{([^}]*)\}/.exec(STYLESHEET)?.[1] ?? "";

    expect(rule).toMatch(/min-height:\s*var\(--touch-target\)/);
    expect(rule).toMatch(/min-width:\s*var\(--touch-target\)/);
  });
});
