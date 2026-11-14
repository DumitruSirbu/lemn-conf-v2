// @vitest-environment happy-dom
//
// QA of M11 W2b, adversarial. `profile-prefill.dom.test.ts` answers both account reads at once; this file holds them,
// answers them late and out of order, and feeds them what the routes would never send. It adds cases that file lacks:
// typing between the two reads, a reordered session read, a profile that arrives after the session ended, hostile
// shapes, an e-mail that is markup, the L3 reset in the gaps the developer named, and a profile that arrives after a
// send.
//
// What this cannot see: layout of the line at 390 px, the real routes' answers, a real back-forward cache restore.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROLES } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => createElement("div", { "data-testid": "locale-menu" }),
}));

import { CallbackContactScreen } from "@/contact/contact-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  elementIn,
  inputNamed,
  leave,
  MESSAGES,
  mountContactScreen,
  PROFILE_URL,
  pressCallToAction,
  SESSION_URL,
  signedInSession,
  tickConsent,
  typeInto,
  VALID_LOCALITY,
  VALID_NAME,
  VALID_PHONE,
  type MountedScreen,
  type ScreenLocale,
  type ServerAnswer,
} from "./contact-screen-harness";
import {
  DeferredAccountWire,
  settleChainedReads,
  type Mode,
  type RawAnswer,
} from "./support/deferred-account-wire";

const ANA = "ana@mail.md";
const ION = "ion@mail.md";
const ANA_SESSION = signedInSession(ANA, [...ROLES.client]);
const ION_SESSION = signedInSession(ION, [...ROLES.client]);
const VISITOR: ServerAnswer = { status: 200, body: { state: "anonymous" } };
const UNREACHABLE: ServerAnswer = "network-failure";

const FULL_PROFILE = {
  name: "Ana Popescu",
  address: "Chisinau",
  phone: "069 123 456",
};
const EMPTY_PROFILE = { name: null, address: null, phone: null };

function ok(body: unknown): ServerAnswer {
  return { status: 200, body };
}

