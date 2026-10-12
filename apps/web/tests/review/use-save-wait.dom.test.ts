// @vitest-environment happy-dom
//
// What the review (and, after it, the contact form) is told while an edit is unsaved: saved, or waiting with the
// sentence for the save's state, whether the customer settles it in the editor, and whether it has failed.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clockTimeOf } from "@/i18n/clock-time";
import type { SaveStatus } from "@/persistence/save-coalescer";
import { useSaveWait, type SaveWait } from "@/review/use-save-wait";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "design-being-saved" as DesignId;
const RESUMES_AT_MS = new Date(2026, 9, 10, 14, 5).getTime();

let container: HTMLDivElement;
let root: Root;
let latest: SaveWait | undefined;

function Probe() {
  latest = useSaveWait();
  return null;
}

function mountProbe(): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(Probe),
      }),
    );
  });
}

function editWithoutSaving(): void {
  useConfiguratorStore.setState({
    design: { ...KITCHEN_L_DESIGN, presetId: "edited-and-not-yet-saved" },
  });
}

function setStatus(status: SaveStatus, resumesAtMs?: number): void {
  act(() => {
    useConfiguratorStore.getState().setSaveStatus(status, resumesAtMs);
  });
}

function currentWait(): SaveWait {
  if (latest === undefined) throw new Error("the probe has not rendered");
  return latest;
}

beforeEach(() => {
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: DESIGN_ID,
    revision: "4",
    canWrite: true,
  });
  latest = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("useSaveWait", () => {
  it("is saved when the design on screen is the one the server last confirmed", () => {
    mountProbe();

    expect(currentWait()).toEqual({ kind: "saved" });
  });

  it.each(["idle", "saving"] as const)(
    "says it is being saved, with no failure, while the status is %s",
    (status) => {
      editWithoutSaving();
      mountProbe();
      setStatus(status);

      expect(currentWait()).toEqual({
        kind: "waiting",
        sentence: roMessages.reviewScreen.saving,
        isSettledInTheEditor: false,
        hasFailed: false,
      });
    },
  );

  it.each([
    ["error", roMessages.panel.saveFailedNotice],
    ["stopped", roMessages.panel.saveStoppedNotice],
    ["unauthorized", roMessages.panel.readOnlyRefusedNotice],
  ] as const)(
    "tells the editor's sentence for a %s save, as a failure",
    (status, sentence) => {
      editWithoutSaving();
      mountProbe();
      setStatus(status);

      expect(currentWait()).toEqual({
        kind: "waiting",
        sentence,
        isSettledInTheEditor: false,
        hasFailed: true,
      });
    },
  );

  it("sends a conflict to the editor, where the choice is made", () => {
    editWithoutSaving();
    mountProbe();
    setStatus("conflict");

    expect(currentWait()).toEqual({
      kind: "waiting",
      sentence: roMessages.reviewScreen.conflict,
      isSettledInTheEditor: true,
      hasFailed: true,
    });
  });

  it("tells the clock time a write the limit holds resumes at, and calls it no failure", () => {
    editWithoutSaving();
    mountProbe();
    setStatus("error", RESUMES_AT_MS);

    expect(currentWait()).toEqual({
      kind: "waiting",
      sentence: roMessages.panel.savePausedNotice.replace(
        "{time}",
        clockTimeOf(RESUMES_AT_MS),
      ),
      isSettledInTheEditor: false,
      hasFailed: false,
    });
  });

  it("becomes saved again once the save lands", () => {
    editWithoutSaving();
    mountProbe();
    act(() => {
      useConfiguratorStore.setState({
        savedDesign: useConfiguratorStore.getState().design,
      });
    });

    expect(currentWait()).toEqual({ kind: "saved" });
  });
});
