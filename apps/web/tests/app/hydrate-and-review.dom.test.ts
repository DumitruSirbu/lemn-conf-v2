// @vitest-environment happy-dom
//
// The **browser's** render of the review's hydrator: the session store holds the loaded design before anything
// below reads it, the heading is the approved `review.title` leaf in each locale, and a second render for the same
// design keeps the store the customer was editing rather than overwriting it with the server's copy.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { HydrateAndReview } from "@/app/d/[id]/review/hydrate-and-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const DESIGN_ID = "created-design" as DesignId;
const MESSAGES = { ro: roMessages, ru: ruMessages } as const;

function loadedDesign(): Design {
  return {
    ...structuredClone(KITCHEN_L_DESIGN),
    presetId: "recipe-loaded-from-step-one",
  };
}

function renderReview(
  design: Design,
  locale: keyof typeof MESSAGES = "ro",
): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: MESSAGES[locale] as typeof roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(HydrateAndReview, {
        design,
        designId: DESIGN_ID,
        revision: "2",
      }),
    }),
  );
}

beforeEach(() => {
  useConfiguratorStore.setState({
    design: KITCHEN_L_DESIGN,
    designId: null,
    revision: null,
  });
});

describe("HydrateAndReview in the browser", () => {
  it("puts the loaded design in the session store, revision and all", () => {
    const loaded = loadedDesign();

    renderReview(loaded);

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: loaded,
      designId: DESIGN_ID,
      revision: "2",
      canWrite: "checking",
    });
  });

  it.each(["ro", "ru"] as const)(
    "shows the %s review.title leaf as the heading and nothing else",
    (locale) => {
      const markup = renderReview(loadedDesign(), locale);

      expect(markup).toBe(
        `<main><h1>${MESSAGES[locale].review.title}</h1></main>`,
      );
    },
  );

  it("keeps the store already holding this design, edits and all", () => {
    const editedInEditor = loadedDesign();
    useConfiguratorStore.getState().hydrate({
      design: editedInEditor,
      designId: DESIGN_ID,
      revision: "3",
      canWrite: true,
    });

    renderReview(loadedDesign());

    expect(useConfiguratorStore.getState()).toMatchObject({
      design: editedInEditor,
      revision: "3",
      canWrite: true,
    });
  });
});