function mountCallback(locale: ScreenLocale, isStrict = false): MountedScreen {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const page = createElement(NextIntlClientProvider, {
    locale,
    messages: MESSAGES[locale] as typeof MESSAGES.ro,
    timeZone: "Europe/Chisinau",
    children: createElement(CallbackContactScreen, { isSendable: true }),
  });
  act(() => {
    root.render(isStrict ? createElement(StrictMode, null, page) : page);
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

interface Page {
  readonly title: string;
  readonly mount: (locale: ScreenLocale) => MountedScreen;
}

const PAGES: readonly Page[] = [
  {
    title: "the design's contact page",
    mount: (locale) => mountContactScreen({ locale }),
  },
  {
    title: "the callback contact page",
    mount: (locale) => mountCallback(locale),
  },
];

let wire: DeferredAccountWire;
let screen: MountedScreen | undefined;

function mount(page: Page, locale: ScreenLocale = "ro"): HTMLElement {
  screen = page.mount(locale);
  return screen.container;
}

beforeEach(() => {
  wire = new DeferredAccountWire();
  wire.install();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function valueOf(container: ParentNode, name: string): string {
  return inputNamed(container, name).value;
}

function lineIn(container: ParentNode): Element | null {
  return container.querySelector('[data-testid="contact-profile-fill"]');
}

function noticeFor(email: string, locale: ScreenLocale = "ro"): string {
  return MESSAGES[locale].contact.fillNotice.replace("{email}", email);
}

function profileReads(): number {
  return wire.countOf(PROFILE_URL);
}

function sessionReads(): number {
  return wire.countOf(SESSION_URL);
}

async function showTabAgain(): Promise<void> {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settleChainedReads();
}

async function hideTab(): Promise<void> {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settleChainedReads();
}

async function restoreFromCache(): Promise<void> {
  act(() => {
    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );
  });
  await settleChainedReads();
}

function typeLikeAPaste(input: HTMLInputElement, text: string): void {
  act(() => {
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }),
    );
  });
}

function pressRetry(container: ParentNode): void {
  act(() => {
    elementIn(container, '[data-testid="contact-retry"]').click();
  });
}

function sentIds(): string[] {
  return wire.contactBodies.map((body) => String(body.clientRequestId));
}

function fillNameAndPhoneAndConsent(container: HTMLElement): void {
  typeInto(inputNamed(container, "name"), VALID_NAME);
  typeInto(inputNamed(container, "phone"), VALID_PHONE);
  tickConsent(container);
}

describe.each(PAGES)("$title: typing between the two reads", (page) => {
  beforeEach(() => {
    wire.session = ANA_SESSION;
    wire.profile = "hold";
  });

  async function mountWithProfileInFlight(): Promise<HTMLElement> {
    const container = mount(page);
    await settleChainedReads();
    expect(wire.heldCount(PROFILE_URL)).toBe(1);
    return container;
  }

  it("keeps a value typed after the session answered and before the profile did, and fills the rest", async () => {
    const container = await mountWithProfileInFlight();
    typeInto(inputNamed(container, "name"), "Ion");

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(valueOf(container, "name")).toBe("Ion");
    expect(valueOf(container, "phone")).toBe(FULL_PROFILE.phone);
    expect(valueOf(container, "locality")).toBe(FULL_PROFILE.address);
  });

  it("keeps a field typed and then cleared: empty is the customer's value, not a blank to fill", async () => {
    const container = await mountWithProfileInFlight();
    typeInto(inputNamed(container, "name"), "Ion");
    typeInto(inputNamed(container, "name"), "");

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(valueOf(container, "name")).toBe("");
    expect(valueOf(container, "phone")).toBe(FULL_PROFILE.phone);
  });

  it("keeps a pasted value, and a paste that left the field empty", async () => {
    const container = await mountWithProfileInFlight();
    typeLikeAPaste(inputNamed(container, "name"), "Pasted Name");
    typeLikeAPaste(inputNamed(container, "locality"), "x");
    typeLikeAPaste(inputNamed(container, "locality"), "");

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(valueOf(container, "name")).toBe("Pasted Name");
    expect(valueOf(container, "locality")).toBe("");
  });

  it("keeps a field the customer focused and left without typing", async () => {
    const container = await mountWithProfileInFlight();
    leave(inputNamed(container, "phone"));

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(valueOf(container, "phone")).toBe("");
    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
  });

  it("never lets the profile's text reach the e-mail, the channel, the consent or the honeypot, whatever else it carries", async () => {
    const container = await mountWithProfileInFlight();

    await wire.answerHeld(
      PROFILE_URL,
      ok({
        ...FULL_PROFILE,
        email: "profile@mail.md",
        consent: true,
        channel: "email",
        honeypot: "robot",
        role: "administrator",
        __proto__: { name: "Proto" },
      }),
    );

    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
    expect(inputNamed(container, "consent").checked).toBe(false);
    expect(inputNamed(container, "channel").checked).toBe(true);
    expect(container.querySelector('input[name="email"]')).toBeNull();
    const honeypot = container.querySelector<HTMLInputElement>(
      'input[tabindex="-1"]',
    );
    expect(honeypot?.value ?? "").toBe("");
  });
});

describe.each(PAGES)(
  "$title: submitting is never blocked by prefill",
  (page) => {
    it.each<readonly [string, Mode, Mode]>([
      ["a session read that never answers", "hold", "hold"],
      ["a profile read that never answers", ANA_SESSION, "hold"],
      ["a session read that fails", UNREACHABLE, UNREACHABLE],
      ["a profile read that fails", ANA_SESSION, UNREACHABLE],
      [
        "a session answered 503",
        { status: 503, body: { status: "unavailable" } },
        UNREACHABLE,
      ],
    ])("sends the typed form with %s", async (_what, session, profile) => {
      wire.session = session;
      wire.profile = profile;
      const container = mount(page);
      await settleChainedReads();
      fillNameAndPhoneAndConsent(container);

      pressCallToAction(container);

      expect(wire.contactBodies).toHaveLength(1);
      expect(wire.contactBodies[0]).toMatchObject({
        contact: { name: VALID_NAME, phone: VALID_PHONE },
      });
    });

    it("sends the profile's name and phone, as shown, when the customer typed nothing", async () => {
      wire.session = ANA_SESSION;
      wire.profile = ok(FULL_PROFILE);
      const container = mount(page);
      await settleChainedReads();
      tickConsent(container);

      pressCallToAction(container);

      expect(wire.contactBodies).toHaveLength(1);
      expect(wire.contactBodies[0]).toMatchObject({
        contact: {
          name: FULL_PROFILE.name,
          phone: FULL_PROFILE.phone,
          locality: FULL_PROFILE.address,
          channel: "phone",
        },
      });
    });

    it("a profile arriving during a press sends nothing more, and the body keeps what it was built from", async () => {
      wire.session = ANA_SESSION;
      wire.profile = "hold";
      const container = mount(page);
      await settleChainedReads();
      fillNameAndPhoneAndConsent(container);
      pressCallToAction(container);

      await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));
      await wire.answerContact("network-failure");

      expect(wire.contactBodies).toHaveLength(1);
      expect(wire.contactBodies[0]).toMatchObject({
        contact: { name: VALID_NAME, locality: "" },
      });
    });
  },
);

