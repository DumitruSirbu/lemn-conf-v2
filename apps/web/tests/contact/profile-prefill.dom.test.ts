// @vitest-environment happy-dom
//
// The contact form filled from a confirmed client's profile (ADR 0179 d1, d5), on both pages that mount the form's
// memory: the design's and the callback's. Real events and a stubbed `fetch` that answers the two account reads at once.
//
// What this cannot see: where the line sits against the pinned region at 390 px (the visual pass), the real routes'
// answers (the e2e against the test database), and a real back-forward cache restore (the `pageshow` is dispatched).
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
  DeferredAccountWire,
  settleChainedReads,
} from "./support/deferred-account-wire";
import {
  elementIn,
  fillWholeForm,
  inputNamed,
  MESSAGES,
  mountContactScreen,
  PROFILE_URL,
  pressCallToAction,
  recordTraffic,
  sentencesShown,
  SESSION_URL,
  settleAccountReads,
  signedInSession,
  tickConsent,
  typeInto,
  type MountedScreen,
  type RecordedTraffic,
  type ScreenLocale,
  type ServerAnswer,
} from "./contact-screen-harness";

const CLIENT_EMAIL = "ana@mail.md";
const OTHER_CLIENT_EMAIL = "ion@mail.md";
const CLIENT_SESSION = signedInSession(CLIENT_EMAIL, [...ROLES.client]);
const OTHER_CLIENT_SESSION = signedInSession(OTHER_CLIENT_EMAIL, [
  ...ROLES.client,
]);
const ANONYMOUS_SESSION: ServerAnswer = {
  status: 200,
  body: { state: "anonymous" },
};

const FULL_PROFILE = {
  name: "Ana Popescu",
  address: "Chisinau",
  phone: "069 123 456",
};
const EMPTY_PROFILE = { name: null, address: null, phone: null };

function profileAnswer(body: unknown): ServerAnswer {
  return { status: 200, body };
}

interface Page {
  readonly title: string;
  readonly mount: (locale: ScreenLocale) => {
    container: HTMLElement;
    unmount: () => void;
  };
}

function mountCallback(locale: ScreenLocale): MountedScreen {
  return mountCallbackIn(locale, (page) => page);
}

function mountCallbackStrict(locale: ScreenLocale): MountedScreen {
  return mountCallbackIn(locale, (page) =>
    createElement(StrictMode, null, page),
  );
}

