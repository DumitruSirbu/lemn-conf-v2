// @vitest-environment happy-dom
//
// **M7C C1 S3 (FB-001): both back links ask before they navigate.**
//
// The harness stands a link and a sibling band in a `<main>`, wired exactly as `configure-screen.tsx`
// wires them — `useBackConfirmation().ask` on the link, `BackConfirmation` while `isAsking` — so what
// is asserted is the behaviour of the two production modules. That the screen wires both of its links
// the same way is the source-text test at the bottom, the strongest guard a harness leaves.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../../../src/messages/ro.json";
import ruMessages from "../../../../src/messages/ru.json";
import { APPROVED_ROMANIAN_MESSAGES } from "../../../support/approved-romanian-messages";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../../../support/romanian-content");
  return { useContent: () => ro };
});
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));

import { ConfirmStep } from "@/settings/confirmation-dialog";
import settingsStyles from "@/settings/global-settings.module.css";
import { BackConfirmation } from "@/app/configurator/configure/back-confirmation";
import { useBackConfirmation } from "@/app/configurator/configure/use-back-confirmation";

const footerClasses = {
  base: settingsStyles.footer ?? "",
  centred: settingsStyles.footerCentred ?? "",
};
const ROOM_HREF = "/room?shape=l&a=3600&b=2400";
const { title, body, confirm, stay } = roMessages.configure.backConfirm;

function ScreenWithBackLink(): ReactElement {
  const backConfirmation = useBackConfirmation();
  return createElement(
    "main",
    null,
    createElement(
      "header",
      null,
      createElement(
        "a",
        {
          href: ROOM_HREF,
          "data-testid": "back-link",
          onClick: backConfirmation.ask,
        },
        "back",
      ),
    ),
    createElement("div", { "data-testid": "other-band" }, "stage"),
    backConfirmation.isAsking
      ? createElement(BackConfirmation, {
          roomHref: ROOM_HREF,
          onStay: backConfirmation.stay,
        })
      : null,
  );
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  router.push.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(createElement(ScreenWithBackLink));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function byTestId(testId: string): HTMLElement {
  const element = host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`nothing rendered ${testId}`);
  return element;
}

function dialog(): HTMLElement | null {
  return host.querySelector<HTMLElement>('[data-testid="back-confirm-dialog"]');
}

function clickBackLink(init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    byTestId("back-link").dispatchEvent(event);
  });
  return event;
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

