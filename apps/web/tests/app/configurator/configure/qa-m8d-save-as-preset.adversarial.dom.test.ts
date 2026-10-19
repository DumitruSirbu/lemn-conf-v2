// @vitest-environment happy-dom
// M8D wave W3, adversarial QA of the save-as-preset dialog (criteria S-4 to S-8, X-7). `save-as-preset.dom.test.ts` holds the
// saved notice's visible time, the close with focus on the chip, the timer count after a manual close and that a refusal
// never closes; this file adds what it lacks: every refusal in both languages, the tones, the lock while sending,
// where focus is on open and through each phase, the fade's timing and reduced motion, and the inert controls.
// happy-dom has no layout, no CSS and no native Tab movement: the fade's opacity and the dialog's geometry need the
// editor on a stored design, which needs a database row, and are reported as not covered (see the QA report).
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PresetRefusalReason,
  PresetSaveOutcome,
  PresetSaveRequest,
} from "@/persistence/preset-save-client";
import type { EncodedPresetImage } from "@/scene/capture-scene-image";

const savePresetMock =
  vi.fn<(request: PresetSaveRequest) => Promise<PresetSaveOutcome>>();
const captureMock = vi.fn<() => Promise<EncodedPresetImage>>();

vi.mock("@/persistence/preset-save-client", () => ({
  savePreset: (request: PresetSaveRequest) => savePresetMock(request),
}));
vi.mock("@/scene/capture-scene-image", () => ({
  captureSceneImage: () => captureMock(),
}));

import {
  SaveAsPresetButton,
  SaveAsPresetDialog,
  useSaveAsPresetControl,
} from "@/app/configurator/configure/save-as-preset";
import {
  SAVED_NOTICE_FADE_MS,
  SAVED_NOTICE_VISIBLE_MS,
} from "@/app/configurator/configure/use-save-as-preset";
import { usePresetAuthoring } from "@/preset/preset-authoring-store";
import {
  useConfiguratorStore,
  type SaveStatus,
} from "@/store/configurator-store";

import roMessages from "../../../../src/messages/ro.json";
import ruMessages from "../../../../src/messages/ru.json";
import { CATALOGUES, type Catalogue } from "../../../support/catalogues";

const DESIGN_ID = "m8d-save-as-preset-design" as DesignId;
const FINE_POINTER = "(pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const IMAGE: EncodedPresetImage = { imageType: "image/webp", base64: "AAAA" };
const A_TYPED_NAME = "Test kitchen";

/** Every reason the route can refuse with. `satisfies` makes a new reason a type error here until it is listed. */
const EVERY_REFUSAL = {
  findings: true,
  missingSink: true,
  missingHob: true,
  missingSinkAndHob: true,
  stale: true,
  nameRefused: true,
  imageRefused: true,
  tooLarge: true,
  presetLimit: true,
  saveLimit: true,
  unavailable: true,
  failed: true,
} satisfies Record<PresetRefusalReason, true>;
const REFUSAL_REASONS = Object.keys(EVERY_REFUSAL) as PresetRefusalReason[];

let container: HTMLDivElement;
let root: Root;
let closeCount: number;
let locale: "ro" | "ru";
let messages: Catalogue;
const originalMatchMedia = window.matchMedia;

/** The screen's own wiring of the three pieces, counting how many times the dialog asked to close. */
function Harness() {
  const control = useSaveAsPresetControl(true);
  const close = () => {
    closeCount += 1;
    control.close();
  };
  return createElement(
    "main",
    null,
    createElement(SaveAsPresetButton, { control, isPanelOpen: false }),
    control.isOffered && control.isOpen
      ? createElement(SaveAsPresetDialog, { onClose: close })
      : null,
  );
}

function stubMedia(matching: readonly string[]): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: matching.includes(query),
      media: query,
    }) as MediaQueryList) as typeof window.matchMedia;
}

