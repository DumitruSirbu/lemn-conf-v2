// M7B U7 S0 (ADR 0133, backlog 98): **a server render shows the loaded design and writes no module
// store.**
//
// Node environment on purpose — no `window`, so this is what a request does. Two things are proved,
// each the other's guard:
//   - the HTML of each hydrator carries its own design's camera chips (a U's four, a straight room's
//     two), whichever order the requests arrive in; and
//   - none of the three module stores (`useConfiguratorStore`, `useCameraPreset`,
//     `useSceneMeasurement`) is written by either render: a subscriber to each fails the test on any
//     change, and each `getState()` is still its `getInitialState()` afterwards. A process-wide store
//     written per request is what would carry one visitor's design into another's render.
import {
  APPROVED_ROOM_POLICY,
  generateKitchen,
  validateRoomInput,
  type Design,
  type DesignRoom,
  type RoomInput,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement, useContext, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { SharedDesignView } from "@/app/s/[token]/shared-design-view";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { useSceneMeasurement } from "@/scene/scene-measurement-store";
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";
import {
  useConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";
import { ServerSnapshotStoreContext } from "@/store/server-snapshot-context";

import roMessages from "../../src/messages/ro.json";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-01-01T00:00:00.000Z";
const HEIGHT_MM = 2600;
const U_CAMERA_CHIPS = 4;
const STRAIGHT_CAMERA_CHIPS = 2;
const L_CAMERA_CHIPS = 3;

function composeKitchenFor(input: RoomInput): Design {
  const validation = validateRoomInput(input, APPROVED_ROOM_POLICY);
  if (!validation.ok) {
    throw new Error(`the approved policy refuses ${JSON.stringify(input)}`);
  }
  return composeKitchenIn(validation.room);
}

function composeKitchenIn(room: DesignRoom): Design {
  const composed = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!composed.ok) {
    throw new Error(`generateKitchen refused ${JSON.stringify(room)}`);
  }
  return composed.design;
}

const U_DESIGN = composeKitchenFor({
  shape: "U",
  wallAMm: 4500,
  wallBMm: 3000,
  wallCMm: 3600,
  heightMm: HEIGHT_MM,
  cornerDirection: "left",
});
const STRAIGHT_DESIGN = composeKitchenFor({
  shape: "linear",
  wallAMm: 3700,
  heightMm: HEIGHT_MM,
});

function ownersEditorOf(design: Design): ReactElement {
  return createElement(HydrateAndConfigure, {
    design,
    designId: "an-owners-design-id",
    revision: "3",
  });
}

function shareViewOf(design: Design): ReactElement {
  return createElement(SharedDesignView, { design });
}

function serverRender(page: ReactElement): string {
  return renderToString(
    createElement(NextIntlClientProvider, {
      children: page,
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    }),
  );
}

function cameraChipCount(html: string): number {
  const label = roMessages.configure.cameraGroupLabel;
  const group = new RegExp(
    `role="group"\\s+aria-label="${label}"[^>]*>([\\s\\S]*?)</div>`,
  ).exec(html);
  if (group === null) throw new Error("the HTML carries no camera row");
  return (group[1] ?? "").split("<button").length - 1;
}

const writesSeen: string[] = [];
let unsubscribers: (() => void)[] = [];

beforeEach(() => {
  writesSeen.length = 0;
  unsubscribers = [
    useConfiguratorStore.subscribe(() => writesSeen.push("configurator")),
    useCameraPreset.subscribe(() => writesSeen.push("camera-preset")),
    useSceneMeasurement.subscribe(() => writesSeen.push("scene-measurement")),
  ];
});

afterEach(() => {
  for (const unsubscribe of unsubscribers) unsubscribe();
});

function expectNoModuleStoreWasWritten(): void {
  expect(writesSeen).toEqual([]);
  expect(useConfiguratorStore.getState()).toBe(
    useConfiguratorStore.getInitialState(),
  );
  expect(useCameraPreset.getState()).toBe(useCameraPreset.getInitialState());
  expect(useSceneMeasurement.getState()).toBe(
    useSceneMeasurement.getInitialState(),
  );
}

describe("a server render of the two hydrators (ADR 0133)", () => {
  it("shows each design's own chips and writes no module store: a U's editor, then a straight share view", () => {
    const editorHtml = serverRender(ownersEditorOf(U_DESIGN));
    const shareHtml = serverRender(shareViewOf(STRAIGHT_DESIGN));

    expect(cameraChipCount(editorHtml)).toBe(U_CAMERA_CHIPS);
    expect(cameraChipCount(shareHtml)).toBe(STRAIGHT_CAMERA_CHIPS);
    expectNoModuleStoreWasWritten();
  });

  it("shows each design's own chips and writes no module store: a straight share view, then a U's editor", () => {
    const shareHtml = serverRender(shareViewOf(STRAIGHT_DESIGN));
    const editorHtml = serverRender(ownersEditorOf(U_DESIGN));

    expect(cameraChipCount(shareHtml)).toBe(STRAIGHT_CAMERA_CHIPS);
    expect(cameraChipCount(editorHtml)).toBe(U_CAMERA_CHIPS);
    expectNoModuleStoreWasWritten();
  });

  it("shows a U's chips in a share view too, and a straight room's in the owner's editor", () => {
    const shareHtml = serverRender(shareViewOf(U_DESIGN));
    const editorHtml = serverRender(ownersEditorOf(STRAIGHT_DESIGN));

    expect(cameraChipCount(shareHtml)).toBe(U_CAMERA_CHIPS);
    expect(cameraChipCount(editorHtml)).toBe(STRAIGHT_CAMERA_CHIPS);
    expectNoModuleStoreWasWritten();
  });
});

describe("the hook without a provider (the plain configure route)", () => {
  it("answers the session store's own initial state, the seeded L", () => {
    const html = serverRender(createElement(ConfigureScreen));

    expect(cameraChipCount(html)).toBe(L_CAMERA_CHIPS);
    expectNoModuleStoreWasWritten();
  });
});

describe("the snapshot store a server render is handed", () => {
  it("throws, outside production, if any action is called on it", () => {
    const captured: { state: ConfiguratorState | null } = { state: null };
    function Capture(): null {
      captured.state =
        useContext(ServerSnapshotStoreContext)?.getState() ?? null;
      return null;
    }

    serverRender(
      createElement(ConfiguratorSnapshotProvider, {
        loaded: {
          design: STRAIGHT_DESIGN,
          designId: "an-owners-design-id",
          revision: "3",
          canWrite: "checking",
        },
        children: createElement(Capture),
      }),
    );

    expect(() => captured.state?.remove()).toThrow(/read-only/);
    expectNoModuleStoreWasWritten();
  });
});