describe.each(PAGES)("$title: the session's answer is untrusted", (page) => {
  const BIG = 200_000;
  const hugeWithout = Array.from(
    { length: BIG },
    (_, index) => `cap.${String(index)}`,
  );
  const hugeWith = [...hugeWithout, "design.edit.own"];
  const raw = (status: number, text: string): RawAnswer => ({ status, text });

  const NOT_A_CLIENT: readonly (readonly [string, Mode])[] = [
    ["JSON null", raw(200, "null")],
    ["an empty body", raw(200, "")],
    ["an HTML page with status 200", raw(200, "<html>sign in</html>")],
    ["a number", raw(200, "42")],
    ["a bare string", raw(200, '"signed-in"')],
    ["an array", ok(["signed-in"])],
    ["no state", ok({ email: ANA, capabilities: ["design.edit.own"] })],
    [
      "a state in another case",
      ok({ state: "SIGNED-IN", email: ANA, capabilities: ["design.edit.own"] }),
    ],
    [
      "a state that is an array",
      ok({
        state: ["signed-in"],
        email: ANA,
        capabilities: ["design.edit.own"],
      }),
    ],
    ["no capabilities", ok({ state: "signed-in", email: ANA })],
    [
      "capabilities null",
      ok({ state: "signed-in", email: ANA, capabilities: null }),
    ],
    [
      "capabilities as a string that contains the name",
      ok({ state: "signed-in", email: ANA, capabilities: "design.edit.own" }),
    ],
    [
      "capabilities as an object keyed by the name",
      ok({
        state: "signed-in",
        email: ANA,
        capabilities: { "design.edit.own": true },
      }),
    ],
    [
      "capabilities that nest the name",
      ok({
        state: "signed-in",
        email: ANA,
        capabilities: [["design.edit.own"]],
      }),
    ],
    [
      "capabilities of other types",
      ok({ state: "signed-in", email: ANA, capabilities: [1, null, true, {}] }),
    ],
    [
      "the name in another case",
      ok({ state: "signed-in", email: ANA, capabilities: ["Design.Edit.Own"] }),
    ],
    [
      "the name with a space",
      ok({
        state: "signed-in",
        email: ANA,
        capabilities: [" design.edit.own"],
      }),
    ],
    [
      "an e-mail that is not text",
      ok({ state: "signed-in", email: 7, capabilities: ["design.edit.own"] }),
    ],
    [
      "a null e-mail",
      ok({
        state: "signed-in",
        email: null,
        capabilities: ["design.edit.own"],
      }),
    ],
    [
      "an anonymous state that lists the capability",
      ok({ state: "anonymous", email: ANA, capabilities: ["design.edit.own"] }),
    ],
    [
      "the capability under a prototype key only",
      raw(
        200,
        `{"state":"signed-in","email":"${ANA}","__proto__":{"capabilities":["design.edit.own"]}}`,
      ),
    ],
    [
      "a client's body with status 401",
      {
        status: 401,
        body: {
          state: "signed-in",
          email: ANA,
          capabilities: ["design.edit.own"],
        },
      },
    ],
    [
      "a client's body with status 500",
      {
        status: 500,
        body: {
          state: "signed-in",
          email: ANA,
          capabilities: ["design.edit.own"],
        },
      },
    ],
    [
      "a payload of 200 000 capabilities, none of them the one",
      ok({ state: "signed-in", email: ANA, capabilities: hugeWithout }),
    ],
  ];

  it.each(NOT_A_CLIENT)(
    "makes no profile read and fills nothing for %s",
    async (_what, session) => {
      wire.session = session;
      wire.profile = ok(FULL_PROFILE);
      const container = mount(page);

      await settleChainedReads();

      expect(profileReads()).toBe(0);
      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "phone")).toBe("");
      expect(lineIn(container)).toBeNull();
    },
  );

  it("still recognises a client whose capability is the last of 200 000", async () => {
    wire.session = ok({
      state: "signed-in",
      email: ANA,
      capabilities: hugeWith,
    });
    wire.profile = ok(FULL_PROFILE);
    const container = mount(page);

    await settleChainedReads();

    expect(profileReads()).toBe(1);
    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
  });

  it("is not moved by extra keys on a client's answer", async () => {
    wire.session = ok({
      state: "signed-in",
      email: ANA,
      capabilities: [...ROLES.client],
      role: "administrator",
      accountId: "x",
    });
    wire.profile = ok(EMPTY_PROFILE);
    const container = mount(page);

    await settleChainedReads();

    expect(lineIn(container)?.textContent).toBe(noticeFor(ANA));
  });
});

