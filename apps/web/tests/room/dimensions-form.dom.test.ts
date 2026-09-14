// @vitest-environment happy-dom
//
// **1B's controls, driven rather than described** — wave 7F1 slice 5, criteria 4, 5, 6 and 10.
//
// The form is rendered on its own, over a draft this file builds with `room-draft.ts`'s own
// constructors: the claims below are about what the customer is *offered* — which fields, with which
// keyboard, and with nothing painted red — and none of them needs a router or a URL. The screen's
// claims about the query live in `room-url-round-trip.dom.test.ts`.
//
// Romanian is never spelled here. Every expected sentence is read out of the imported catalogue.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fc } from "@fast-check/vitest";
import type { RoomShape } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DimensionsForm } from "@/room/dimensions-form";
import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { requiredFieldsFor } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import { CATALOGUES } from "../support/catalogues";

const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** Criterion 4 is written as a property over `RoomShape`, and the domain declares three of them. */
const ANY_SHAPE = fc.constantFrom(...EVERY_SHAPE);

/** The label each field is expected to carry, read from the catalogue rather than spelled. */
const LABEL_KEY: Readonly<
  Record<RoomLengthField, keyof typeof roMessages.room.wallLabel | "height">
> = { wallA: "wallA", wallB: "wallB", wallC: "wallC", height: "height" };

/** Read by path rather than through `new URL(…, import.meta.url)`: under `happy-dom` the module URL
 *  is not a `file:` one, and `readFileSync` refuses it. */
const ROOM_STYLESHEET = readFileSync(
  resolve(import.meta.dirname, "../../src/room/room.module.css"),
  "utf8",
);

let container: HTMLDivElement;
let root: Root;

