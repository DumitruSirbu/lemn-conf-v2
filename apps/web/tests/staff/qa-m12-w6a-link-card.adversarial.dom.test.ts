// @vitest-environment happy-dom
//
// M12 W6a adversarial: the request card without a reference, the link card's copy races, and the page's requests.
// Counterexamples sought: a reference that still reaches the page from a wire that carries one, a share request in the
// page's life, a copy answer that belongs to a press other than the last, an answer that comes back for an address no
// longer shown, and a write that finishes after the card is gone.
import { describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { click } from "../support/render-with-intl";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  FEWER_BODIES_DESIGN,
  chooseVersion,
  deferred,
  inPage,
  mountWith,
  screen,
  server,
  setUpLinkCardPage,
  settle,
  unmountPage,
} from "../support/staff-link-card-page";

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

const words = roMessages.staffKitchen;
const HOSTILE_REFERENCE = "LM-2026-0042<img src=x onerror=alert(1)>";
const TWO_VERSIONS = wireKitchen({ kitchen: { asSent: FEWER_BODIES_DESIGN } });

setUpLinkCardPage();

describe("a request wire that still carries a reference (an older server, a forged answer)", () => {
  it("draws no reference anywhere on the page, and still draws the request card with its contact note", async () => {
    await mountWith(
      wireKitchen({
        request: {
          reference: HOSTILE_REFERENCE,
          sentAt: "2026-10-17T11:08:00.000Z",
        },
      }),
    );

    if (screen === undefined) throw new Error("nothing is mounted");
    expect(screen.container.innerHTML).not.toContain("LM-2026-0042");
    expect(screen.container.querySelector("img")).toBeNull();
    expect(inPage("staff-kitchen-request").textContent).toBe(
      `${words.requestTitle}${words.requestContactNote}`,
    );
  });

  it("draws the request card as a title and the contact note and nothing else: no date line, no empty paragraph", async () => {
    await mountWith(wireKitchen());

    const card = inPage("staff-kitchen-request");
    expect(card.querySelectorAll("p")).toHaveLength(1);
    expect(card.textContent).not.toMatch(/\d{4}/);
  });

  it("draws no request card for a draft, which has no request", async () => {
    await mountWith(wireKitchen({ request: null }));

    expect(
      screen?.container.querySelector('[data-testid="staff-kitchen-request"]'),
    ).toBeNull();
  });
});

describe("no share link is minted in the page's life", () => {
  it("sends no request to a share endpoint while the page loads, a version is chosen, the address is copied and the link is pressed", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.resolve() },
    });
    await mountWith(TWO_VERSIONS);

    chooseVersion("current");
    click(inPage("staff-kitchen-link-copy"));
    await settle();
    click(inPage("staff-kitchen-open-3d"));
    await settle();

    const urls = (server?.requests ?? []).map(
      ({ url }) => `${url.pathname}${url.search}`,
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => /share|token|view-link/i.test(url))).toEqual(
      [],
    );
    expect(
      (server?.requests ?? []).filter(
        ({ init }) => (init.method ?? "GET").toUpperCase() !== "GET",
      ),
    ).toEqual([]);
  });
});

describe("the copy answer belongs to the last press and to the address on screen", () => {
  it("says copied when the newest press succeeded, though an older press refuses later", async () => {
    const older = deferred<undefined>();
    const newer = deferred<undefined>();
    const writeText = vi
      .fn<(text: string) => Promise<undefined>>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mountWith(wireKitchen());

    click(inPage("staff-kitchen-link-copy"));
    click(inPage("staff-kitchen-link-copy"));
    newer.resolve(undefined);
    await settle();
    older.reject(new Error("denied"));
    await settle();

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(inPage("staff-kitchen-link-outcome").textContent).toBe(
      words.linkCopied,
    );
  });

  it("says nothing when a write for the address no longer shown finishes after a version switch", async () => {
    const pending = deferred<undefined>();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => pending.promise },
    });
    await mountWith(TWO_VERSIONS);

    click(inPage("staff-kitchen-link-copy"));
    chooseVersion("current");
    pending.resolve(undefined);
    await settle();

    expect(inPage("staff-kitchen-link-outcome").textContent).toBe("");
  });

  it("copies the address on screen after a switch, not the one of an earlier press", async () => {
    const writeText = vi.fn<(text: string) => Promise<undefined>>(() =>
      Promise.resolve(undefined),
    );
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mountWith(TWO_VERSIONS);
    click(inPage("staff-kitchen-link-copy"));
    await settle();

    chooseVersion("current");
    click(inPage("staff-kitchen-link-copy"));
    await settle();

    expect(writeText.mock.calls.map(([text]) => text)).toEqual([
      expect.stringContaining("?version=sent"),
      expect.stringContaining("?version=current"),
    ]);
  });
});

describe("a clipboard that is not quite there", () => {
  it.each([
    ["a clipboard with no writeText", { clipboard: {} }],
    ["a clipboard that is null", { clipboard: null }],
    [
      "a clipboard whose writeText is not a function",
      { clipboard: { writeText: 1 } },
    ],
  ])("says refused for %s and throws nothing", async (_, navigatorStub) => {
    vi.stubGlobal("navigator", navigatorStub);
    await mountWith(wireKitchen());

    click(inPage("staff-kitchen-link-copy"));
    await settle();

    expect(inPage("staff-kitchen-link-outcome").textContent).toBe(
      words.linkCopyRefused,
    );
  });

  it("recovers: a refusal is replaced by copied when the next press is accepted", async () => {
    const writeText = vi
      .fn<(text: string) => Promise<undefined>>()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mountWith(wireKitchen());

    click(inPage("staff-kitchen-link-copy"));
    await settle();
    click(inPage("staff-kitchen-link-copy"));
    await settle();

    expect(inPage("staff-kitchen-link-outcome").textContent).toBe(
      words.linkCopied,
    );
  });

  it("raises no error and no React warning when the write finishes after the page is gone", async () => {
    const pending = deferred<undefined>();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => pending.promise },
    });
    const complaints = vi.spyOn(console, "error").mockImplementation(() => {
      // Any warning here is the failure.
    });
    await mountWith(wireKitchen());
    click(inPage("staff-kitchen-link-copy"));

    unmountPage();
    pending.resolve(undefined);
    await settle();

    expect(complaints).not.toHaveBeenCalled();
  });
});

describe("the card's names", () => {
  it("has exactly one copy button and one open link, each named by its words, under one heading", async () => {
    await mountWith(wireKitchen());

    const card = inPage("staff-kitchen-link");
    const buttons = [...card.querySelectorAll("button")];
    const links = [...card.querySelectorAll("a")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      words.linkCopy,
    ]);
    expect(links.map((link) => link.textContent)).toEqual([words.open3d]);
    expect(card.querySelectorAll("h2")).toHaveLength(1);
    expect(card.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(
      card.querySelector("button")?.getAttribute("aria-disabled"),
    ).toBeNull();
    expect(card.querySelector("button")?.hasAttribute("disabled")).toBe(false);
  });

  it("keeps the whole page to one live status region owned by the card's copy answer", async () => {
    await mountWith(wireKitchen());

    const card = inPage("staff-kitchen-link");
    const outcome = card.querySelector('[role="status"]');
    expect(outcome?.getAttribute("aria-live")).toBe("polite");
    expect(outcome?.getAttribute("aria-atomic") ?? "true").toBe("true");
  });
});