describe.each(PAGES)("$title: the profile's answer is untrusted", (page) => {
  const BAD_PROFILES: readonly (readonly [string, Mode])[] = [
    ["JSON null", { status: 200, text: "null" }],
    ["an array", ok(["Ana", "Chisinau", "069"])],
    ["an empty object", ok({})],
    ["a name that is a number", ok({ ...FULL_PROFILE, name: 5 })],
    [
      "an address that is an object",
      ok({ ...FULL_PROFILE, address: { city: "x" } }),
    ],
    ["a phone that is a boolean", ok({ ...FULL_PROFILE, phone: true })],
    ["a missing address key", ok({ name: "Ana", phone: "069 123 456" })],
    [
      "one bad member beside two good ones",
      ok({ name: "Ana", address: 5, phone: null }),
    ],
    ["HTML with status 200", { status: 200, text: "<html></html>" }],
    ["a 403", { status: 403, body: FULL_PROFILE }],
  ];

  beforeEach(() => {
    wire.session = ANA_SESSION;
  });

  it.each(BAD_PROFILES)(
    "fills nothing and draws no line for %s",
    async (_what, profile) => {
      wire.profile = profile;
      const container = mount(page);

      await settleChainedReads();

      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "phone")).toBe("");
      expect(valueOf(container, "locality")).toBe("");
      expect(lineIn(container)).toBeNull();
    },
  );

  it("shows a 10 000-character name unjudged, and the press refuses it at the name and sends nothing", async () => {
    wire.profile = ok({ ...FULL_PROFILE, name: "N".repeat(10_000) });
    const container = mount(page);
    await settleChainedReads();
    tickConsent(container);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    pressCallToAction(container);

    expect(wire.contactBodies).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("counts a whitespace-only name as a blank the request would fill, so the line is drawn", async () => {
    wire.profile = ok({ ...FULL_PROFILE, name: "   " });
    const container = mount(page);

    await settleChainedReads();

    expect(lineIn(container)?.textContent).toBe(noticeFor(ANA));
  });

  it("does not put a whitespace-only name into the field, and counts it as blank for the line", async () => {
    wire.profile = ok({ ...FULL_PROFILE, name: "   " });
    const container = mount(page);

    await settleChainedReads();

    expect(valueOf(container, "name")).toBe("");
    expect(lineIn(container)).not.toBeNull();
  });
});

