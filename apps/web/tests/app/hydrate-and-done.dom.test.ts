// @vitest-environment happy-dom
//
// What the confirmation's hydrator hands the screen, and when: the store holds the page's copy before the screen reads
// it, the screen is given the page's id and revision and the server's answer exactly as the page read it, and the
// hydrator asks the server for nothing. Which copy wins is `hydrate-and-contact.dom.test.ts`'s table, which runs this
// hydrator beside the other two.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const screen = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
  storeDesignIdAtRender: [] as unknown[],
}));

vi.mock("@/done/done-screen", async () => {
  const { useConfiguratorStore } = await import("@/store/configurator-store");
  return {
    DoneScreen: (props: Record<string, unknown>) => {
      screen.props.push(props);
      screen.storeDesignIdAtRender.push(
        useConfiguratorStore.getState().designId,
      );
      return null;
    },
  };
});

import { HydrateAndDone } from "@/app/d/[id]/done/hydrate-and-done";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "design0123456789abcde" as DesignId;
const REVISION = "6";

const ANSWERS: readonly SentReferenceAnswer[] = [
  { kind: "sent", reference: "LM-2614" },
  { kind: "none" },
  { kind: "unknown" },
];

const requests: string[] = [];

function renderInTheBrowser(sentReference: SentReferenceAnswer): void {
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(HydrateAndDone, {
        design: KITCHEN_L_DESIGN,
        designId: DESIGN_ID,
        revision: REVISION,
        sentReference,
      }),
    }),
  );
}

beforeEach(() => {
  screen.props.length = 0;
  screen.storeDesignIdAtRender.length = 0;
  requests.length = 0;
  vi.stubGlobal("fetch", (url: string) => {
    requests.push(url);
    return Promise.reject(new Error("the hydrator made a request"));
  });
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HydrateAndDone", () => {
  it.each(ANSWERS)(
    "gives the screen the page's design, revision and the server's answer ($kind), and nothing else",
    (answer) => {
      renderInTheBrowser(answer);

      expect(screen.props).toEqual([
        { designId: DESIGN_ID, revision: REVISION, sentReference: answer },
      ]);
    },
  );

  it("holds the page's copy in the store before the screen reads it", () => {
    renderInTheBrowser({ kind: "none" });

    expect(screen.storeDesignIdAtRender).toEqual([DESIGN_ID]);
    expect(useConfiguratorStore.getState()).toMatchObject({
      designId: DESIGN_ID,
      revision: REVISION,
    });
  });

  it("asks the server for nothing", () => {
    renderInTheBrowser({ kind: "sent", reference: "LM-2614" });

    expect(requests).toEqual([]);
  });
});
