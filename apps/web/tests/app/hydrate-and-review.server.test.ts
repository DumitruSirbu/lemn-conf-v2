// Node environment on purpose, no `window`: what a request does. A server render of the review shows its loading line and
// writes no module store (ADR 0133 decision 4): a process-wide store written per request would carry one visitor's
// design into the next render.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

describe("HydrateAndReview on the server", () => {
  it("renders the loading line and leaves the session store as it found it", () => {
    const before = useConfiguratorStore.getState();
    const loaded = {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "recipe-loaded-by-another-visitor",
    };

    const markup = renderToString(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
        children: createElement(HydrateAndReview, {
          design: loaded,
          designId: "another-visitors-design" as DesignId,
          revision: "5",
        }),
      }),
    );

    expect(markup).toContain(roMessages.configure.loading);
    expect(useConfiguratorStore.getState()).toBe(before);
    expect(useConfiguratorStore.getState().design).toBe(
      useConfiguratorStore.getInitialState().design,
    );
    expect(useConfiguratorStore.getState().designId).toBeNull();
  });
});
