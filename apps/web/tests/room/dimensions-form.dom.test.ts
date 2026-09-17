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

import { DimensionsForm, WALL_LENGTH_HELP } from "@/room/dimensions-form";
import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import { requiredFieldsFor } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import { catalogueLeaves, CATALOGUES } from "../support/catalogues";

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

// ── Wave 7A3 S3: the wall fields say what number to type (owner ruling Q-7A3-1) ─────────────────────

type WallField = Exclude<RoomLengthField, "height">;

/** Criterion 21 at compile time: `tsc` over this file fails if a wall the URL parser knows has no
 *  help copy, whatever later happens to the `satisfies` beside the table. */
type WallWithoutHelp = Exclude<WallField, keyof typeof WALL_LENGTH_HELP>;
const EVERY_WALL_HAS_HELP: [WallWithoutHelp] extends [never] ? true : false =
  true;

function isWallField(field: RoomLengthField): field is WallField {
  return field !== "height";
}

function wallsOf(shape: RoomShape): readonly WallField[] {
  return requiredFieldsFor(shape).filter(isWallField);
}

function lengthsHint(): HTMLElement {
  const hint = container.querySelector("[data-testid='room-lengths-hint']");
  if (!(hint instanceof HTMLElement)) {
    throw new Error("the form draws no hint above the wall fields");
  }
  return hint;
}

function helpButtonFor(wall: WallField): HTMLButtonElement {
  const button = container.querySelector(
    `[data-testid="room-length-help-${wall}"]`,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`the ${wall} field carries no help button`);
  }
  return button;
}

function explanationControlledBy(button: HTMLButtonElement): HTMLElement {
  const explanation = container.querySelector(
    `[id="${button.getAttribute("aria-controls") ?? ""}"]`,
  );
  if (!(explanation instanceof HTMLElement)) {
    throw new Error("the help button controls no element");
  }
  return explanation;
}

function describedByIds(input: HTMLInputElement): readonly string[] {
  return (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "");
}

function press(button: HTMLButtonElement): void {
  act(() => {
    button.click();
  });
}

function dispatchOn(target: EventTarget, event: Event): void {
  act(() => {
    target.dispatchEvent(event);
  });
}

function pointerDownOn(target: EventTarget): void {
  dispatchOn(target, new Event("pointerdown", { bubbles: true }));
}

/**
 * The explanation the owner's ruling of 2026-09-17 gives a wall in a room of this shape, read from the
 * catalogue by the ruling rather than through `WALL_LENGTH_HELP`, so the table cannot supply both sides:
 * a room that turns a corner measures every wall from it, and a straight room has only wall A.
 */
function explanationFor(
  messages: typeof roMessages,
  { wall, shape }: { readonly wall: WallField; readonly shape: RoomShape },
): string {
  const help = messages.room.lengthHelp;
  if (shape === "linear") return help.wallA.text;
  return wall === "wallA" ? help.wallA.cornerText : help[wall].text;
}

/** A press as a browser performs it: focus moves to the nearest focusable element at or above the
 *  target, or leaves to `body` when there is none. happy-dom focuses on `pointerdown` by itself only
 *  where it is told to, so without this a press inside a non-focusable explanation would keep the
 *  button focused and hide the Chrome defect this models. */