function mountCallbackIn(
  locale: ScreenLocale,
  wrap: (
    page: ReturnType<typeof createElement>,
  ) => ReturnType<typeof createElement>,
): MountedScreen {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      wrap(
        createElement(NextIntlClientProvider, {
          locale,
          messages: MESSAGES[locale] as typeof MESSAGES.ro,
          timeZone: "Europe/Chisinau",
          children: createElement(CallbackContactScreen, { isSendable: true }),
        }),
      ),
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

const PAGES: readonly Page[] = [
  {
    title: "the design's contact page",
    mount: (locale) => mountContactScreen({ locale }),
  },
  { title: "the callback contact page", mount: mountCallback },
];

let traffic: RecordedTraffic;
let screen: MountedScreen | undefined;

function mount(page: Page, locale: ScreenLocale = "ro"): HTMLElement {
  screen = page.mount(locale);
  return screen.container;
}

beforeEach(() => {
  traffic = recordTraffic();
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  vi.unstubAllGlobals();
});

function valueOf(container: ParentNode, name: string): string {
  return inputNamed(container, name).value;
}

function lineIn(container: ParentNode): Element | null {
  return container.querySelector('[data-testid="contact-profile-fill"]');
}

function noticeFor(locale: ScreenLocale, email: string): string {
  return MESSAGES[locale].contact.fillNotice.replace("{email}", email);
}

function profileReads(): number {
  return traffic.accountReads.filter((url) => url === PROFILE_URL).length;
}

/** The tab is shown again, as a person switching back to it does. */
async function showTabAgain(): Promise<void> {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settleAccountReads();
}

/** The page comes back from the back-forward cache. */
async function restoreFromCache(): Promise<void> {
  act(() => {
    window.dispatchEvent(
      Object.assign(new Event("pageshow"), { persisted: true }),
    );
  });
  await settleAccountReads();
}

describe.each(PAGES)("$title, for a confirmed client", (page) => {
  it.each(["ro", "ru"] as const)(
    "shows the profile's name, phone and address in Nume, Telefon and Oras in %s",
    async (locale) => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(FULL_PROFILE);
      const container = mount(page, locale);

      await settleAccountReads();

      expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
      expect(valueOf(container, "phone")).toBe(FULL_PROFILE.phone);
      expect(valueOf(container, "locality")).toBe(FULL_PROFILE.address);
    },
  );

  it("keeps what the customer typed before the profile came, and fills the rest", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount(page);
    typeInto(inputNamed(container, "name"), "Ion");

    await settleAccountReads();

    expect(valueOf(container, "name")).toBe("Ion");
    expect(valueOf(container, "phone")).toBe(FULL_PROFILE.phone);
  });

  it("raises no error for a prefilled phone the domain would refuse", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer({
      ...FULL_PROFILE,
      phone: "06912",
    });
    const container = mount(page);

    await settleAccountReads();

    expect(valueOf(container, "phone")).toBe("06912");
    expect(sentencesShown(container)).toEqual([]);
  });

  it("never fills the e-mail field or the channel", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount(page);

    await settleAccountReads();

    expect(inputNamed(container, "channel").checked).toBe(true);
    expect(container.querySelector('input[name="email"]')).toBeNull();
    act(() => {
      container
        .querySelector<HTMLInputElement>('input[name="channel"][value="email"]')
        ?.click();
    });
    expect(valueOf(container, "email")).toBe("");
  });

  it("reads the profile once, however often the session is looked at again", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    mount(page);
    await settleAccountReads();

    await showTabAgain();
    await restoreFromCache();

    expect(profileReads()).toBe(1);
    expect(
      traffic.accountReads.filter((url) => url === SESSION_URL),
    ).toHaveLength(3);
  });

  it.each(["ro", "ru"] as const)(
    "says in %s that missing details go to the profile of the account, named by its address",
    async (locale) => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(EMPTY_PROFILE);
      const container = mount(page, locale);

      await settleAccountReads();

      expect(lineIn(container)?.textContent).toBe(
        noticeFor(locale, CLIENT_EMAIL),
      );
    },
  );

  it("names the session's address and not the e-mail the customer types for the shop", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(EMPTY_PROFILE);
    const container = mount(page);
    await settleAccountReads();

    act(() => {
      container
        .querySelector<HTMLInputElement>('input[name="channel"][value="email"]')
        ?.click();
    });
    typeInto(inputNamed(container, "email"), "other@example.com");

    expect(lineIn(container)?.textContent).toBe(noticeFor("ro", CLIENT_EMAIL));
  });

  it("draws no line when the profile holds all three details", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount(page);

    await settleAccountReads();
    typeInto(inputNamed(container, "locality"), "Balti");

    expect(lineIn(container)).toBeNull();
  });

  it("draws the line for a blank address only once the customer gives a locality, as the server fills it", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer({ ...FULL_PROFILE, address: null });
    const container = mount(page);

    await settleAccountReads();
    expect(lineIn(container)).toBeNull();
    typeInto(inputNamed(container, "locality"), "Balti");

    expect(lineIn(container)?.textContent).toBe(noticeFor("ro", CLIENT_EMAIL));
  });
});