describe.each(PAGES)("$title: the line names the session's address", (page) => {
  beforeEach(() => {
    wire.profile = ok(EMPTY_PROFILE);
  });

  const HOSTILE_ADDRESSES = [
    `<img src=x onerror=alert(1)>{email}'@a.md`,
    `"><script>window.pwned=1</script>@a.md`,
    "a{b}@c.md",
    "x'y''z@a.md",
    "{name}{0}{{@a.md",
    "&lt;b&gt;@a.md",
    "<b>bold</b>@a.md",
    "a@b.md‮txt.exe",
  ];

  it.each(HOSTILE_ADDRESSES)(
    "writes %s as plain text and builds no element from it",
    async (address) => {
      wire.session = signedInSession(address, [...ROLES.client]);
      const container = mount(page);

      await settleChainedReads();

      const line = lineIn(container);
      expect(line?.textContent).toBe(noticeFor(address));
      expect(line?.children).toHaveLength(0);
      expect(container.querySelector("img, script, b")).toBeNull();
      expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    },
  );

  it("writes a 5 000-character address whole, in Russian too, and keeps the line wrappable", async () => {
    const address = `${"a".repeat(5_000)}@mail.md`;
    wire.session = signedInSession(address, [...ROLES.client]);
    const container = mount(page, "ru");

    await settleChainedReads();

    expect(lineIn(container)?.textContent).toBe(noticeFor(address, "ru"));
  });

  it("never carries what the customer typed into the line", async () => {
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();

    typeInto(inputNamed(container, "name"), "evil@attacker.md");
    typeInto(inputNamed(container, "phone"), "other@attacker.md");
    typeInto(inputNamed(container, "locality"), "third@attacker.md");

    expect(lineIn(container)?.textContent).toBe(noticeFor(ANA));
  });
});

describe.each(PAGES)("$title: a reordered or late session read", (page) => {
  it("drops an older session read that answers after a newer one", async () => {
    wire.session = "hold";
    wire.profile = ok(FULL_PROFILE);
    const container = mount(page);
    await showTabAgain();
    expect(wire.heldCount(SESSION_URL)).toBe(2);

    await wire.answerHeld(SESSION_URL, VISITOR, "newest");
    await wire.answerHeld(SESSION_URL, ANA_SESSION, "oldest");
    await settleChainedReads();

    expect(profileReads()).toBe(0);
    expect(valueOf(container, "name")).toBe("");
    expect(lineIn(container)).toBeNull();
  });

  it("does not apply a profile that arrives after the session has ended", async () => {
    wire.session = ANA_SESSION;
    wire.profile = "hold";
    const container = mount(page);
    await settleChainedReads();
    wire.session = VISITOR;
    await showTabAgain();

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(valueOf(container, "name")).toBe("");
    expect(valueOf(container, "phone")).toBe("");
    expect(lineIn(container)).toBeNull();
  });

  it("does not apply a profile after the page unmounted, and raises nothing", async () => {
    wire.session = ANA_SESSION;
    wire.profile = "hold";
    const failures: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      failures.push(args);
    });
    mount(page);
    await settleChainedReads();
    screen?.unmount();
    screen = undefined;

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(failures).toEqual([]);
  });

  it("reads the profile once per mount: a second mount reads again", async () => {
    wire.session = ANA_SESSION;
    wire.profile = ok(FULL_PROFILE);
    mount(page);
    await settleChainedReads();
    screen?.unmount();
    mount(page);
    await settleChainedReads();

    expect(profileReads()).toBe(2);
  });

  it("makes one profile read when the tab is shown ten times while the profile is still out", async () => {
    wire.session = ANA_SESSION;
    wire.profile = "hold";
    mount(page);
    await settleChainedReads();

    for (let shown = 0; shown < 10; shown += 1) await showTabAgain();

    expect(profileReads()).toBe(1);
  });
});

describe("the callback page under StrictMode with a held profile", () => {
  it("reads the session twice and the profile once, and fills once it answers", async () => {
    wire.session = ANA_SESSION;
    wire.profile = "hold";
    const container = (screen = mountCallback("ro", true)).container;
    await settleChainedReads();

    await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));

    expect(profileReads()).toBe(1);
    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
  });
});

