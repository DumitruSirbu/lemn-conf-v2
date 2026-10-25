// @vitest-environment happy-dom
// "Bucatariile mele" end to end on the client (Lot 2 criteria 3, 4, 16 to 18, 20): the card, its menu (a draft is deleted,
// a sent kitchen is hidden), the two destructive questions and what each answer of the server does to the list.
// The server is the one seam, `sendSignedInRequest`; everything else is the shipped components and catalogue.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  designIdOf,
  wireKitchen,
  wirePage,
} from "../support/account-kitchens-wire";
import { flushPromises } from "../support/render-hook";
import {
  allIn,
  byWords,
  click,
  mountInCatalogue,
  requireIn,
  submitFormIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());
const leaveFor = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor,
}));

const { KitchensScreen } = await import("@/account/kitchens/kitchens-screen");

const copyOf = {
  ro: roMessages.accountKitchens,
  ru: ruMessages.accountKitchens,
} as const;

type Responder = (
  request: SignedInRequest,
) => SignedInOutcome | Promise<SignedInOutcome>;

let screen: MountedScreen | undefined;
let requests: SignedInRequest[] = [];
let respondToAction: Responder;
let kitchensWire: Record<string, unknown>;

const received = (body: unknown): SignedInOutcome => ({
  kind: "received",
  body,
});

function nameLabel(serial: number): string {
  return `Casa ${String(serial)}`;
}

