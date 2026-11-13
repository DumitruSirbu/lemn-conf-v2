// @vitest-environment happy-dom
//
// Adversarial QA for M10 wave R1, criterion R-a, third bullet, as relaxed by ruling R1-Q2 (2026-10-27): a fresh send after a
// publish is priced at the current book and stores that version, so the browser tells the route nothing of the version it
// saw (ADR 0150: a request holds no price). The server half is `lib/server/contact/qa-r1-publish-between-sends`. This half
// holds the wire to the ruling, and holds the press with no book to nothing sent.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DESIGN_TARGET,
  useContactSubmission,
  type ContactSubmission,
} from "@/contact/use-contact-submission";
import { PriceBookProvider } from "@/price/price-book-provider";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";

import roMessages from "../../src/messages/ro.json";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  ControlledFetch,
  hydrateSavedDesign,
  numberedRequestIds,
  type RecordedRequest,
  TestClock,
  VALID_FIELDS,
} from "./contact-submission-harness";

const MINUTE_MS = 60_000;

interface Pressed {
  readonly requests: readonly RecordedRequest[];
  readonly phase: ContactSubmission["phase"];
}

/** A filled form pressed once, under the root a page would hand it. */
function pressedUnder(priceBook: PriceBookRoot): Pressed {
  const fetchControl = new ControlledFetch();
  const clock = new TestClock();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let latest: ContactSubmission | undefined;
  function Probe() {
    latest = useContactSubmission({
      target: DESIGN_TARGET,
      locale: "ro",
      ports: {
        fetchContact: fetchControl.fetchContact,
        monotonicNow: () => clock.nowMs,
        wallNowMs: () => clock.nowMs,
        generateId: numberedRequestIds(),
      },
    });
    return null;
  }
  act(() => {
    root.render(
      createElement(PriceBookProvider, {
        root: priceBook,
        children: createElement(NextIntlClientProvider, {
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
          children: createElement(Probe),
        }),
      }),
    );
  });
  const current = (): ContactSubmission => {
    if (latest === undefined) throw new Error("the probe has not rendered");
    return latest;
  };
  act(() => {
    current().edit({
      type: "text-changed",
      field: "name",
      text: VALID_FIELDS.name,
    });
    current().edit({
      type: "text-changed",
      field: "phone",
      text: VALID_FIELDS.phone,
    });
    current().edit({
      type: "text-changed",
      field: "locality",
      text: VALID_FIELDS.locality,
    });
    current().edit({ type: "consent-changed", isGiven: true });
  });
  clock.advance(MINUTE_MS);
  act(() => {
    current().press();
  });
  const pressed = {
    requests: [...fetchControl.requests],
    phase: current().phase,
  };
  act(() => {
    root.unmount();
  });
  container.remove();
  return pressed;
}

/** What a first press posts under a root of the given version, with everything that varies per press taken out. */
function postedBodyUnderVersion(versionId: string): Record<string, unknown> {
  const [request] = pressedUnder({ ...SAMPLE_PRICE_ROOT, versionId }).requests;
  if (request === undefined) throw new Error("the press posted nothing");
  const { body } = request;
  return Object.fromEntries(
    Object.entries(body).filter(
      ([field]) => field !== "clientRequestId" && field !== "elapsedMs",
    ),
  );
}

beforeEach(() => {
  hydrateSavedDesign();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the first press after a publish (RK-6, ruling R1-Q2, 2026-10-27)", () => {
  it("posts the same body whichever version the browser priced under: no seen version goes on the wire (ADR 0150)", () => {
    const sawVersionOne = postedBodyUnderVersion("version-id-1");
    const sawVersionTwo = postedBodyUnderVersion("version-id-2");

    expect(sawVersionTwo).toEqual(sawVersionOne);
    expect(JSON.stringify(sawVersionOne)).not.toContain("version-id");
  });
});

describe("a press with no book to price under (R-b)", () => {
  it("posts nothing, and the customer is told the request failed, as for any request nothing can be made of", () => {
    const pressed = pressedUnder(NO_PRICE_BOOK);

    expect(pressed.requests).toEqual([]);
    expect(pressed.phase).toMatchObject({
      kind: "failed",
      outcome: { kind: "failed" },
    });
  });
});