function pressLikeABrowser(target: HTMLElement): void {
  pointerDownOn(target);
  const focusable = target.closest("[tabindex], button, input, a[href]");
  act(() => {
    if (focusable instanceof HTMLElement) focusable.focus();
    else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

/** Every declaration block whose selector names `.lengthsHint`, from the stylesheet that ships. */
function lengthsHintDeclarations(): readonly string[] {
  return [
    ...ROOM_STYLESHEET.matchAll(/([^{}]*\.lengthsHint\b[^{}]*)\{([^}]*)\}/g),
  ].map((match) => match[2] ?? "");
}

/**
 * What criterion 19 forbids the copy that says what to type to state: a number, a unit, or a word
 * that bounds the length. Each carries a sentence it must catch. Romanian is matched with or without
 * its diacritics — *pana la* is how a phone keyboard without them writes *până la* — and the Romanian
 * letters are escapes, because one in a regex literal is a lint failure.
 */
const BOUND_WORDS: readonly {
  readonly pattern: RegExp;
  readonly sample: string;
}[] = [
  { pattern: /\d/u, sample: "6" },
  { pattern: /(^|\P{L})(mm|мм)(\P{L}|$)/iu, sample: "6000 mm" },
  { pattern: /max|макс/iu, sample: "Maxim" },
  { pattern: /metr|метр/iu, sample: "metri" },
  { pattern: /milimetr|миллиметр/iu, sample: "миллиметров" },
  { pattern: /cel\s+mult/iu, sample: "cel mult" },
  {
    pattern: /p[a\u0103\u00e2\u00ee]n[a\u0103]\s+la(\P{L}|$)/iu,
    sample: "pana la perete",
  },
  { pattern: /не\s+более|не\s+больше/iu, sample: "не больше стены" },
  { pattern: /limit|лимит|ограничен/iu, sample: "ограничено" },
];

/** The leaves this wave adds, in one catalogue. */
function lengthCopyIn(messages: typeof roMessages): readonly string[] {
  return [
    messages.room.lengthsHint,
    ...catalogueLeaves(messages.room.lengthHelp).map(([, leaf]) => leaf),
  ];
}

describe("a customer who taps nothing is told what number to type (7A3 criterion 17)", () => {
  it.each(EVERY_SHAPE)(
    "draws the hint above the fields, unhidden, for a %s room",
    (shape) => {
      render(createRoomDraft(shape));
      const hint = lengthsHint();
      const firstField = fieldFor(requiredFieldsFor(shape)[0] ?? "wallA");

      expect(hint.textContent).toBe(roMessages.room.lengthsHint);
      expect(hint.hidden).toBe(false);
      expect(
        hint.compareDocumentPosition(firstField) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    },
  );

  it("is not hidden by the stylesheet either", () => {
    // `hidden` above is the attribute; a visually-hidden pattern in CSS would pass it and still show
    // a sighted customer nothing.
    const declarations = lengthsHintDeclarations();

    expect(declarations.length).toBeGreaterThan(0);
    for (const block of declarations) {
      expect(block).not.toMatch(/display:\s*none/);
      expect(block).not.toMatch(/visibility:\s*hidden/);
      expect(block).not.toMatch(/opacity:\s*0(?![.\d])/);
      expect(block).not.toMatch(/clip(-path)?:/);
      expect(block).not.toMatch(/position:\s*absolute/);
      expect(block).not.toMatch(/(^|[;\s])(width|height|font-size):\s*[01]px/);
    }
  });

  it.each(CATALOGUES)("says it in %s", (locale, messages) => {
    render(createRoomDraft("L"), locale);

    expect(lengthsHint().textContent).toBe(messages.room.lengthsHint);
  });

  it("describes every wall field with the hint, and the height with nothing", () => {
    // The association is what a screen reader announces on focus, so it is the non-visual half of
    // the same criterion: the customer hears it without opening anything.
    render(createRoomDraft("U"));
    const hintId = lengthsHint().id;

    for (const wall of wallsOf("U")) {
      expect(describedByIds(fieldFor(wall))).toContain(hintId);
    }
    expect(fieldFor("height").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("each wall carries its own help, and the height carries none (7A3 criterion 21)", () => {
  it("keys the help over every wall the URL parser knows", () => {
    expect(EVERY_WALL_HAS_HELP).toBe(true);
    expect(Object.keys(WALL_LENGTH_HELP)).toEqual([...wallsOf("U")]);
  });

  it("gives every wall a native button with a name of its own", () => {
    render(createRoomDraft("U"));
    const walls = wallsOf("U");

    for (const wall of walls) {
      const button = helpButtonFor(wall);
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("aria-label")).toBe(
        roMessages.room.lengthHelp[wall].name,
      );
    }
    const names = walls.map((wall) =>
      helpButtonFor(wall).getAttribute("aria-label"),
    );
    expect(new Set(names).size).toBe(walls.length);
    expect(
      container.querySelectorAll("[data-testid^='room-length-help-height']")
        .length,
    ).toBe(0);
  });

  it("controls the wall's own explanation, which also describes the wall's field while closed", () => {
    render(createRoomDraft("U"));

    for (const wall of wallsOf("U")) {
      const explanation = explanationControlledBy(helpButtonFor(wall));
      expect(explanation.textContent).toBe(
        explanationFor(roMessages, { wall, shape: "U" }),
      );
      expect(explanation.hidden).toBe(true);
      expect(describedByIds(fieldFor(wall))).toContain(explanation.id);
    }
  });

  it.each(CATALOGUES)(
    "names and explains every wall from the %s catalogue",
    (locale, messages) => {
      render(createRoomDraft("U"), locale);

      for (const wall of wallsOf("U")) {
        const button = helpButtonFor(wall);
        expect(button.getAttribute("aria-label")).toBe(
          messages.room.lengthHelp[wall].name,
        );
        expect(explanationControlledBy(button).textContent).toBe(
          explanationFor(messages, { wall, shape: "U" }),
        );
      }
    },
  );
});

describe("the explanation says the length is measured from the corner, in a room with one (owner ruling 2026-09-17)", () => {
  it.each(EVERY_SHAPE)(
    "gives every wall of a %s room the reading for its shape",
    (shape) => {
      render(createRoomDraft(shape));

      for (const wall of wallsOf(shape)) {
        expect(
          explanationControlledBy(helpButtonFor(wall)).textContent,
          wall,
        ).toBe(explanationFor(roMessages, { wall, shape }));
      }
    },
  );

  it.each(["L", "U"] as const)(
    "does not give wall A of a %s room the straight room's reading",
    (shape) => {
      // The two readings must differ, or the test above could not tell which one was chosen.
      expect(roMessages.room.lengthHelp.wallA.cornerText).not.toBe(
        roMessages.room.lengthHelp.wallA.text,
      );
      render(createRoomDraft(shape));

      expect(explanationControlledBy(helpButtonFor("wallA")).textContent).toBe(
        roMessages.room.lengthHelp.wallA.cornerText,
      );
    },
  );
});

describe("the help opens and closes by pointer and keyboard (owner ruling Q-7A3-1)", () => {
  it("opens on a press and closes on a second one", () => {
    render(createRoomDraft("L"));
    const button = helpButtonFor("wallB");
    const explanation = explanationControlledBy(button);

    expect(button.getAttribute("aria-expanded")).toBe("false");

    press(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(explanation.hidden).toBe(false);

    press(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(explanation.hidden).toBe(true);
  });

  it("closes on Escape", () => {
    render(createRoomDraft("L"));
    const button = helpButtonFor("wallA");
    press(button);

    dispatchOn(
      button,
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(explanationControlledBy(button).hidden).toBe(true);
  });

  it("closes on a pointer press outside it", () => {
    render(createRoomDraft("L"));
    const button = helpButtonFor("wallA");
    press(button);

    pointerDownOn(fieldFor("wallA"));

    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays open when a press on its explanation moves focus there from the button", () => {
    // Review 3: Chrome sends focus to `body` from a press on a non-focusable element, and the blur
    // that follows has no related target inside the help — so the text closed under the finger.
    render(createRoomDraft("L"));
    const button = helpButtonFor("wallA");
    act(() => {
      button.focus();
    });
    press(button);
    const explanation = explanationControlledBy(button);

    pressLikeABrowser(explanation);

    expect(document.activeElement).toBe(explanation);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(explanation.hidden).toBe(false);
  });

  it("keeps the explanation out of the Tab order while taking focus from a press", () => {
    render(createRoomDraft("L"));

    // The attribute, not the `tabIndex` property: a span with no attribute already reads -1 there.
    expect(
      explanationControlledBy(helpButtonFor("wallA")).getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("closes when keyboard focus moves on to the field", () => {
    render(createRoomDraft("L"));
    const button = helpButtonFor("wallA");
    act(() => {
      button.focus();
    });
    press(button);

    act(() => {
      fieldFor("wallA").focus();
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("paints nothing as an error while open", () => {
    // `dimensions-form.tsx`'s head comment: nothing on 1B is painted wrong, and the help is not a
    // refusal (7A3 criteria 19 and 20).
    render(createRoomDraft("U"));
    for (const wall of wallsOf("U")) press(helpButtonFor(wall));

    expect(container.querySelectorAll("[aria-invalid]").length).toBe(0);
    expect(container.querySelectorAll("[role='alert']").length).toBe(0);
  });
});

describe("the copy that says what to type states no bound (7A3 criterion 19, ADR 0108 decision 3)", () => {
  it.each(CATALOGUES)(
    "carries no digit, no unit and no bound word in %s",
    (_locale, messages) => {
      for (const sentence of lengthCopyIn(messages)) {
        for (const { pattern } of BOUND_WORDS) {
          expect(sentence).not.toMatch(pattern);
        }
      }
    },
  );

  it.each(BOUND_WORDS)(
    "would catch $pattern, which matches $sample",
    ({ pattern, sample }) => {
      // A pattern that can match nothing reports green forever, so each one is shown to fire.
      expect(sample).toMatch(pattern);
    },
  );
});