beforeEach(() => {
  requests = [];
  leaveFor.mockReset();
  sendSignedInRequest.mockReset();
  kitchensWire = wirePage(
    [
      wireKitchen(1, { name: nameLabel(1), isSent: true }),
      wireKitchen(2, { name: nameLabel(2), isSent: false }),
      wireKitchen(3, { name: null, isSent: false }),
    ],
    { total: 3 },
  );
  respondToAction = () => ({ kind: "succeeded" });
  sendSignedInRequest.mockImplementation((request: SignedInRequest) => {
    requests.push(request);
    if (request.flow === "kitchens")
      return Promise.resolve(received(kitchensWire));
    return Promise.resolve(respondToAction(request));
  });
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

async function openScreen(locale: TestLocale = "ro"): Promise<MountedScreen> {
  screen = mountInCatalogue(createElement(KitchensScreen, { locale }), locale);
  await flushPromises(5);
  return screen;
}

const cards = (page: MountedScreen): HTMLElement[] =>
  allIn(page.container, "article");
const cardOf = (page: MountedScreen, name: string): HTMLElement => {
  const found = cards(page).find(
    (card) => card.querySelector("h2")?.textContent === name,
  );
  if (found === undefined) throw new Error(`no card is called ${name}`);
  return found;
};
const firstCard = (page: MountedScreen): HTMLElement => {
  const [card] = cards(page);
  if (card === undefined) throw new Error("the list has no card");
  return card;
};
const actionRequests = (): SignedInRequest[] =>
  requests.filter((request) => request.flow === "kitchen-action");
const dialog = (): HTMLElement | null =>
  document.querySelector("[role=dialog], [role=alertdialog]");

function dotsOf(
  page: MountedScreen,
  name: string,
  locale: TestLocale = "ro",
): HTMLButtonElement {
  return byWords<HTMLButtonElement>(
    page.container,
    "button",
    copyOf[locale].moreActions.replace("{name}", name),
  );
}

function openMenu(
  page: MountedScreen,
  name: string,
  locale: TestLocale = "ro",
): void {
  click(dotsOf(page, name, locale));
}

function menuRows(): string[] {
  return allIn(requireIn(document.body, "[role=dialog]"), "button").map(
    (button) => button.textContent.trim(),
  );
}

function chooseRow(words: string): void {
  click(byWords(requireIn(document.body, "[role=dialog]"), "button", words));
}

async function settle(): Promise<void> {
  await flushPromises(5);
}

describe("the list", () => {
  it("draws a card per kitchen, newest first as the server ordered them, with the count above", async () => {
    const page = await openScreen();
    expect(
      cards(page).map((card) => card.querySelector("h2")?.textContent),
    ).toEqual([nameLabel(1), nameLabel(2), expect.any(String)]);
    expect(
      page.container.querySelector("[tabindex='-1']")?.textContent,
    ).toContain("3");
    expect(page.container.querySelector("button[aria-busy]")).toBeNull();
  });

  it("names a kitchen that was never named from its facts, never leaves it blank", async () => {
    const page = await openScreen();
    const unnamed = cards(page)[2]?.querySelector("h2")?.textContent ?? "";
    expect(unnamed.trim()).not.toBe("");
    expect(unnamed).toMatch(/\d/);
  });

  it("shows no 'load more' on the last page, and one that asks for the cursor when there is a next", async () => {
    let page = await openScreen();
    expect(page.container.textContent).not.toContain(
      roMessages.accountKitchens.loadMore,
    );
    page.unmount();
    screen = undefined;
    kitchensWire = wirePage([wireKitchen(1, { name: nameLabel(1) })], {
      total: 5,
      nextCursor: "c1",
    });
    page = await openScreen();
    expect(page.container.textContent).toContain(
      roMessages.accountKitchens.loadMore,
    );
    kitchensWire = wirePage([wireKitchen(2, { name: nameLabel(2) })], {
      total: 5,
    });
    click(
      byWords(page.container, "button", roMessages.accountKitchens.loadMore),
    );
    await settle();
    expect(requests.at(-1)).toEqual({ flow: "kitchens", cursor: "c1" });
    expect(cards(page)).toHaveLength(2);
    expect(page.container.textContent).not.toContain(
      roMessages.accountKitchens.loadMore,
    );
  });

  it("states that nothing is saved for an account with no kitchens, with one way on", async () => {
    kitchensWire = wirePage([], { total: 0 });
    const page = await openScreen();
    expect(page.container.textContent).toContain(
      roMessages.accountKitchens.emptyTitle,
    );
    expect(
      byWords<HTMLAnchorElement>(
        page.container,
        "a",
        roMessages.accountKitchens.startKitchen,
      ).getAttribute("href"),
    ).toBe("/ro");
  });

  it("draws the forbidden screen for an account that may not have kitchens, not an expiry", async () => {
    sendSignedInRequest.mockImplementation(() =>
      Promise.resolve({ kind: "forbidden" }),
    );
    const page = await openScreen();
    expect(cards(page)).toHaveLength(0);
    expect(leaveFor).not.toHaveBeenCalled();
    expect(page.container.textContent).not.toContain(
      roMessages.sessionExpiredSheet.title,
    );
  });

  it("sends a session that ended to sign in with the reason that it expired", async () => {
    sendSignedInRequest.mockImplementation(() =>
      Promise.resolve({ kind: "unauthenticated" }),
    );
    await openScreen();
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
  });
});

describe("the count line", () => {
  const countText = (page: MountedScreen): string =>
    page.container.querySelector("[tabindex='-1']")?.textContent ?? "";

  it("counts the cards loaded on the last page, not the server's total, which includes documents it could not read", async () => {
    kitchensWire = wirePage(
      [
        wireKitchen(1, { name: nameLabel(1) }),
        wireKitchen(2, { name: nameLabel(2) }),
      ],
      { total: 5 },
    );
    const page = await openScreen();
    expect(countText(page)).toContain("2");
    expect(countText(page)).not.toContain("5");
  });

  it("counts the account's total while pages remain", async () => {
    kitchensWire = wirePage([wireKitchen(1, { name: nameLabel(1) })], {
      total: 5,
      nextCursor: "c1",
    });
    const page = await openScreen();
    expect(countText(page)).toContain("5");
  });

  it("does not take a list that gave up chasing empty pages for an empty account: it keeps the button that asks again", async () => {
    sendSignedInRequest.mockImplementation((request: SignedInRequest) => {
      requests.push(request);
      return Promise.resolve(
        received(
          wirePage([], { total: 4, nextCursor: `c${String(requests.length)}` }),
        ),
      );
    });
    const page = await openScreen();
    expect(requests).toHaveLength(10);
    expect(page.container.textContent).not.toContain(copyOf.ro.emptyTitle);
    expect(page.container.textContent).toContain(copyOf.ro.loadMore);
    expect(page.container.textContent).toContain(
      roMessages.accountForm.requestFailedTitle,
    );
  });
});

describe("a card", () => {
  it("opens its kitchen by a plain link whose name carries the full name", async () => {
    const longName = `Bucatarie ${"foarte lunga ".repeat(12)}`.trim();
    kitchensWire = wirePage([wireKitchen(1, { name: longName })]);
    const page = await openScreen();
    const link = byWords<HTMLAnchorElement>(
      page.container,
      "a",
      copyOf.ro.openNamed.replace("{name}", longName),
    );
    expect(link.getAttribute("href")).toBe(`/ro/d/${designIdOf(1)}`);
    expect(link.textContent).toBe(copyOf.ro.open);
    const heading = requireIn(page.container, "article h2");
    expect(heading.textContent).toBe(longName);
    expect(
      requireIn(page.container, "article").getAttribute("aria-labelledby"),
    ).toBe(heading.id);
    expect(dotsOf(page, longName).getAttribute("aria-label")).toContain(
      longName,
    );
  });

  it("links by the language of the page it is drawn in", async () => {
    const page = await openScreen("ru");
    expect(
      allIn<HTMLAnchorElement>(page.container, "article a").map((anchor) =>
        anchor.getAttribute("href"),
      ),
    ).toEqual([
      `/ru/d/${designIdOf(1)}`,
      `/ru/d/${designIdOf(2)}`,
      `/ru/d/${designIdOf(3)}`,
    ]);
  });

  it("says sent for a sent kitchen and draft for every other", async () => {
    const page = await openScreen();
    const kinds = cards(page).map((card) =>
      requireIn(card, "[data-kind]").getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["sent", "draft", "draft"]);
    expect(
      requireIn(cardOf(page, nameLabel(1)), "[data-kind]").textContent,
    ).toBe(copyOf.ro.sentBadge);
    expect(
      requireIn(cardOf(page, nameLabel(2)), "[data-kind]").textContent,
    ).toBe(copyOf.ro.draftBadge);
  });

  it("tells when it was last changed in a time element that carries the exact instant", async () => {
    const updatedAt = "2026-10-19T09:30:15.250Z";
    kitchensWire = wirePage([
      wireKitchen(1, { name: nameLabel(1), updatedAt }),
    ]);
    const page = await openScreen();
    const time = requireIn<HTMLTimeElement>(page.container, "time");
    expect(time.getAttribute("datetime")).toBe(updatedAt);
    expect(time.textContent).toContain(
      copyOf.ro.modified.replace("{when}", "").trim(),
    );
  });

  it("shows the starting price of a kitchen whose document can be priced", async () => {
    const page = await openScreen();
    const card = cardOf(page, nameLabel(1));
    expect(card.textContent).toContain(roMessages.price.startingPrefix);
    expect(card.textContent).toMatch(/\d[\d ]*\s*MDL/);
  });

  it("shows no price, and no zero, for a kitchen whose document this build cannot read", async () => {
    kitchensWire = wirePage([
      wireKitchen(1, { name: nameLabel(1), document: { not: "a design" } }),
    ]);
    const page = await openScreen();
    expect(cards(page)).toHaveLength(1);
    expect(page.container.textContent).not.toContain(
      roMessages.price.startingPrefix,
    );
    expect(page.container.textContent).not.toMatch(/\d\s*MDL/);
  });
});

describe("the menu of a card", () => {
  it("opens on its first row, names the kitchen, and flags the button as expanded", async () => {
    const page = await openScreen();
    const dots = dotsOf(page, nameLabel(2));
    expect(dots.getAttribute("aria-haspopup")).toBe("dialog");
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    click(dots);
    expect(dots.getAttribute("aria-expanded")).toBe("true");
    expect(requireIn(document.body, "[role=dialog] h2").textContent).toBe(
      nameLabel(2),
    );
    expect(document.activeElement?.textContent).toBe(copyOf.ro.menuRename);
  });

  it("offers rename, copy, share and, last, delete for a draft: never hide", async () => {
    const page = await openScreen();
    openMenu(page, nameLabel(2));
    expect(menuRows()).toEqual([
      copyOf.ro.menuRename,
      copyOf.ro.menuDuplicate,
      copyOf.ro.menuShare,
      copyOf.ro.menuDelete,
      copyOf.ro.close,
    ]);
  });

  it("offers hide, not delete, for a sent kitchen", async () => {
    const page = await openScreen();
    openMenu(page, nameLabel(1));
    expect(menuRows()).toEqual([
      copyOf.ro.menuRename,
      copyOf.ro.menuDuplicate,
      copyOf.ro.menuShare,
      copyOf.ro.menuHide,
      copyOf.ro.close,
    ]);
  });

  it("is told in Russian on the Russian site", async () => {
    const page = await openScreen("ru");
    openMenu(page, nameLabel(2), "ru");
    expect(menuRows()).toEqual([
      copyOf.ru.menuRename,
      copyOf.ru.menuDuplicate,
      copyOf.ru.menuShare,
      copyOf.ru.menuDelete,
      copyOf.ru.close,
    ]);
  });

  it("closes on Escape and returns focus to the button it was opened from", async () => {
    const page = await openScreen();
    const dots = dotsOf(page, nameLabel(2));
    click(dots);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(dots);
    expect(dots.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes from its own Close button", async () => {
    const page = await openScreen();
    openMenu(page, nameLabel(2));
    chooseRow(copyOf.ro.close);
    expect(dialog()).toBeNull();
  });
});

describe("deleting a draft", () => {
  async function askToDelete(name = nameLabel(2)): Promise<MountedScreen> {
    const page = await openScreen();
    openMenu(page, name);
    chooseRow(copyOf.ro.menuDelete);
    return page;
  }

  it("asks first, opening on 'Anuleaza' so that a destructive button is never pre-focused", async () => {
    await askToDelete();
    const asking = requireIn(document.body, "[role=alertdialog]");
    expect(requireIn(asking, "h2").textContent).toBe(
      copyOf.ro.deleteTitle.replace("{name}", nameLabel(2)),
    );
    expect(document.activeElement?.textContent).toBe(copyOf.ro.cancel);
    expect(actionRequests()).toEqual([]);
  });

  it("changes nothing when the person cancels", async () => {
    const page = await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.cancel,
      ),
    );
    expect(dialog()).toBeNull();
    expect(actionRequests()).toEqual([]);
    expect(cards(page)).toHaveLength(3);
  });

  it("sends one delete for that kitchen, takes the card off, counts one fewer and says so", async () => {
    const page = await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    expect(actionRequests()).toEqual([
      { flow: "kitchen-action", id: designIdOf(2), action: { kind: "delete" } },
    ]);
    await settle();
    expect(dialog()).toBeNull();
    expect(
      cards(page).map((card) => card.querySelector("h2")?.textContent),
    ).not.toContain(nameLabel(2));
    expect(cards(page)).toHaveLength(2);
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.deleted);
    expect(
      page.container.querySelector("[tabindex='-1']")?.textContent,
    ).toContain("2");
  });

  it("presses twice and sends once", async () => {
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    respondToAction = () =>
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      });
    await askToDelete();
    const confirm = byWords(
      requireIn(document.body, "[role=alertdialog]"),
      "button",
      copyOf.ro.deleteConfirm,
    );
    click(confirm);
    const busy = byWords(
      requireIn(document.body, "[role=alertdialog]"),
      "button",
      copyOf.ro.deleteBusy,
    );
    click(busy);
    expect(actionRequests()).toHaveLength(1);
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(dialog()).not.toBeNull();
    await act(async () => {
      answer({ kind: "succeeded" });
      await Promise.resolve();
    });
    await settle();
    expect(dialog()).toBeNull();
  });

  it("learns on a 409 that the kitchen was sent meanwhile: the card is corrected, the dialog closes, the toast says why, and nothing is removed", async () => {
    respondToAction = () => ({ kind: "conflict-sent" });
    const page = await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    await settle();
    expect(dialog()).toBeNull();
    expect(cards(page)).toHaveLength(3);
    expect(
      requireIn(cardOf(page, nameLabel(2)), "[data-kind]").getAttribute(
        "data-kind",
      ),
    ).toBe("sent");
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.sentMeanwhile);
    openMenu(page, nameLabel(2));
    expect(menuRows()).toContain(copyOf.ro.menuHide);
    expect(menuRows()).not.toContain(copyOf.ro.menuDelete);
  });

  it("learns on the one 404 that the kitchen is no longer the account's: the card goes and the toast says it is gone", async () => {
    respondToAction = () => ({ kind: "kitchen-unavailable" });
    const page = await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    await settle();
    expect(dialog()).toBeNull();
    expect(
      cards(page).map((card) => card.querySelector("h2")?.textContent),
    ).not.toContain(nameLabel(2));
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.alreadyGone);
  });

  it.each([
    [
      "no connection",
      { kind: "unanswered" } as SignedInOutcome,
      roMessages.accountForm.offlineTitle,
    ],
    [
      "a service that was not there",
      { kind: "unavailable" } as SignedInOutcome,
      roMessages.accountForm.unavailableTitle,
    ],
    [
      "a refused request",
      { kind: "request-failed" } as SignedInOutcome,
      roMessages.accountForm.requestFailedTitle,
    ],
  ])(
    "stays open and says so after %s, with the act available again and the card kept",
    async (_, outcome, title) => {
      respondToAction = () => outcome;
      const page = await askToDelete();
      click(
        byWords(
          requireIn(document.body, "[role=alertdialog]"),
          "button",
          copyOf.ro.deleteConfirm,
        ),
      );
      await settle();
      const asking = requireIn(document.body, "[role=alertdialog]");
      expect(asking.textContent).toContain(title);
      expect(
        byWords(asking, "button", copyOf.ro.deleteConfirm).getAttribute(
          "aria-disabled",
        ),
      ).toBeNull();
      expect(cards(page)).toHaveLength(3);
      respondToAction = () => ({ kind: "succeeded" });
      click(byWords(asking, "button", copyOf.ro.deleteConfirm));
      await settle();
      expect(dialog()).toBeNull();
      expect(cards(page)).toHaveLength(2);
    },
  );

  it("tells a limit with its wait inside the dialog, which stays", async () => {
    respondToAction = () => ({
      kind: "rate-limited",
      wait: { kind: "minutes", minutes: 12 },
    });
    await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    await settle();
    expect(
      requireIn(document.body, "[role=alertdialog]").textContent,
    ).toContain("12 min");
  });

  it("sends a person whose session ended to sign in, never to a raw word, leaving the dialog busy", async () => {
    respondToAction = () => ({ kind: "unauthenticated" });
    await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    await settle();
    expect(leaveFor).toHaveBeenCalledExactlyOnceWith(
      "/ro/account/login?reason=session-expired",
    );
    expect(dialog()).not.toBeNull();
  });

  it("draws the forbidden screen for a 403, and never the expiry", async () => {
    respondToAction = () => ({ kind: "forbidden" });
    const page = await askToDelete();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.deleteConfirm,
      ),
    );
    await settle();
    expect(leaveFor).not.toHaveBeenCalled();
    expect(cards(page)).toHaveLength(0);
  });
});