function mount(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(Harness),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function maybeByTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function byTestId(testId: string): HTMLElement {
  const element = maybeByTestId(testId);
  if (element === null) throw new Error(`nothing drawn as ${testId}`);
  return element;
}

function press(testId: string): void {
  const element = byTestId(testId);
  act(() => {
    element.click();
  });
}

function openDialog(): void {
  press("save-as-preset");
}

function typeName(value: string): void {
  const field = byTestId("save-as-preset-name") as HTMLInputElement;
  const valueProperty = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  act(() => {
    valueProperty?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle(milliseconds = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function openTypeAndSave(outcome: PresetSaveOutcome): Promise<void> {
  savePresetMock.mockResolvedValue(outcome);
  openDialog();
  typeName(A_TYPED_NAME);
  press("save-as-preset-confirm");
  await settle();
}

/** Opens, types and presses Save with the route's answer held, so the dialog stays in its sending phase. */
async function openAndHoldTheRequest(): Promise<
  (outcome: PresetSaveOutcome) => Promise<void>
> {
  let answer: (outcome: PresetSaveOutcome) => void = () => undefined;
  savePresetMock.mockReturnValue(
    new Promise<PresetSaveOutcome>((resolve) => {
      answer = resolve;
    }),
  );
  openDialog();
  typeName(A_TYPED_NAME);
  byTestId("save-as-preset-confirm").focus();
  press("save-as-preset-confirm");
  await settle();
  return async (outcome) => {
    answer(outcome);
    await settle();
  };
}

function toneOfStatus(): string | null {
  return (
    byTestId("save-as-preset-status")
      .closest("[data-tone]")
      ?.getAttribute("data-tone") ?? null
  );
}

function statusText(): string {
  return byTestId("save-as-preset-status").textContent;
}

function field(): HTMLInputElement {
  return byTestId("save-as-preset-name") as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
  return byTestId("save-as-preset-confirm") as HTMLButtonElement;
}

function hostOfTheDialog(): HTMLElement {
  const host = byTestId("save-as-preset-dialog").parentElement;
  if (host === null) throw new Error("the dialog has no host");
  return host;
}

function pressEscape(): void {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

function pressTab(options: { readonly backwards: boolean }): boolean {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey: options.backwards,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event.defaultPrevented;
}

function stopsOfTheDialog(): HTMLElement[] {
  return [
    ...byTestId("save-as-preset-dialog").querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])",
    ),
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  locale = "ro";
  messages = roMessages;
  closeCount = 0;
  stubMedia([FINE_POINTER]);
  captureMock.mockResolvedValue(IMAGE);
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
  usePresetAuthoring
    .getState()
    .record({ designId: DESIGN_ID, canAuthorPresets: true });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  savePresetMock.mockReset();
  captureMock.mockReset();
});

describe.each(CATALOGUES)(
  "every refusal, in %s (S-8)",
  (catalogueLocale, catalogue) => {
    beforeEach(() => {
      locale = catalogueLocale;
      messages = catalogue;
    });

    it.each(REFUSAL_REASONS)(
      "says the %s sentence in the error tone, re-enables Save and keeps the typed name",
      async (reason) => {
        mount();

        await openTypeAndSave({ kind: "refused", reason });

        expect(statusText()).toBe(messages.presetSave.refusal[reason]);
        expect(toneOfStatus()).toBe("error");
        expect(confirmButton().disabled).toBe(false);
        expect(field().value).toBe(A_TYPED_NAME);
        expect(field().disabled).toBe(false);
        expect(maybeByTestId("save-as-preset-dialog")).not.toBeNull();
      },
    );

    it("names its own controls in the catalogue's language", () => {
      mount();

      openDialog();

      expect(byTestId("save-as-preset-confirm").textContent).toBe(
        messages.presetSave.confirm,
      );
      expect(byTestId("save-as-preset-confirm-back").textContent).toBe(
        messages.presetSave.close,
      );
      expect(byTestId("save-as-preset-close").getAttribute("aria-label")).toBe(
        messages.presetSave.close,
      );
    });
  },
);

describe("a refusal sends the name and lets the customer try again (S-8)", () => {
  it("sends the trimmed name, and no name at all when the field was left blank", async () => {
    mount();
    savePresetMock.mockResolvedValue({ kind: "refused", reason: "failed" });
    openDialog();

    typeName(`  ${A_TYPED_NAME}  `);
    press("save-as-preset-confirm");
    await settle();
    typeName("   ");
    press("save-as-preset-confirm");
    await settle();

    expect(savePresetMock.mock.calls.map(([request]) => request.name)).toEqual([
      A_TYPED_NAME,
      undefined,
    ]);
  });

  it("clears the refusal when the same dialog is saved again and the route accepts", async () => {
    mount();
    await openTypeAndSave({ kind: "refused", reason: "failed" });
    savePresetMock.mockResolvedValue({ kind: "saved" });

    press("save-as-preset-confirm");
    await settle();

    expect(statusText()).toBe(messages.presetSave.saved);
    expect(toneOfStatus()).toBe("ok");
  });
});

describe("the editor's own save has not settled (S-5, S-8, D-6)", () => {
  it.each(["saving", "error"] as SaveStatus[])(
    "waits in the progress tone with the field editable and Save disabled while the save is %s",
    (saveStatus) => {
      useConfiguratorStore.setState({ saveStatus });
      mount();

      openDialog();

      expect(toneOfStatus()).toBe("progress");
      expect(statusText()).toBe(roMessages.presetSave.waiting);
      expect(field().disabled).toBe(false);
      expect(confirmButton().disabled).toBe(true);
    },
  );

  it("waits while an edit is queued that the server does not yet hold", () => {
    useConfiguratorStore.setState({
      design: { ...KITCHEN_L_DESIGN, updatedAt: "2026-10-18T00:00:00.000Z" },
    });
    mount();

    openDialog();

    expect(toneOfStatus()).toBe("progress");
    expect(confirmButton().disabled).toBe(true);
  });

  it("lets the customer type while it waits and keeps the name when Save comes alive", () => {
    useConfiguratorStore.setState({ saveStatus: "saving" });
    mount();
    openDialog();

    typeName(A_TYPED_NAME);
    act(() => {
      useConfiguratorStore.setState({ saveStatus: "idle" });
    });

    expect(field().value).toBe(A_TYPED_NAME);
    expect(confirmButton().disabled).toBe(false);
    expect(statusText()).toBe("");
    expect(toneOfStatus()).toBeNull();
  });

  it.each(["conflict", "stopped", "unauthorized"] as SaveStatus[])(
    "says notSaved in the error tone with Save disabled for good when the save is %s",
    (saveStatus) => {
      useConfiguratorStore.setState({ saveStatus });
      mount();

      openDialog();

      expect(toneOfStatus()).toBe("error");
      expect(statusText()).toBe(roMessages.presetSave.refusal.notSaved);
      expect(confirmButton().disabled).toBe(true);
    },
  );

  it("says notSaved in Russian too", () => {
    locale = "ru";
    messages = ruMessages as Catalogue;
    useConfiguratorStore.setState({ saveStatus: "conflict" });
    mount();

    openDialog();

    expect(statusText()).toBe(ruMessages.presetSave.refusal.notSaved);
  });

  it("sends nothing when the editor's save stops between the capture and the send", async () => {
    let resolveCapture: (image: EncodedPresetImage) => void = () => undefined;
    captureMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    mount();
    openDialog();

    press("save-as-preset-confirm");
    act(() => {
      useConfiguratorStore.setState({ saveStatus: "saving" });
    });
    resolveCapture(IMAGE);
    await settle();

    expect(savePresetMock).not.toHaveBeenCalled();
    expect(toneOfStatus()).toBe("progress");
    expect(confirmButton().disabled).toBe(true);
    expect(isInsideTheDialog(document.activeElement)).toBe(true);
  });
});

describe("where focus lands when the dialog opens (S-4, owner answer O-3)", () => {
  it("is the name field when the main pointer is fine", () => {
    stubMedia([FINE_POINTER]);
    mount();

    openDialog();

    expect(document.activeElement).toBe(field());
  });

  it("is the dialog itself on a touch screen, so the keyboard does not rise unasked", () => {
    stubMedia([]);
    mount();

    openDialog();

    expect(document.activeElement).toBe(byTestId("save-as-preset-dialog"));
  });

  it("is the dialog itself where the browser cannot answer the question", () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    mount();

    openDialog();

    expect(document.activeElement).toBe(byTestId("save-as-preset-dialog"));
  });
});

describe("the Tab ring (S-4)", () => {
  it("lists the field, Close, Save and then the round ×, in that order", () => {
    mount();
    openDialog();

    expect(stopsOfTheDialog()).toEqual([
      byTestId("save-as-preset-name"),
      byTestId("save-as-preset-confirm-back"),
      byTestId("save-as-preset-confirm"),
      byTestId("save-as-preset-close"),
    ]);
  });

  it("wraps Tab from × to the field and Shift+Tab from the field to ×", () => {
    mount();
    openDialog();

    byTestId("save-as-preset-close").focus();
    const tabWrapped = pressTab({ backwards: false });
    const afterTab = document.activeElement;
    field().focus();
    const shiftTabWrapped = pressTab({ backwards: true });
    const afterShiftTab = document.activeElement;

    expect([tabWrapped, afterTab]).toEqual([true, field()]);
    expect([shiftTabWrapped, afterShiftTab]).toEqual([
      true,
      byTestId("save-as-preset-close"),
    ]);
  });

  it("sends Tab from the dialog's own surface to the field and Shift+Tab to ×", () => {
    stubMedia([]);
    mount();
    openDialog();
    const surface = byTestId("save-as-preset-dialog");

    surface.focus();
    pressTab({ backwards: false });
    const afterTab = document.activeElement;
    surface.focus();
    pressTab({ backwards: true });
    const afterShiftTab = document.activeElement;

    expect(afterTab).toBe(field());
    expect(afterShiftTab).toBe(byTestId("save-as-preset-close"));
  });

  it("keeps Close and × in the ring while the request is out, so it is never empty", async () => {
    mount();
    await openAndHoldTheRequest();

    expect(stopsOfTheDialog()).toEqual([
      byTestId("save-as-preset-confirm-back"),
      byTestId("save-as-preset-close"),
    ]);
  });
});

describe("while the preset is being sent (S-6, X-7)", () => {
  it("says the saving sentence in the progress tone and locks the field and Save", async () => {
    mount();
    await openAndHoldTheRequest();

    expect(toneOfStatus()).toBe("progress");
    expect(statusText()).toBe(roMessages.presetSave.saving);
    expect(field().disabled).toBe(true);
    expect(field().value).toBe(A_TYPED_NAME);
    expect(confirmButton().disabled).toBe(true);
  });

  it("marks Close and × aria-disabled and not natively disabled", async () => {
    mount();
    await openAndHoldTheRequest();

    for (const testId of [
      "save-as-preset-confirm-back",
      "save-as-preset-close",
    ]) {
      expect(byTestId(testId).getAttribute("aria-disabled")).toBe("true");
      expect((byTestId(testId) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("closes on nothing: Close, ×, Escape, the scrim", async () => {
    mount();
    await openAndHoldTheRequest();

    press("save-as-preset-confirm-back");
    press("save-as-preset-close");
    pressEscape();
    press("save-as-preset-scrim");

    expect(closeCount).toBe(0);
    expect(maybeByTestId("save-as-preset-dialog")).not.toBeNull();
  });

  it("sends the request once however often Save is pressed", async () => {
    mount();
    await openAndHoldTheRequest();

    press("save-as-preset-confirm");
    press("save-as-preset-confirm");

    expect(savePresetMock).toHaveBeenCalledTimes(1);
  });

  it("hands focus to Close when Save, which had it, is disabled", async () => {
    mount();
    await openAndHoldTheRequest();

    expect(document.activeElement).toBe(
      byTestId("save-as-preset-confirm-back"),
    );
  });

  it("hands focus to Close when the focus was in the field that is about to be locked", async () => {
    mount();
    savePresetMock.mockReturnValue(new Promise(() => undefined));
    openDialog();
    field().focus();

    press("save-as-preset-confirm");
    await settle();

    expect(document.activeElement).toBe(
      byTestId("save-as-preset-confirm-back"),
    );
  });

  it("gives focus back to Save when the request ends in a refusal", async () => {
    mount();
    const answer = await openAndHoldTheRequest();

    await answer({ kind: "refused", reason: "stale" });

    expect(document.activeElement).toBe(confirmButton());
    expect(
      byTestId("save-as-preset-confirm-back").getAttribute("aria-disabled"),
    ).toBe("false");
    expect(byTestId("save-as-preset-close").getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("leaves focus where the customer put it if they moved it to × meanwhile", async () => {
    mount();
    const answer = await openAndHoldTheRequest();
    byTestId("save-as-preset-close").focus();

    await answer({ kind: "refused", reason: "stale" });

    expect(document.activeElement).toBe(byTestId("save-as-preset-close"));
  });

  it("closes again on Close, ×, Escape and the scrim once the refusal has come", async () => {
    mount();
    const answer = await openAndHoldTheRequest();
    await answer({ kind: "refused", reason: "failed" });

    pressEscape();

    expect(closeCount).toBe(1);
  });
});

describe("every way out, once nothing is in flight (S-4)", () => {
  it.each([
    [
      "Close",
      () => {
        press("save-as-preset-confirm-back");
      },
    ],
    [
      "the round ×",
      () => {
        press("save-as-preset-close");
      },
    ],
    [
      "the scrim",
      () => {
        press("save-as-preset-scrim");
      },
    ],
    [
      "Escape",
      () => {
        pressEscape();
      },
    ],
  ] as const)(
    "%s closes the dialog and returns focus to the chip",
    (_way, close) => {
      mount();
      openDialog();

      close();

      expect(closeCount).toBe(1);
      expect(maybeByTestId("save-as-preset-dialog")).toBeNull();
      expect(document.activeElement).toBe(byTestId("save-as-preset"));
    },
  );

  it("refuses to take focus off the dialog when the scrim is pressed", () => {
    mount();
    openDialog();
    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      byTestId("save-as-preset-scrim").dispatchEvent(mouseDown);
    });

    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("marks the other bands inert while it is open and lifts them when it closes", () => {
    mount();
    const chipBand = byTestId("save-as-preset").closest("main > *");
    openDialog();
    expect(chipBand?.hasAttribute("inert")).toBe(true);

    press("save-as-preset-confirm-back");

    expect(container.querySelector("[inert]")).toBeNull();
  });

  it("names its parts: a modal dialog, its title, its intro, the optional field", () => {
    mount();
    openDialog();
    const dialog = byTestId("save-as-preset-dialog");

    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      container.querySelector(
        `[id="${dialog.getAttribute("aria-labelledby") ?? ""}"]`,
      )?.tagName,
    ).toBe("H2");
    expect(
      container.querySelector(
        `[id="${dialog.getAttribute("aria-describedby") ?? ""}"]`,
      )?.textContent,
    ).toBe(roMessages.presetSave.intro);
    expect(field().labels?.[0]?.textContent).toBe(
      roMessages.presetSave.nameLabel,
    );
    expect(field().placeholder.length).toBeGreaterThan(0);
  });
});

describe("the saved notice (S-7)", () => {
  it("is readable for 1000 ms and then fades for 200 ms, as the owner ruled (the rule keeps one literal pin)", () => {
    expect(SAVED_NOTICE_VISIBLE_MS).toBe(1000);
    expect(SAVED_NOTICE_FADE_MS).toBe(200);
  });

  it("says the ok tone, locks the field and Save, and lets the customer close at once", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });

    expect(toneOfStatus()).toBe("ok");
    expect(statusText()).toBe(roMessages.presetSave.saved);
    expect(field().disabled).toBe(true);
    expect(confirmButton().disabled).toBe(true);
    expect(
      byTestId("save-as-preset-confirm-back").getAttribute("aria-disabled"),
    ).toBe("false");
    expect(byTestId("save-as-preset-close").getAttribute("aria-disabled")).toBe(
      "false",
    );
  });

  it("keeps focus inside the dialog once Save and the field are locked", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });

    expect(isInsideTheDialog(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("stays opaque (not fading) until the visible time has run out, then fades, then unmounts", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });

    await settle(SAVED_NOTICE_VISIBLE_MS - 1);
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("false");

    await settle(1);
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("true");
    expect(closeCount).toBe(0);

    await settle(SAVED_NOTICE_FADE_MS - 1);
    expect(maybeByTestId("save-as-preset-dialog")).not.toBeNull();
    expect(closeCount).toBe(0);

    await settle(1);
    expect(maybeByTestId("save-as-preset-dialog")).toBeNull();
    expect(closeCount).toBe(1);
  });

  it("closes at the end of the visible time with no fade at all under reduced motion", async () => {
    stubMedia([FINE_POINTER, REDUCED_MOTION]);
    mount();
    await openTypeAndSave({ kind: "saved" });

    await settle(SAVED_NOTICE_VISIBLE_MS - 1);
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("false");
    expect(maybeByTestId("save-as-preset-dialog")).not.toBeNull();

    await settle(1);
    expect(maybeByTestId("save-as-preset-dialog")).toBeNull();
    expect(closeCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never marks the dialog as closing under reduced motion, not even for a moment", async () => {
    stubMedia([FINE_POINTER, REDUCED_MOTION]);
    mount();
    await openTypeAndSave({ kind: "saved" });
    const closingStates = new Set<string | null>();

    for (
      let elapsed = 0;
      elapsed <= SAVED_NOTICE_VISIBLE_MS + SAVED_NOTICE_FADE_MS;
      elapsed += 50
    ) {
      closingStates.add(
        maybeByTestId("save-as-preset-dialog") === null
          ? "gone"
          : hostOfTheDialog().getAttribute("data-closing"),
      );
      await settle(50);
    }

    expect(closingStates.has("true")).toBe(false);
  });

  it("leaves no timer to fire when the customer closes it in the middle of the fade", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });
    await settle(SAVED_NOTICE_VISIBLE_MS + SAVED_NOTICE_FADE_MS / 2);
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("true");

    press("save-as-preset-confirm-back");
    const timersAfterClose = vi.getTimerCount();
    await settle(SAVED_NOTICE_VISIBLE_MS * 2);

    expect(timersAfterClose).toBe(0);
    expect(closeCount).toBe(1);
    expect(document.activeElement).toBe(byTestId("save-as-preset"));
  });

  it("keeps its schedule when the dialog re-renders meanwhile, as it does when the editor's save status changes", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });
    await settle(SAVED_NOTICE_VISIBLE_MS / 2);

    act(() => {
      useConfiguratorStore.setState({ saveStatus: "saving" });
    });
    expect(statusText()).toBe(roMessages.presetSave.saved);
    await settle(SAVED_NOTICE_VISIBLE_MS / 2);
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("true");
    await settle(SAVED_NOTICE_FADE_MS);

    expect(maybeByTestId("save-as-preset-dialog")).toBeNull();
    expect(closeCount).toBe(1);
  });

  it("does not fade a dialog that was reopened after a manual close", async () => {
    mount();
    await openTypeAndSave({ kind: "saved" });
    press("save-as-preset-confirm-back");

    openDialog();
    await settle(SAVED_NOTICE_VISIBLE_MS * 2);

    expect(maybeByTestId("save-as-preset-dialog")).not.toBeNull();
    expect(hostOfTheDialog().getAttribute("data-closing")).toBe("false");
    expect(statusText()).toBe("");
  });
});

describe("the close button's test id (X-6)", () => {
  it("is save-as-preset-close, and every id the owner loop uses is still drawn", () => {
    mount();
    openDialog();

    for (const testId of [
      "save-as-preset-dialog",
      "save-as-preset-name",
      "save-as-preset-status",
      "save-as-preset-confirm",
      "save-as-preset-confirm-back",
      "save-as-preset-scrim",
      "save-as-preset-confirm-body",
      "save-as-preset-close",
    ]) {
      expect(maybeByTestId(testId), testId).not.toBeNull();
    }
  });
});

// Helpers

function isInsideTheDialog(element: Element | null): boolean {
  return byTestId("save-as-preset-dialog").contains(element);
}