describe("the back link's confirmation", () => {
  it("opens instead of navigating, and navigates nowhere", () => {
    const event = clickBackLink();

    expect(event.defaultPrevented).toBe(true);
    expect(dialog()).not.toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("says exactly the approved sentence and offers exactly the two approved buttons", () => {
    clickBackLink();

    expect(byTestId("back-confirm-confirm-body").textContent).toBe(body);
    expect(byTestId("back-confirm-confirm").textContent).toBe(confirm);
    expect(byTestId("back-confirm-confirm-back").textContent).toBe(stay);
    expect(dialog()?.querySelectorAll("button")).toHaveLength(2);
  });

  it("is a modal dialog named by its heading and described by its body", () => {
    clickBackLink();

    const heading = dialog()?.querySelector("h2");
    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(heading?.textContent).toBe(title);
    expect(dialog()?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(dialog()?.getAttribute("aria-describedby")).toBe(
      byTestId("back-confirm-confirm-body").id,
    );
  });

  it("puts focus in the dialog and the rest of the screen out of reach while it is open", () => {
    clickBackLink();

    expect(document.activeElement).toBe(dialog());
    expect(byTestId("back-link").closest("header")?.hasAttribute("inert")).toBe(
      true,
    );
    expect(byTestId("other-band").hasAttribute("inert")).toBe(true);
    expect(dialog()?.parentElement?.hasAttribute("inert")).toBe(false);
  });

  it("Stay closes it, returns focus to the link and navigates nowhere", () => {
    clickBackLink();
    act(() => {
      byTestId("back-confirm-confirm-back").click();
    });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byTestId("back-link"));
    expect(byTestId("other-band").hasAttribute("inert")).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("treats Escape as Stay", () => {
    clickBackLink();
    press("Escape");

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byTestId("back-link"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("treats a press on the backdrop as Stay", () => {
    clickBackLink();
    act(() => {
      byTestId("back-confirm-scrim").click();
    });

    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byTestId("back-link"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Confirm makes the one navigation the link would have made, and no request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    clickBackLink();
    act(() => {
      byTestId("back-confirm-confirm").click();
    });

    expect(router.push).toHaveBeenCalledExactlyOnceWith(ROOM_HREF);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps Tab inside the dialog from either end", () => {
    clickBackLink();
    const [stayButton, confirmButton] = [
      byTestId("back-confirm-confirm-back"),
      byTestId("back-confirm-confirm"),
    ];

    confirmButton.focus();
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stayButton);

    stayButton.focus();
    expect(press("Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirmButton);
  });

  it.each(["ctrlKey", "metaKey", "shiftKey", "altKey"] as const)(
    "lets a %s click open elsewhere without asking",
    (modifier) => {
      const event = clickBackLink({ [modifier]: true });

      expect(event.defaultPrevented).toBe(false);
      expect(dialog()).toBeNull();
    },
  );
});

/** The footer is the button row's parent's parent: button, `.actions`, `.footer`. */
function footerOf(root: ParentNode, testId: string): HTMLElement {
  const footer = root.querySelector(`[data-testid="${testId}"]`)?.parentElement
    ?.parentElement;
  if (!footer) throw new Error(`no footer around ${testId}`);
  return footer;
}

describe("where the dialog's two buttons stand", () => {
  const CENTRED_RULE = /\.footerCentred\s*\{[^}]*justify-content:\s*center;/;
  const SETTINGS_CSS = readFileSync(
    resolve(__dirname, "../../../../src/settings/global-settings.module.css"),
    "utf8",
  );

  it("declares a centred footer variant, which the settings footer's own rule does not share (a declaration pin; the measured layout is QA's)", () => {
    expect(SETTINGS_CSS).toMatch(CENTRED_RULE);
    const baseRule = /\n\.footer\s*\{[^}]*\}/.exec(SETTINGS_CSS)?.[0] ?? "";
    expect(baseRule).toContain("justify-content: space-between;");
  });

  it("puts the back confirmation's footer on that variant", () => {
    clickBackLink();

    expect(footerOf(host, "back-confirm-confirm").className).toContain(
      footerClasses.centred,
    );
  });

  it("leaves the settings confirm step's footer on the base rule alone", () => {
    act(() => {
      root.render(
        createElement(ConfirmStep, {
          step: {
            view: { title, body, confirmLabel: confirm, backLabel: stay },
            onConfirm: () => undefined,
            onStepBack: () => undefined,
          },
          editability: { isReadOnly: false, disabledReason: "" },
        }),
      );
    });

    const footer = footerOf(host, "global-settings-confirm");
    expect(footer.className).toContain(footerClasses.base);
    expect(footer.className).not.toContain(footerClasses.centred);
  });
});

describe("the dialog's approved heading", () => {
  it.each([
    ["ro", roMessages, APPROVED_ROMANIAN_MESSAGES.configure.backConfirm.title],
    ["ru", ruMessages, "Изменения будут потеряны"],
  ] as const)(
    "is exactly the owner's wording in %s",
    (_locale, messages, approved) => {
      expect(messages.configure.backConfirm.title).toBe(approved);
    },
  );
});

describe("the configure screen's wiring", () => {
  const SOURCE = readFileSync(
    resolve(
      __dirname,
      "../../../../src/app/configurator/configure/configure-screen.tsx",
    ),
    "utf8",
  );

  it("asks from both back links, the top bar's and the bottom bar's", () => {
    expect(SOURCE.match(/onClick=\{backConfirmation\.ask\}/g)).toHaveLength(2);
  });

  it("mounts the question only while it is open", () => {
    expect(SOURCE).toContain("backConfirmation.isAsking && (");
  });
});