describe.each(PAGES)("$title: session reads a visitor's tab makes", (page) => {
  it("counts one read on mount and one per return, never a profile read", async () => {
    wire.session = VISITOR;
    mount(page);
    await settleChainedReads();
    expect(sessionReads()).toBe(1);

    await showTabAgain();
    expect(sessionReads()).toBe(2);

    await hideTab();
    expect(sessionReads()).toBe(2);
    expect(profileReads()).toBe(0);
  });

  it("counts two reads for a restore that fires both pageshow and visibilitychange, which a real browser can", async () => {
    wire.session = VISITOR;
    mount(page);
    await settleChainedReads();

    await restoreFromCache();
    await showTabAgain();

    expect(sessionReads()).toBe(3);
    expect(wire.requested.filter((url) => url !== SESSION_URL)).toEqual([]);
  });
});

describe.each(PAGES)("$title: nothing is persisted", (page) => {
  it("writes to no storage, cookie, history entry or address across a prefill, a withdrawal and a retry", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const cookieWrite = vi.spyOn(document, "cookie", "set");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const addressBefore = window.location.href;
    wire.session = ANA_SESSION;
    wire.profile = ok({ ...FULL_PROFILE, phone: null });
    const container = mount(page);
    await settleChainedReads();
    fillNameAndPhoneAndConsent(container);
    typeInto(inputNamed(container, "name"), "Ion Rusu");
    pressCallToAction(container);
    await wire.answerContact("network-failure");
    wire.session = ION_SESSION;
    await showTabAgain();
    pressRetry(container);

    expect(setItem).not.toHaveBeenCalled();
    expect(cookieWrite).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.href).toBe(addressBefore);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe.each(PAGES)(
  "$title: a typed value survives the session ending",
  (page) => {
    it("keeps a prefilled value the customer then edited, and clears one they did not touch", async () => {
      wire.session = ANA_SESSION;
      wire.profile = ok(FULL_PROFILE);
      const container = mount(page);
      await settleChainedReads();
      typeInto(inputNamed(container, "name"), "Ana-Maria Popescu");

      wire.session = VISITOR;
      await restoreFromCache();

      expect(valueOf(container, "name")).toBe("Ana-Maria Popescu");
      expect(valueOf(container, "phone")).toBe("");
      expect(valueOf(container, "locality")).toBe("");
    });

    it("takes back the profile's name and phone when a restore's session read fails (ADR 0179 d1, W2b-7)", async () => {
      wire.session = ANA_SESSION;
      wire.profile = ok(FULL_PROFILE);
      const container = mount(page);
      await settleChainedReads();

      wire.session = UNREACHABLE;
      await restoreFromCache();

      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "phone")).toBe("");
    });
  },
);