describe.each(PAGES)("$title, for everyone but a confirmed client", (page) => {
  const NOT_FILLED: readonly (readonly [string, ServerAnswer])[] = [
    ["a visitor", ANONYMOUS_SESSION],
    [
      "a staff member",
      signedInSession("staff@lemnaria.md", [...ROLES.operator]),
    ],
    [
      "an administrator",
      signedInSession("admin@lemnaria.md", [...ROLES.administrator]),
    ],
    [
      "an unconfirmed account",
      signedInSession(CLIENT_EMAIL, ["account.manage.own"]),
    ],
    ["a session read that failed", "network-failure"],
    [
      "a session read refused with a 503",
      { status: 503, body: { status: "unavailable" } },
    ],
    [
      "a session that lists design.read.own and not design.edit.own",
      signedInSession(CLIENT_EMAIL, ["design.read.own", "account.manage.own"]),
    ],
  ];

  it.each(NOT_FILLED)(
    "leaves the form empty, with no line and no profile request, for %s",
    async (_who, session) => {
      traffic.account.session = session;
      traffic.account.profile = profileAnswer(FULL_PROFILE);
      const container = mount(page);

      await settleAccountReads();

      expect(profileReads()).toBe(0);
      expect(traffic.accountReads).toEqual([SESSION_URL]);
      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "phone")).toBe("");
      expect(valueOf(container, "locality")).toBe("");
      expect(lineIn(container)).toBeNull();
    },
  );

  it.each([
    ["a profile read that failed", "network-failure" as ServerAnswer],
    [
      "a profile read refused with a 503",
      { status: 503, body: { status: "unavailable" } },
    ],
    ["a profile that is not the three details", profileAnswer({ name: 5 })],
  ])(
    "leaves a client's form empty, with no line, for %s",
    async (_what, profile) => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profile;
      const container = mount(page);

      await settleAccountReads();

      expect(profileReads()).toBe(1);
      expect(valueOf(container, "name")).toBe("");
      expect(lineIn(container)).toBeNull();
    },
  );
});

describe.each(PAGES)(
  "$title, when the page is restored after the session ended",
  (page) => {
    it("takes back what the profile filled and the line, and keeps what the customer typed", async () => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer({ ...FULL_PROFILE, phone: null });
      const container = mount(page);
      await settleAccountReads();
      typeInto(inputNamed(container, "locality"), "Balti");
      expect(lineIn(container)).not.toBeNull();

      traffic.account.session = ANONYMOUS_SESSION;
      await restoreFromCache();

      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "locality")).toBe("Balti");
      expect(lineIn(container)).toBeNull();
      expect(profileReads()).toBe(1);
    });

    it("takes back the profile's values and the line when the session read fails, and keeps what was typed", async () => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer({ ...FULL_PROFILE, phone: null });
      const container = mount(page);
      await settleAccountReads();
      typeInto(inputNamed(container, "locality"), "Balti");
      expect(lineIn(container)).not.toBeNull();

      traffic.account.session = "network-failure";
      await restoreFromCache();

      expect(valueOf(container, "name")).toBe("");
      expect(valueOf(container, "locality")).toBe("Balti");
      expect(lineIn(container)).toBeNull();
    });

    it("does not look again when the page was not restored from the cache", async () => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(FULL_PROFILE);
      mount(page);
      await settleAccountReads();

      act(() => {
        window.dispatchEvent(
          Object.assign(new Event("pageshow"), { persisted: false }),
        );
      });
      await settleAccountReads();

      expect(
        traffic.accountReads.filter((url) => url === SESSION_URL),
      ).toHaveLength(1);
    });
  },
);

describe.each(PAGES)(
  "$title, when the session changes under an unanswered send",
  (page) => {
    async function sendAndLoseTheAnswer(container: HTMLElement): Promise<void> {
      fillWholeForm(container);
      pressCallToAction(container);
      await traffic.answerOldest("network-failure");
    }

    function pressRetry(container: ParentNode): void {
      act(() => {
        elementIn(container, '[data-testid="contact-retry"]').click();
      });
    }

    function sentIds(): string[] {
      return traffic.contactBodies.map((body) => String(body.clientRequestId));
    }

    beforeEach(() => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(EMPTY_PROFILE);
    });

    it("control: with the same session, a retry carries the same request id", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendAndLoseTheAnswer(container);

      await showTabAgain();
      pressRetry(container);

      const [first, second] = sentIds();
      expect(sentIds()).toHaveLength(2);
      expect(second).toBe(first);
    });

    it("carries a new request id on the retry once another account is signed in", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendAndLoseTheAnswer(container);

      traffic.account.session = OTHER_CLIENT_SESSION;
      await showTabAgain();
      pressRetry(container);

      const [first, second] = sentIds();
      expect(sentIds()).toHaveLength(2);
      expect(second).not.toBe(first);
    });

    it("carries a new request id once the session has ended", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendAndLoseTheAnswer(container);

      traffic.account.session = ANONYMOUS_SESSION;
      await showTabAgain();
      pressRetry(container);

      const [first, second] = sentIds();
      expect(second).not.toBe(first);
    });

    it("does not resend by itself when the connection returns, since the session is no longer the one it was sent under", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendAndLoseTheAnswer(container);

      traffic.account.session = OTHER_CLIENT_SESSION;
      await showTabAgain();
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      expect(sentIds()).toHaveLength(1);
    });

    it("keeps the request id when the session read merely fails, so a flaky network does not break the retry's dedup", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendAndLoseTheAnswer(container);

      traffic.account.session = "network-failure";
      await showTabAgain();
      pressRetry(container);

      const [first, second] = sentIds();
      expect(second).toBe(first);
    });
  },
);

