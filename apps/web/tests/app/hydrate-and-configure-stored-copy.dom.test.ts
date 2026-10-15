// @vitest-environment happy-dom
//
// The editor's page is shown again by the browser's history from the copy it kept, older than the stored design. The
// probe the editor sends for write access answers with the stored design, and the store must end holding that copy
// and no other, with the page's own revision never standing beside a document it was not read with.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: () => null,
}));

import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { useConfiguratorStore } from "@/store/configurator-store";

const DESIGN_ID = "design-returned-to" as DesignId;
const KEPT_PAGE_REVISION = "2";
const STORED_REVISION = "3";
const KEPT_PAGE: Design = { ...KITCHEN_L_DESIGN, presetId: "kept-by-the-page" };
const STORED_COPY: Design = { ...KITCHEN_L_DESIGN, presetId: "stored" };

let container: HTMLDivElement;
let root: Root;

function answerTheProbeWith(body: unknown): void {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

function storedAnswer(revision: string, canWrite: boolean) {
  return { design: STORED_COPY, revision, canWrite };
}

async function showTheKeptPage(): Promise<void> {
  await act(async () => {
    root.render(
      createElement(HydrateAndConfigure, {
        design: KEPT_PAGE,
        designId: DESIGN_ID,
        revision: KEPT_PAGE_REVISION,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

beforeEach(() => {
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("the editor's probe answers for a design shown from an older copy", () => {
  it("leaves the store holding the stored design and its revision, writable", async () => {
    answerTheProbeWith(storedAnswer(STORED_REVISION, true));

    await showTheKeptPage();

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: STORED_COPY,
      savedDesign: STORED_COPY,
      revision: STORED_REVISION,
      canWrite: true,
    });
  });

  it("keeps the page's copy when the stored design is no newer", async () => {
    answerTheProbeWith(storedAnswer(KEPT_PAGE_REVISION, true));

    await showTheKeptPage();

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: KEPT_PAGE,
      revision: KEPT_PAGE_REVISION,
      canWrite: true,
    });
  });

  it("takes the stored design of a read-only visitor as well, read-only", async () => {
    answerTheProbeWith(storedAnswer(STORED_REVISION, false));

    await showTheKeptPage();

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: STORED_COPY,
      revision: STORED_REVISION,
      canWrite: false,
    });
  });
});
