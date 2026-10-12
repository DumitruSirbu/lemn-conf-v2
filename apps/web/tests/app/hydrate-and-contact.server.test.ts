// Node environment on purpose, no `window`: what a request does. A server render of the contact page shows its loading
// line, writes no module store (ADR 0133 decision 4) and shows no form, whichever way the server answered whether it
// can take a request: the first frame asks the device what it can show before it asks for anything of the customer.
import { KITCHEN_L_DESIGN, type DesignId } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";

function renderOnTheServer(isSendable: boolean): string {
  return renderToString(
    createElement(NextIntlClientProvider, {
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
      children: createElement(HydrateAndContact, {
        design: {
          ...structuredClone(KITCHEN_L_DESIGN),
          presetId: "recipe-loaded-by-another-visitor",
        },
        designId: "another-visitors-design" as DesignId,
        revision: "5",
        isSendable,
      }),
    }),
  );
}

describe("HydrateAndContact on the server", () => {
  it.each([true, false])(
    "renders the loading line, no form and no figure, and leaves the session store as it found it (isSendable %s)",
    (isSendable) => {
      const before = useConfiguratorStore.getState();

      const markup = renderOnTheServer(isSendable);

      expect(markup).toContain(roMessages.configure.loading);
      expect(markup).not.toContain("<form");
      expect(markup).not.toContain("<input");
      expect(markup).not.toContain("MDL");
      expect(useConfiguratorStore.getState()).toBe(before);
      expect(useConfiguratorStore.getState().designId).toBeNull();
    },
  );
});