describe("the callback contact page under StrictMode, which runs every effect twice", () => {
  it("reads the profile once and fills the form from it", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount({ title: "strict", mount: mountCallbackStrict });

    await settleAccountReads();

    expect(profileReads()).toBe(1);
    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
  });
});

describe.each(PAGES)(
  "$title, when a second confirmed client signs in on the page",
  (page) => {
    it("reads the second account's profile once, and the first account's never again", async () => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(EMPTY_PROFILE);
      const container = mount(page);
      await settleAccountReads();

      traffic.account.session = OTHER_CLIENT_SESSION;
      await showTabAgain();
      traffic.account.session = CLIENT_SESSION;
      await showTabAgain();
      traffic.account.session = OTHER_CLIENT_SESSION;
      await showTabAgain();

      expect(profileReads()).toBe(2);
      expect(lineIn(container)?.textContent).toBe(
        noticeFor("ro", OTHER_CLIENT_EMAIL),
      );
    });
  },
);

describe.each(PAGES)("$title, what a request names", (page) => {
  function lastBody(): Record<string, unknown> {
    const body = traffic.contactBodies.at(-1);
    if (body === undefined) throw new Error("nothing was sent");
    return body;
  }

  function sendWhatTheProfileFilled(container: HTMLElement): void {
    tickConsent(container);
    pressCallToAction(container);
  }

  it("names the account whose line the form shows", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer({ ...FULL_PROFILE, phone: null });
    const container = mount(page);
    await settleAccountReads();
    typeInto(inputNamed(container, "phone"), "069 123 456");

    sendWhatTheProfileFilled(container);

    expect(lastBody().profileAccountEmail).toBe(CLIENT_EMAIL);
  });

  it("names no account when the profile holds every detail and the form shows no line", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount(page);
    await settleAccountReads();

    sendWhatTheProfileFilled(container);

    expect("profileAccountEmail" in lastBody()).toBe(false);
  });

  it("names no account for a visitor", async () => {
    const container = mount(page);
    await settleAccountReads();
    fillWholeForm(container);

    pressCallToAction(container);

    expect("profileAccountEmail" in lastBody()).toBe(false);
  });

  it("names no account on the retry after a change of account, and sends none of the first account's profile values", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer({
      name: null,
      phone: null,
      address: "Chisinau",
    });
    const container = mount(page);
    await settleAccountReads();
    typeInto(inputNamed(container, "name"), "Ion Rusu");
    typeInto(inputNamed(container, "phone"), "069 000 111");
    tickConsent(container);
    pressCallToAction(container);
    await traffic.answerOldest("network-failure");
    expect(lastBody().profileAccountEmail).toBe(CLIENT_EMAIL);

    traffic.account.session = OTHER_CLIENT_SESSION;
    traffic.account.profile = profileAnswer(EMPTY_PROFILE);
    await showTabAgain();
    act(() => {
      elementIn(container, '[data-testid="contact-retry"]').click();
    });

    expect(traffic.contactBodies).toHaveLength(2);
    const contact = lastBody().contact as Record<string, unknown>;
    expect(contact.name).toBe("Ion Rusu");
    expect(contact.locality).toBe("");
    expect("profileAccountEmail" in lastBody()).toBe(false);
  });

  it("shows the second account's line only once the customer edits a field, when what is typed was entered under the first", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(EMPTY_PROFILE);
    const container = mount(page);
    await settleAccountReads();
    typeInto(inputNamed(container, "name"), "Ion Rusu");
    expect(lineIn(container)).not.toBeNull();

    traffic.account.session = OTHER_CLIENT_SESSION;
    await showTabAgain();
    expect(valueOf(container, "name")).toBe("Ion Rusu");
    expect(lineIn(container)).toBeNull();
    typeInto(inputNamed(container, "phone"), "069 000 111");

    expect(lineIn(container)?.textContent).toBe(
      noticeFor("ro", OTHER_CLIENT_EMAIL),
    );
  });

  it("does not see a locality of format characters as one: no line, and no account named", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer({ ...FULL_PROFILE, address: null });
    const container = mount(page);
    await settleAccountReads();

    typeInto(inputNamed(container, "locality"), "\u200B\u200E ");
    expect(lineIn(container)).toBeNull();
    typeInto(inputNamed(container, "locality"), "Balti");

    expect(lineIn(container)).not.toBeNull();
  });
});

