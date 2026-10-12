// Node environment on purpose, no `window`: what a request does. A server render of the confirmation writes no module
// store (ADR 0133 decision 4), and it shows what the server already knows: the reference the page read, and none of what
// a customer typed, since the sent request's memory is the browser's and a server holds none.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HydrateAndDone } from "@/app/d/[id]/done/hydrate-and-done";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

const DESIGN_ID = "another-visitors-design" as DesignId;

function renderOnTheServer(sentReference: SentReferenceAnswer): string {
  return renderToString(
    createElement(NextIntlClientProvider, {
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(HydrateAndDone, {
        design: {
          ...structuredClone(KITCHEN_L_DESIGN),
          presetId: "recipe-loaded-by-another-visitor",
        },
        designId: DESIGN_ID,
        revision: "5",
        sentReference,
      }),
    }),
  );
}

describe("HydrateAndDone on the server", () => {
  it("renders the reference the page read, and leaves the session store as it found it", () => {
    const before = useConfiguratorStore.getState();

    const markup = renderOnTheServer({ kind: "sent", reference: "LM-2614" });

    expect(markup).toContain("LM-2614");
    expect(markup).toContain(roMessages.submissionResult.sentHeading);
    expect(useConfiguratorStore.getState()).toBe(before);
    expect(useConfiguratorStore.getState().designId).toBeNull();
  });

  it.each([{ kind: "none" }, { kind: "unknown" }] as const)(
    "claims no request is sent when the page's answer is $kind",
    (answer) => {
      const markup = renderOnTheServer(answer);

      expect(markup).not.toContain(roMessages.submissionResult.sentHeading);
      expect(markup).not.toContain("LM-");
    },
  );
});