describe("hiding a sent kitchen", () => {
  async function askToHide(): Promise<MountedScreen> {
    const page = await openScreen();
    openMenu(page, nameLabel(1));
    chooseRow(copyOf.ro.menuHide);
    return page;
  }

  it("asks first, opening on 'Anuleaza', and says the shop keeps seeing it", async () => {
    await askToHide();
    const asking = requireIn(document.body, "[role=alertdialog]");
    expect(requireIn(asking, "h2").textContent).toBe(copyOf.ro.hideTitle);
    expect(document.activeElement?.textContent).toBe(copyOf.ro.cancel);
    expect(allIn(asking, "strong")).toHaveLength(
      (copyOf.ro.hideBody.match(/<strong>/g) ?? []).length,
    );
    expect(actionRequests()).toEqual([]);
  });

  it("sends one hide, removes the card and says it was hidden", async () => {
    const page = await askToHide();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.hideConfirm,
      ),
    );
    expect(actionRequests()).toEqual([
      { flow: "kitchen-action", id: designIdOf(1), action: { kind: "hide" } },
    ]);
    await settle();
    expect(dialog()).toBeNull();
    expect(cards(page)).toHaveLength(2);
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.hidden);
  });

  it("learns on a 409 that it was never sent: the card becomes a draft, deletable, and the toast says so", async () => {
    respondToAction = () => ({ kind: "conflict-not-sent" });
    const page = await askToHide();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.hideConfirm,
      ),
    );
    await settle();
    expect(dialog()).toBeNull();
    expect(cards(page)).toHaveLength(3);
    expect(
      requireIn(cardOf(page, nameLabel(1)), "[data-kind]").getAttribute(
        "data-kind",
      ),
    ).toBe("draft");
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.notSentMeanwhile);
    openMenu(page, nameLabel(1));
    expect(menuRows()).toContain(copyOf.ro.menuDelete);
    expect(menuRows()).not.toContain(copyOf.ro.menuHide);
  });

  it("learns on the 404 that it is gone", async () => {
    respondToAction = () => ({ kind: "kitchen-unavailable" });
    const page = await askToHide();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.hideConfirm,
      ),
    );
    await settle();
    expect(cards(page)).toHaveLength(2);
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.alreadyGone);
  });

  it("never lets a conflict for hide be read as one for delete: a 'sent' conflict on a hide is a failure", async () => {
    respondToAction = () => ({ kind: "conflict-sent" });
    const page = await askToHide();
    click(
      byWords(
        requireIn(document.body, "[role=alertdialog]"),
        "button",
        copyOf.ro.hideConfirm,
      ),
    );
    await settle();
    expect(
      requireIn(document.body, "[role=alertdialog]").textContent,
    ).toContain(roMessages.accountForm.requestFailedTitle);
    expect(cards(page)).toHaveLength(3);
  });
});

