// @vitest-environment happy-dom
// The save-as-preset dialog's close after a successful save: the saved notice stays readable for
// SAVED_NOTICE_VISIBLE_MS, fades for SAVED_NOTICE_FADE_MS, then the dialog closes exactly as its Close button does, and no refusal closes it.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PresetSaveOutcome } from "@/persistence/preset-save-client";

const savePresetMock = vi.fn<() => Promise<PresetSaveOutcome>>();

vi.mock("@/persistence/preset-save-client", () => ({
  savePreset: () => savePresetMock(),
}));
vi.mock("@/scene/capture-scene-image", () => ({
  captureSceneImage: () =>
    Promise.resolve({ imageType: "image/webp", base64: "AAAA" }),
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
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../../../src/messages/ro.json";

const DESIGN_ID = "save-as-preset-design" as DesignId;

let container: HTMLDivElement;
let root: Root;

/** The screen's own wiring of the three pieces: the control, the button over the scene and the dialog. */
function Harness() {
  const control = useSaveAsPresetControl(true);
  return createElement(
    "main",
    null,
    createElement(SaveAsPresetButton, { control, isPanelOpen: false }),
    control.isOffered && control.isOpen
      ? createElement(SaveAsPresetDialog, { onClose: control.close })
      : null,
  );
}

function mount(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(Harness),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function byTestId(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

function press(testId: string): void {
  const element = byTestId(testId);
  if (element === null) throw new Error(`nothing drawn as ${testId}`);
  act(() => {
    element.click();
  });
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function openAndSave(outcome: PresetSaveOutcome): Promise<void> {
  savePresetMock.mockResolvedValue(outcome);
  press("save-as-preset");
  press("save-as-preset-confirm");
  await advance(0);
}

function statusText(): string | null {
  return byTestId("save-as-preset-status")?.textContent ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "1",
    canWrite: true,
  });
  usePresetAuthoring
    .getState()
    .record({ designId: DESIGN_ID, canAuthorPresets: true });
  mount();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  savePresetMock.mockReset();
});

describe("the save-as-preset dialog after a successful save", () => {
  it("keeps the saved notice on screen until the visible time has run out", async () => {
    await openAndSave({ kind: "saved" });
    await advance(SAVED_NOTICE_VISIBLE_MS - 1);

    expect(statusText()).toBe(roMessages.presetSave.saved);
    expect(byTestId("save-as-preset-dialog")).not.toBeNull();
    expect(byTestId("save-as-preset-confirm")).toHaveProperty("disabled", true);
  });

  it("then closes the dialog and gives focus back to the button that opened it", async () => {
    await openAndSave({ kind: "saved" });
    await advance(SAVED_NOTICE_VISIBLE_MS + SAVED_NOTICE_FADE_MS);

    expect(byTestId("save-as-preset-dialog")).toBeNull();
    expect(document.activeElement).toBe(byTestId("save-as-preset"));
  });

  it("leaves nothing to fire once the customer has closed it first", async () => {
    await openAndSave({ kind: "saved" });
    press("save-as-preset-confirm-back");
    const buttonFocusedByClose = document.activeElement;
    const timersAfterClose = vi.getTimerCount();

    await advance(SAVED_NOTICE_VISIBLE_MS * 2);

    expect(timersAfterClose).toBe(0);
    expect(buttonFocusedByClose).toBe(byTestId("save-as-preset"));
    expect(byTestId("save-as-preset-dialog")).toBeNull();
  });

  it("does not close itself on a refusal, however long it waits", async () => {
    await openAndSave({ kind: "refused", reason: "presetLimit" });
    await advance(SAVED_NOTICE_VISIBLE_MS * 10);

    expect(statusText()).toBe(roMessages.presetSave.refusal.presetLimit);
    expect(byTestId("save-as-preset-dialog")).not.toBeNull();
  });
});