function render(draft: RoomDraft, locale: "ro" | "ru" = "ro"): void {
  const [, messages] =
    CATALOGUES.find(([candidate]) => candidate === locale) ?? CATALOGUES[0];
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(DimensionsForm, {
          draft,
          onEnterLength: vi.fn(),
          onChooseCorner: vi.fn(),
        }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

function fieldsInTheTree(): readonly HTMLInputElement[] {
  return [
    ...container.querySelectorAll("[data-testid^='room-length-']"),
  ].filter((element) => element instanceof HTMLInputElement);
}

function fieldNamesInTheTree(): readonly string[] {
  return fieldsInTheTree().map(
    (field) => field.dataset.testid?.replace("room-length-", "") ?? "",
  );
}

function fieldFor(field: RoomLengthField): HTMLInputElement {
  const input = container.querySelector(`[data-testid="room-length-${field}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the form draws no ${field} field`);
  }
  return input;
}

/** The `<label for>` bound to a field, as the thing a screen reader would announce with it — a
 *  label that merely stands next to an input is not bound to it. */
function labelBoundTo(input: HTMLInputElement): HTMLLabelElement {
  const label = container.querySelector(`label[for="${input.id}"]`);
  if (!(label instanceof HTMLLabelElement)) {
    throw new Error(`no label is bound to ${input.id}`);
  }
  return label;
}

function labelTextFor(field: RoomLengthField): string {
  const key = LABEL_KEY[field];
  return key === "height"
    ? roMessages.room.heightLabel
    : roMessages.room.wallLabel[key];
}

beforeEach(() => {
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

describe("one field per wall of the chosen shape, plus the height (criterion 4)", () => {
  it("asks for exactly the fields the URL parser asks for, for every shape", () => {
    fc.assert(
      fc.property(ANY_SHAPE, (shape) => {
        render(createRoomDraft(shape));

        expect(fieldNamesInTheTree()).toEqual([...requiredFieldsFor(shape)]);
      }),
    );
  });

  it("grows a U's third field with no branch of its own", () => {
    // The shape nobody can continue from yet (M7B) still costs nothing to carry, because the field
    // list is `requiredFieldsFor`'s and not this component's.
    render(createRoomDraft("U"));

    expect(fieldNamesInTheTree()).toContain("wallC");
    expect(labelBoundTo(fieldFor("wallC")).textContent).toBe(
      roMessages.room.wallLabel.wallC,
    );
  });

  it.each(EVERY_SHAPE)("names every %s field from the catalogue", (shape) => {
    render(createRoomDraft(shape));

    for (const field of requiredFieldsFor(shape)) {
      expect(labelBoundTo(fieldFor(field)).textContent).toBe(
        labelTextFor(field),
      );
    }
  });
});

describe("every length field is a text field with a decimal keypad (criterion 5)", () => {
  it("carries the attributes the frame's box depicts", () => {
    render(createRoomDraft("L"));

    for (const field of requiredFieldsFor("L")) {
      const input = fieldFor(field);
      expect(input.getAttribute("type")).toBe("text");
      expect(input.getAttribute("inputmode")).toBe("decimal");
      expect(input.id).not.toBe("");
    }
  });

  it("carries none of the attributes that would re-read a length", () => {
    // `type="number"` refuses a comma on several locales and reports a float; a `pattern` would be a
    // second authority on what a length may look like, which is `parse-metres.ts`'s alone.
    render(createRoomDraft("U"));

    for (const input of fieldsInTheTree()) {
      expect(input.getAttribute("type")).not.toBe("number");
      expect(input.hasAttribute("step")).toBe(false);
      expect(input.hasAttribute("pattern")).toBe(false);
    }
  });

  it.each(CATALOGUES)(
    "draws the unit inside every field box in %s",
    (locale, messages) => {
      render(createRoomDraft("L"), locale);

      for (const field of requiredFieldsFor("L")) {
        expect(fieldFor(field).parentElement?.textContent).toBe(
          messages.room.unitMetres,
        );
      }
    },
  );

  it("shows the value in tabular numerals", () => {
    // The attributes are the component's; the alignment is the stylesheet's, and the 390 x 844 gate
    // is what looks at it. This is the guard that the rule exists at all.
    expect(ROOM_STYLESHEET).toMatch(
      /\.fieldValue\s*\{[^}]*font-variant-numeric:\s*tabular-nums/,
    );
  });
});

describe("the corner toggle exists only for the shapes that turn one (criterion 6)", () => {
  it.each(["L", "U"] as const)("offers both directions for %s", (shape) => {
    render(createRoomDraft(shape));

    expect(
      container.querySelectorAll("[data-testid^='room-corner-control-']")
        .length,
    ).toBe(2);
    expect(
      container.querySelector("[data-testid='room-corner']")?.textContent,
    ).toContain(roMessages.room.cornerQuestion);
  });

  it("draws no toggle at all for a straight room", () => {
    // Absent from the tree, not hidden by CSS: a linear room has no corner to point anywhere.
    render(createRoomDraft("linear"));

    expect(
      container.querySelectorAll("[data-testid='room-corner']").length,
    ).toBe(0);
    expect(
      container.querySelectorAll("[data-testid^='room-corner-control-']")
        .length,
    ).toBe(0);
  });

  it("names the group with the visible question rather than an invented label", () => {
    render(createRoomDraft("L"));
    const group = container.querySelector("[role='radiogroup']");
    const labelId = group?.getAttribute("aria-labelledby") ?? "";

    expect(container.querySelector(`[id="${labelId}"]`)?.textContent).toBe(
      roMessages.room.cornerQuestion,
    );
  });
});

describe("a field still to be filled is not a field painted wrong (criterion 10)", () => {
  it("arrives with every field empty and nothing marked invalid", () => {
    render(createRoomDraft("L"));

    for (const input of fieldsInTheTree()) {
      expect(input.value).toBe("");
      expect(input.hasAttribute("aria-invalid")).toBe(false);
    }
    expect(container.querySelectorAll("[aria-invalid]").length).toBe(0);
  });

  it("keeps a half-typed value under the caret and still paints nothing", () => {
    // *"3,"* is on its way to being a length. It neither disappears nor is corrected, and it is not
    // an error: at 1B an unreadable field is the ordinary state on the way to a value.
    render(
      withEnteredText(createRoomDraft("L"), { field: "wallA", text: "3," }),
    );

    expect(fieldFor("wallA").value).toBe("3,");
    expect(container.querySelectorAll("[aria-invalid]").length).toBe(0);
  });

  it("shows the corner at left when the URL named none", () => {
    // Ruling R6's third layer. The parser still *marks* an absent `direction` — that is
    // `room-url-state.test.ts:304`'s claim and it is untouched — while the form the customer reads
    // shows frame 1B's pre-selected left.
    render(createRoomDraft("L"));

    const left = container.querySelector(
      "[data-testid='room-corner-control-left']",
    );
    const right = container.querySelector(
      "[data-testid='room-corner-control-right']",
    );

    expect(left).toBeInstanceOf(HTMLInputElement);
    expect((left as HTMLInputElement).checked).toBe(true);
    expect((right as HTMLInputElement).checked).toBe(false);
  });
});