describe("copying a kitchen", () => {
  async function copyOfTwo(): Promise<MountedScreen> {
    const page = await openScreen();
    openMenu(page, nameLabel(2));
    chooseRow(copyOf.ro.menuDuplicate);
    return page;
  }

  it("composes the full name with the catalogue's pattern, sends it, shows a busy card, then the real copy first", async () => {
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    respondToAction = () =>
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      });
    const page = await copyOfTwo();
    const expectedName = copyOf.ro.copyName.replace("{name}", nameLabel(2));
    expect(actionRequests()).toEqual([
      {
        flow: "kitchen-action",
        id: designIdOf(2),
        action: { kind: "duplicate", name: expectedName },
      },
    ]);
    expect(dialog()).toBeNull();
    expect(page.container.textContent).toContain(copyOf.ro.copying);
    expect(
      requireIn(page.container, "article[aria-busy=true] h2").textContent,
    ).toBe(expectedName);

    await act(async () => {
      answer({ kind: "created", id: designIdOf(50) });
      await Promise.resolve();
    });
    await settle();
    expect(page.container.querySelector("article[aria-busy=true]")).toBeNull();
    expect(cards(page)[0]?.querySelector("h2")?.textContent).toBe(expectedName);
    expect(
      byWords<HTMLAnchorElement>(
        firstCard(page),
        "a",
        copyOf.ro.openNamed.replace("{name}", expectedName),
      ).getAttribute("href"),
    ).toBe(`/ro/d/${designIdOf(50)}`);
    expect(
      requireIn(firstCard(page), "[data-kind]").getAttribute("data-kind"),
    ).toBe("draft");
    expect(
      document.body.querySelector("[role=status]:not(:empty)")?.textContent,
    ).toContain(copyOf.ro.copyCreated);
    expect(cards(page)).toHaveLength(4);
  });

  it("keeps the whole name within the server's bound for a source name at the bound", async () => {
    const longName = "x".repeat(120);
    kitchensWire = wirePage([wireKitchen(1, { name: longName })]);
    const page = await openScreen();
    openMenu(page, longName);
    chooseRow(copyOf.ro.menuDuplicate);
    const [request] = actionRequests();
    const sent =
      request?.flow === "kitchen-action" && request.action.kind === "duplicate"
        ? request.action.name
        : "";
    expect(Array.from(sent).length).toBeLessThanOrEqual(120);
    expect(sent.endsWith(copyOf.ro.copyName.replace("{name}", "").trim())).toBe(
      true,
    );
  });

  it("marks 'copy' busy while one is out and sends a second only after the first is answered", async () => {
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    respondToAction = () =>
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      });
    const page = await copyOfTwo();
    openMenu(page, nameLabel(1));
    const row = byWords(
      requireIn(document.body, "[role=dialog]"),
      "button",
      copyOf.ro.menuDuplicate,
    );
    expect(row.getAttribute("aria-disabled")).toBe("true");
    click(row);
    expect(actionRequests()).toHaveLength(1);
    await act(async () => {
      answer({ kind: "created", id: designIdOf(51) });
      await Promise.resolve();
    });
    await settle();
  });

  it.each([
    [
      "a failure no word explains",
      { kind: "request-failed" } as SignedInOutcome,
      copyOf.ro.copyFailed,
    ],
    [
      "a failed invalid name",
      {
        kind: "invalid-input",
        issues: [{ field: "name", code: "TOO_LONG" }],
      } as SignedInOutcome,
      copyOf.ro.copyFailed,
    ],
  ])(
    "tells %s in a toast, removing the busy card",
    async (_, outcome, sentence) => {
      respondToAction = () => outcome;
      const page = await copyOfTwo();
      await settle();
      expect(
        page.container.querySelector("article[aria-busy=true]"),
      ).toBeNull();
      expect(cards(page)).toHaveLength(3);
      expect(
        document.body.querySelector("[role=status]:not(:empty)")?.textContent,
      ).toContain(sentence);
    },
  );

  it("tells no connection in a notice that stays until dismissed", async () => {
    respondToAction = () => ({ kind: "unanswered" });
    const page = await copyOfTwo();
    await settle();
    expect(page.container.textContent).toContain(
      roMessages.accountForm.offlineTitle,
    );
    click(byWords(page.container, "button", copyOf.ro.close));
    expect(page.container.textContent).not.toContain(
      roMessages.accountForm.offlineTitle,
    );
  });
});