describe.each(PAGES)(
  "$title, a withdrawal while a send holds its values",
  (page) => {
    async function sendWhatTheProfileFilledAndLoseTheAnswer(
      container: HTMLElement,
    ): Promise<void> {
      tickConsent(container);
      pressCallToAction(container);
      await traffic.answerOldest("network-failure");
    }

    function pressRetry(container: ParentNode): void {
      act(() => {
        elementIn(container, '[data-testid="contact-retry"]').click();
      });
    }

    beforeEach(() => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(FULL_PROFILE);
    });

    it("takes back what the profile filled when the session ends, and a retry sends what the customer typed", async () => {
      traffic.account.profile = profileAnswer({
        name: null,
        phone: null,
        address: "Chisinau",
      });
      const container = mount(page);
      await settleAccountReads();
      typeInto(inputNamed(container, "name"), "Ion Rusu");
      typeInto(inputNamed(container, "phone"), "069 000 111");
      await sendWhatTheProfileFilledAndLoseTheAnswer(container);

      traffic.account.session = ANONYMOUS_SESSION;
      await showTabAgain();
      pressRetry(container);

      expect(traffic.contactBodies).toHaveLength(2);
      const contact = traffic.contactBodies[1]?.contact as Record<
        string,
        unknown
      >;
      expect(contact.name).toBe("Ion Rusu");
      expect(contact.locality).toBe("");
    });

    it("leaves the failure screen able to retry when the page is restored and the session read fails", async () => {
      const container = mount(page);
      await settleAccountReads();
      await sendWhatTheProfileFilledAndLoseTheAnswer(container);

      traffic.account.session = "network-failure";
      await restoreFromCache();
      pressRetry(container);

      expect(traffic.contactBodies).toHaveLength(2);
    });
  },
);

describe.each(PAGES)("$title, when the page is restored", (page) => {
  beforeEach(() => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
  });

  it("takes the profile's values back at once, and puts them back after a read that names the same account", async () => {
    const container = mount(page);
    await settleAccountReads();

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });
    expect(valueOf(container, "name")).toBe("");
    await settleAccountReads();

    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
    expect(profileReads()).toBe(1);
  });

  it.each([
    ["the restore, then the tab being shown", "restore-first"],
    ["the tab being shown, then the restore", "show-first"],
  ] as const)(
    "keeps the values withdrawn when the session read fails after %s",
    async (_order, order) => {
      const container = mount(page);
      await settleAccountReads();
      traffic.account.session = "network-failure";
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      const restore = () =>
        window.dispatchEvent(
          Object.assign(new Event("pageshow"), { persisted: true }),
        );
      const show = () => document.dispatchEvent(new Event("visibilitychange"));

      act(() => {
        if (order === "restore-first") {
          restore();
          show();
        } else {
          show();
          restore();
        }
      });
      await settleAccountReads();

      expect(valueOf(container, "name")).toBe("");
      expect(lineIn(container)).toBeNull();
    },
  );
});

