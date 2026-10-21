// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4: a note, its author and the name behind a status are text a stranger typed. They reach the page
// by the read and by the answer to a write; either way they are a text node of an element of their own, whole, and a name set
// inside the sentence of the last change cannot reorder it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  noteCreated,
  routeKitchen,
  typeIntoTextarea,
  wireNoteStored,
} from "../support/staff-kitchen-actions-screen";
import { wireChangedStatus, wireKitchen } from "../support/staff-kitchen-wire";

import {
  setUpScreenHarness,
  type ScreenHarness,
} from "./qa-l3-u3-harness.adversarial";

vi.mock("@/scene/kitchen-canvas", async () => {
  const { createElement: element } = await import("react");
  return {
    default: () => null,
    ViewOnlyKitchenCanvas: () => element("canvas"),
  };
});

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
  detectWebGLSupport: () => true,
}));

const RIGHT_TO_LEFT_OVERRIDE = "\u202E";
const ISOLATE_OPEN = "\u2068";
const ISOLATE_CLOSE = "\u2069";
const A_LONG_NOTE = "x".repeat(10_000);
const HOSTILE_TEXTS = [
  `<img src=x onerror="alert(1)">{count, plural, one {#} other {#}}`,
  `${RIGHT_TO_LEFT_OVERRIDE}drowssap`,
  "{when} {name} '{' }",
  A_LONG_NOTE,
  "<script>document.title = 'x'</script>\n<b>bold</b>",
] as const;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
});

function notes(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-notes"]');
}

describe("the notes of a kitchen that hold hostile text", () => {
  it("draws each note whole as one text node of its own paragraph, and each author as one text node of its own span", async () => {
    harness.answers(
      routeKitchen({
        read: () => ({
          body: wireKitchen({
            notes: HOSTILE_TEXTS.map((text, index) =>
              wireNoteStored({
                id: `n${String(index)}`,
                text,
                author: {
                  email: null,
                  name: `${RIGHT_TO_LEFT_OVERRIDE}<i>{name}</i>`,
                },
              }),
            ),
          }),
        }),
      }),
    );

    await harness.mount();

    const paragraphs = allIn(notes(), "li p");
    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      ...HOSTILE_TEXTS,
    ]);
    for (const paragraph of paragraphs) {
      expect(paragraph.children).toHaveLength(0);
    }
    for (const author of allIn(notes(), "li span:first-child")) {
      expect(author.textContent).toBe(`${RIGHT_TO_LEFT_OVERRIDE}<i>{name}</i>`);
      expect(author.children).toHaveLength(0);
    }
    expect(allIn(notes(), "img, script, b, i")).toHaveLength(0);
    expect(document.title).not.toBe("x");
  });

  it.each(HOSTILE_TEXTS)(
    "draws the stored answer to a note the same way, whatever the text",
    async (hostile) => {
      harness.answers(
        routeKitchen({
          read: () => ({ body: wireKitchen() }),
          note: () => noteCreated({ text: hostile }),
        }),
      );
      await harness.mount();
      typeIntoTextarea(
        requireIn<HTMLTextAreaElement>(notes(), "textarea"),
        "Am sunat.",
      );
      click(requireIn(notes(), 'button[type="submit"]'));
      await harness.settle();

      const [paragraph] = allIn(notes(), "li p");
      expect(paragraph?.textContent).toBe(hostile);
      expect(paragraph?.children).toHaveLength(0);
    },
  );
});

describe("the name behind the last change of a status", () => {
  it("is fenced between isolate marks with its own bidi controls gone, and its braces are letters and not a placeholder", async () => {
    const name = `${RIGHT_TO_LEFT_OVERRIDE}{when} <b>Mihai</b>`;
    harness.answers(
      routeKitchen({
        read: () => ({
          body: wireKitchen({
            status: wireChangedStatus("contacted", { email: null, name }),
          }),
        }),
      }),
    );

    await harness.mount();

    const line = requireIn(
      harness.container(),
      '[data-testid="staff-kitchen-last-change"]',
    );
    expect(line.textContent).toContain(
      `${ISOLATE_OPEN}{when} <b>Mihai</b>${ISOLATE_CLOSE}`,
    );
    expect(line.textContent).not.toContain(RIGHT_TO_LEFT_OVERRIDE);
    expect(line.children).toHaveLength(0);
  });
});