describe("renaming a kitchen", () => {
  async function beginRename(
    name = nameLabel(2),
  ): Promise<{ page: MountedScreen; field: HTMLInputElement }> {
    const page = await openScreen();
    openMenu(page, name);
    chooseRow(copyOf.ro.menuRename);
    const field = requireIn<HTMLInputElement>(
      page.container,
      "input[name=kitchen-name]",
    );
    return { page, field };
  }

  it("opens a field holding the shown name, focused", async () => {
    const { field } = await beginRename();
    expect(field.value).toBe(nameLabel(2));
    expect(document.activeElement).toBe(field);
  });

  it("sends nothing for a name the person left as it was", async () => {
    const { page } = await beginRename();
    submitFormIn(page.container);
    await settle();
    expect(actionRequests()).toEqual([]);
    expect(page.container.querySelector("input[name=kitchen-name]")).toBeNull();
  });

  it("refuses an empty name before any request, in the field", async () => {
    const { page, field } = await beginRename();
    typeInto(field, "   ");
    submitFormIn(page.container);
    await settle();
    expect(actionRequests()).toEqual([]);
    expect(page.container.textContent).toContain(copyOf.ro.renameRequired);
  });

  it("sends the name as the server reads it (trimmed) and shows the name the server kept", async () => {
    respondToAction = (request) =>
      request.flow === "kitchen-action" && request.action.kind === "rename"
        ? { kind: "renamed", name: request.action.name }
        : { kind: "request-failed" };
    const { page, field } = await beginRename();
    typeInto(field, "  Bucatarie noua  ");
    submitFormIn(page.container);
    await settle();
    expect(actionRequests()).toEqual([
      {
        flow: "kitchen-action",
        id: designIdOf(2),
        action: { kind: "rename", name: "Bucatarie noua" },
      },
    ]);
    expect(
      cards(page).map((card) => card.querySelector("h2")?.textContent),
    ).toContain("Bucatarie noua");
    expect(page.container.querySelector("input[name=kitchen-name]")).toBeNull();
  });

  it("puts the server's refusal of the name beside the field and keeps the field open", async () => {
    respondToAction = () => ({
      kind: "invalid-input",
      issues: [{ field: "name", code: "TOO_LONG" }],
    });
    const { page, field } = await beginRename();
    typeInto(field, "x");
    submitFormIn(page.container);
    await settle();
    expect(
      page.container.querySelector("input[name=kitchen-name]"),
    ).not.toBeNull();
    expect(
      page.container.querySelector("[role=alert], [data-invalid=true]"),
    ).not.toBeNull();
  });
});