describe("the callback contact page once its request is sent", () => {
  it("stops looking at the session", async () => {
    traffic.account.session = CLIENT_SESSION;
    traffic.account.profile = profileAnswer(FULL_PROFILE);
    const container = mount({ title: "callback", mount: mountCallback });
    await settleAccountReads();
    tickConsent(container);
    pressCallToAction(container);
    await traffic.answerOldest({
      status: 200,
      body: { status: "sent", reference: "LM-1234" },
    });
    const readsWhenSent = traffic.accountReads.length;

    await showTabAgain();
    await restoreFromCache();

    expect(traffic.accountReads).toHaveLength(readsWhenSent);
  });
});

describe("the callback contact page, when a restore's session read fails after the profile arrived", () => {
  it("takes back the values the profile filled in between", async () => {
    const wire = new DeferredAccountWire();
    wire.install();
    wire.session = CLIENT_SESSION;
    wire.profile = "hold";
    const container = mount({ title: "callback", mount: mountCallback });
    await settleChainedReads();
    wire.session = "hold";
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event("pageshow"), { persisted: true }),
      );
    });

    await wire.answerHeld(PROFILE_URL, profileAnswer(FULL_PROFILE));
    expect(valueOf(container, "name")).toBe(FULL_PROFILE.name);
    await wire.answerHeld(SESSION_URL, "network-failure");

    expect(valueOf(container, "name")).toBe("");
    expect(lineIn(container)).toBeNull();
  });
});

describe.each(PAGES)(
  "$title, when another account signs in on the failure screen after only the profile filled the form",
  (page) => {
    async function reachTheFailureScreenOfAnaSend(): Promise<HTMLElement> {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer(FULL_PROFILE);
      const container = mount(page);
      await settleAccountReads();
      tickConsent(container);
      pressCallToAction(container);
      await traffic.answerOldest("network-failure");
      expect(
        container.querySelector('[data-testid="submission-failure"]'),
      ).not.toBeNull();
      return container;
    }

    async function switchToIon(): Promise<void> {
      traffic.account.session = OTHER_CLIENT_SESSION;
      traffic.account.profile = profileAnswer(EMPTY_PROFILE);
      await showTabAgain();
    }

    it("brings the form back with the focus on the first field to fill", async () => {
      const container = await reachTheFailureScreenOfAnaSend();

      await switchToIon();

      expect(
        container.querySelector('[data-testid="submission-failure"]'),
      ).toBeNull();
      expect(valueOf(container, "name")).toBe("");
      expect(document.activeElement).toBe(inputNamed(container, "name"));
    });

    it("sends what the new person types, naming no account but theirs", async () => {
      const container = await reachTheFailureScreenOfAnaSend();
      await switchToIon();

      typeInto(inputNamed(container, "name"), "Ion Rusu");
      typeInto(inputNamed(container, "phone"), "069 000 111");
      pressCallToAction(container);

      expect(traffic.contactBodies).toHaveLength(2);
      const second = traffic.contactBodies[1];
      expect(second?.profileAccountEmail).not.toBe(CLIENT_EMAIL);
      expect((second?.contact as Record<string, unknown>).name).toBe(
        "Ion Rusu",
      );
      expect(second?.clientRequestId).not.toBe(
        traffic.contactBodies[0]?.clientRequestId,
      );
    });

    it("keeps the failure screen when the customer typed everything the retry needs", async () => {
      traffic.account.session = CLIENT_SESSION;
      traffic.account.profile = profileAnswer({
        name: null,
        phone: null,
        address: "Chisinau",
      });
      const container = mount(page);
      await settleAccountReads();
      typeInto(inputNamed(container, "name"), "Ion Rusu");
      typeInto(inputNamed(container, "phone"), "069 000 111");
      tickConsent(container);
      pressCallToAction(container);
      await traffic.answerOldest("network-failure");

      await switchToIon();

      expect(
        container.querySelector('[data-testid="submission-failure"]'),
      ).not.toBeNull();
    });
  },
);