describe.each(PAGES)("$title: the L3 reset of the request id", (page) => {
  beforeEach(() => {
    wire.profile = ok(EMPTY_PROFILE);
  });

  async function sendWithAnsweredLoss(container: HTMLElement): Promise<void> {
    fillNameAndPhoneAndConsent(container);
    typeInto(inputNamed(container, "locality"), VALID_LOCALITY);
    pressCallToAction(container);
    await wire.answerContact("network-failure");
  }

  it("resets for a send that was out when the session changed, and then lost its answer", async () => {
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();
    fillNameAndPhoneAndConsent(container);
    typeInto(inputNamed(container, "locality"), VALID_LOCALITY);
    pressCallToAction(container);

    wire.session = ION_SESSION;
    await showTabAgain();
    await wire.answerContact("network-failure");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    pressRetry(container);

    const [first, second] = sentIds();
    expect(sentIds()).toHaveLength(2);
    expect(second).not.toBe(first);
  });

  it("gives the retry a new id when a send made before any session answer meets a confirmed client's first answer (L3)", async () => {
    wire.session = UNREACHABLE;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = ION_SESSION;
    await showTabAgain();
    pressRetry(container);

    const [first, second] = sentIds();
    expect(sentIds()).toHaveLength(2);
    expect(second).not.toBe(first);
  });

  it("resets when a visitor's unanswered send is followed by a sign-in in another tab", async () => {
    wire.session = VISITOR;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = ANA_SESSION;
    await showTabAgain();
    pressRetry(container);

    const [first, second] = sentIds();
    expect(second).not.toBe(first);
  });

  it("keeps the id when the same account is signed in again, which is no second account", async () => {
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = VISITOR;
    await hideTab();
    wire.session = ANA_SESSION;
    await showTabAgain();
    const [first] = sentIds();
    pressRetry(container);

    // Between the two looks the tab never saw the visitor, so the account is the same one throughout.
    expect(sentIds()).toHaveLength(2);
    expect(sentIds()[1]).toBe(first);
  });

  it("keeps the retry on the old id and naming the old account when no event reaches the page: the server then fills nothing", async () => {
    // Side-by-side windows fire neither visibilitychange nor pageshow. The body still names the account the line
    // showed, and the server fills a profile only for a session of that address (ADR 0179 d5).
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = ION_SESSION;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await settleChainedReads();
    pressRetry(container);

    expect(sentIds()[1]).toBe(sentIds()[0]);
    expect(wire.contactBodies[1]?.profileAccountEmail).toBe(ANA);
  });

  it("resends the old id, naming the old account, when the connection returns while a session read is still out", async () => {
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = "hold";
    await showTabAgain();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(sentIds()).toHaveLength(2);
    expect(sentIds()[1]).toBe(sentIds()[0]);
    expect(wire.contactBodies[1]?.profileAccountEmail).toBe(ANA);
  });

  it("keeps the id when a failed session read is followed by another failure", async () => {
    wire.session = ANA_SESSION;
    const container = mount(page);
    await settleChainedReads();
    await sendWithAnsweredLoss(container);

    wire.session = UNREACHABLE;
    await showTabAgain();
    await showTabAgain();
    pressRetry(container);

    expect(sentIds()[1]).toBe(sentIds()[0]);
  });
});

describe.each(PAGES)("$title: the line after the account changed", (page) => {
  it("shows no line naming the account that left", async () => {
    wire.session = ANA_SESSION;
    wire.profile = ok(EMPTY_PROFILE);
    const container = mount(page);
    await settleChainedReads();
    expect(lineIn(container)?.textContent).toBe(noticeFor(ANA));

    wire.session = ION_SESSION;
    await showTabAgain();

    expect(lineIn(container)?.textContent ?? "").not.toContain(ANA);
  });

  it("shows a second confirmed client on the same page the line naming their account (ADR 0179 d5)", async () => {
    wire.session = ANA_SESSION;
    wire.profile = ok(EMPTY_PROFILE);
    const container = mount(page);
    await settleChainedReads();

    wire.session = ION_SESSION;
    await showTabAgain();

    expect(lineIn(container)?.textContent).toBe(noticeFor(ION));
  });

  it("shows the same client the line again after signing out and in", async () => {
    wire.session = ANA_SESSION;
    wire.profile = ok(EMPTY_PROFILE);
    const container = mount(page);
    await settleChainedReads();

    wire.session = VISITOR;
    await showTabAgain();
    wire.session = ANA_SESSION;
    await showTabAgain();

    expect(lineIn(container)?.textContent).toBe(noticeFor(ANA));
  });
});

describe.each(PAGES)(
  "$title: a profile that arrives after a send began",
  (page) => {
    it("does not fill a field after an unanswered send, so the retry is the same request with the same id", async () => {
      wire.session = ANA_SESSION;
      wire.profile = "hold";
      const container = mount(page);
      await settleChainedReads();
      fillNameAndPhoneAndConsent(container);
      pressCallToAction(container);
      await wire.answerContact("network-failure");

      await wire.answerHeld(PROFILE_URL, ok(FULL_PROFILE));
      pressRetry(container);

      expect(sentIds()).toHaveLength(2);
      expect(sentIds()[1]).toBe(sentIds()[0]);
    });
  },
);

describe("the line's style", () => {
  it("lets a long address wrap instead of widening the page", () => {
    const css = readFileSync(
      join(import.meta.dirname, "../../src/contact/contact.module.css"),
      "utf8",
    );
    const rule = /\.profileFillLine\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
