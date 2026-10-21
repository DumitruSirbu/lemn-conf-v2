// @vitest-environment happy-dom
//
// The notes of the staff kitchen as a person meets them (Lot 3 frames S3B, S3F, S3F2 and S3F3), in Romanian and in Russian:
// the list, and the field that adds one with every state it can be in. The server is the project's stand-in for `fetch`; the
// words are the shipped catalogue's. What a note holds is a client's personal data, so the tests also hold that it goes
// nowhere but the one request: not an address, not the browser's storage, not the console.
import { createTranslator } from "next-intl";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getStaffSessionExpiry } from "@/staff/staff-session-expiry";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  byWords,
  click,
  requireIn,
  type TestLocale,
} from "../support/render-with-intl";
import {
  NOTE_ADDRESS,
  bodyOf,
  invalidInput,
  noteCreated,
  readsOf,
  routeKitchen,
  typeIntoTextarea,
  itemAt,
  theOnly,
  wireNoteStored,
  writesOf,
  ONE_REFUSAL,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  type RecordedRequest,
} from "../support/staff-kitchens-wire";

import {
  PAGE,
  setUpScreenHarness,
  type KitchenAnswer,
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

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const NOTE_LIMIT = 2000;
const TYPED = "Clientul vrea fronturi din nuc; verific stocul pana joi.";
const A_DAY_MS = 24 * 60 * 60 * 1000;

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
});

afterEach(() => {
  harness.tearDown();
  vi.restoreAllMocks();
});

type NoteRoute = (request: RecordedRequest) => KitchenAnswer;

function serve(note: NoteRoute, kitchen = wireKitchen()): void {
  harness.answers(routeKitchen({ read: () => ({ body: kitchen }), note }));
}

function notes(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-notes"]');
}

function field(): HTMLTextAreaElement {
  return requireIn<HTMLTextAreaElement>(notes(), "textarea");
}

function saveButton(): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(notes(), 'button[type="submit"]');
}

async function typeAndSave(text: string): Promise<void> {
  typeIntoTextarea(field(), text);
  click(saveButton());
  await harness.settle();
}

function listedTexts(): string[] {
  return allIn(notes(), "li p").map((paragraph) => paragraph.textContent);
}

describe.each(LOCALES)("the notes in %s", (locale) => {
  const copy = CATALOGUES[locale].staffNotes;
  const say = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
    namespace: "staffNotes",
  });
  const errors = CATALOGUES[locale].accountFieldErrors;

  describe("the list", () => {
    it("says there are none yet, and draws the field to add the first", async () => {
      serve(() => noteCreated());
      await harness.mount({ locale });

      expect(notes().textContent).toContain(copy.empty);
      expect(allIn(notes(), "li")).toHaveLength(0);
      expect(field().value).toBe("");
      expect(notes().textContent).toContain(copy.dataLine);
    });

    it("lists the notes newest first as handed, each with its author, its day and its age", async () => {
      serve(
        () => noteCreated(),
        wireKitchen({
          notes: [
            wireNoteStored({
              id: "n2",
              text: "Al doilea\nrand",
              createdAt: "2026-10-19T11:41:00.000Z",
            }),
            wireNoteStored({
              id: "n1",
              text: "Prima",
              createdAt: "2026-10-18T11:20:00.000Z",
              author: { email: "elena@lemnaria.md", name: null },
            }),
            wireNoteStored({
              id: "n0",
              text: "Fara autor",
              author: { email: null, name: null },
            }),
          ],
        }),
      );
      await harness.mount({ locale });

      expect(listedTexts()).toEqual(["Al doilea\nrand", "Prima", "Fara autor"]);
      const items = allIn(notes(), "li");
      const [first, second, third] = [0, 1, 2].map((place) =>
        itemAt(items, place),
      );
      expect(first?.textContent).toContain("Mihai Rusu");
      expect(second?.textContent).toContain("elena@lemnaria.md");
      expect(third?.textContent).toContain(
        CATALOGUES[locale].staffKitchens.noValue,
      );
      const when = requireIn(itemAt(items, 0), "time");
      expect(when.getAttribute("datetime")).toBe("2026-10-19T11:41:00.000Z");
      // 11:41 UTC is 14:41 on the shop's clock in October.
      expect(when.textContent).toContain("19.10.2026, 14:41");
      expect(
        requireIn(notes(), '[data-testid="staff-notes-count"]').textContent,
      ).toBe(say("count", { count: 3 }));
    });

    it("draws a note as text: markup in it is words, a line feed is kept, and an author stands in an element of its own", async () => {
      serve(
        () => noteCreated(),
        wireKitchen({
          notes: [
            wireNoteStored({
              id: "n1",
              text: '<img src=x onerror="alert(1)"><script>alert(2)</script>\n‮a',
              author: { email: null, name: "<b>Mihai</b>" },
            }),
          ],
        }),
      );
      await harness.mount({ locale });

      expect(allIn(notes(), "img, script, b")).toHaveLength(0);
      const text = requireIn(notes(), "li p");
      expect(text.textContent).toContain("<script>alert(2)</script>\n");
      expect(requireIn(notes(), "li span").textContent).toBe("<b>Mihai</b>");
    });

    it("counts a hundred notes as a hundred, and says only the newest are shown when the kitchen holds more", async () => {
      const hundred = Array.from({ length: 100 }, (_, index) =>
        wireNoteStored({
          id: `n${String(index)}`,
          text: `Nota ${String(index)}`,
        }),
      );
      serve(() => noteCreated(), wireKitchen({ notes: hundred }));
      await harness.mount({ locale });
      const whole = requireIn(
        notes(),
        '[data-testid="staff-notes-count"]',
      ).textContent;
      harness.unmount();

      serve(
        () => noteCreated(),
        wireKitchen({ notes: hundred, notesTruncated: true }),
      );
      await harness.mount({ locale });
      const cut = requireIn(
        notes(),
        '[data-testid="staff-notes-count"]',
      ).textContent;

      expect(allIn(notes(), "li")).toHaveLength(100);
      expect(whole).toBe(say("count", { count: 100 }));
      expect(cut).toBe(say("truncated", { count: 100 }));
      expect(cut).not.toBe(whole);
    });
  });

  describe("the field", () => {
    beforeEach(async () => {
      serve(() => noteCreated());
      await harness.mount({ locale });
    });

    it("has a label, a placeholder and a counter that starts at nought", () => {
      const label = requireIn(notes(), "label");

      expect(label.textContent).toBe(copy.fieldLabel);
      expect(label.getAttribute("for")).toBe(field().id);
      expect(field().getAttribute("placeholder")).toBe(copy.fieldPlaceholder);
      expect(notes().textContent).toContain(
        say("counter", { count: 0, max: NOTE_LIMIT }),
      );
      expect(field().hasAttribute("maxlength")).toBe(false);
    });

    it("counts code points after composing, as the server does: a thousand decomposed syllables are a thousand", () => {
      typeIntoTextarea(field(), "한".repeat(1000));

      expect(notes().textContent).toContain(
        say("counter", { count: 1000, max: NOTE_LIMIT }),
      );
    });

    it("refuses an empty note, and one of spaces, without a request, and puts the refusal at the field", async () => {
      for (const typed of ["", "   \n  "]) {
        typeIntoTextarea(field(), typed);
        click(saveButton());
        await harness.settle();

        expect(writesOf(harness.server)).toHaveLength(0);
        expect(field().getAttribute("aria-invalid")).toBe("true");
        expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
          errors.noteRequired,
        );
        expect(document.activeElement).toBe(field());
      }
    });

    it("refuses a note over the limit without a request, keeps the text, and says the limit", async () => {
      const typed = "a".repeat(NOTE_LIMIT + 1);

      await typeAndSave(typed);

      expect(writesOf(harness.server)).toHaveLength(0);
      expect(field().value).toBe(typed);
      expect(requireIn(notes(), '[role="alert"]').textContent).toBe(
        createTranslator({
          locale,
          messages: CATALOGUES[locale] as typeof roMessages,
          namespace: "accountFieldErrors",
        })("noteTooLong", { max: NOTE_LIMIT }),
      );
    });

    it("accepts a note of exactly the limit", async () => {
      await typeAndSave("a".repeat(NOTE_LIMIT));

      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it.each([
      ["a tab", "a\tb"],
      ["a carriage return", "a\rb"],
      ["a control character", "a\u0007b"],
      ["a bidi override", "a‮b"],
    ])(
      "refuses %s without a request, keeps the text and names the cause",
      async (_, typed) => {
        await typeAndSave(typed);

        expect(writesOf(harness.server)).toHaveLength(0);
        expect(field().value).toBe(typed);
        expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
          errors.noteForbiddenCharacter,
        );
      },
    );

    it("keeps a line feed, and sends the note composed to NFC and trimmed", async () => {
      await typeAndSave("  Café\nnoua​  \n");

      const sent = theOnly(writesOf(harness.server));
      expect(sent.url.pathname).toBe(NOTE_ADDRESS);
      expect(sent.init.method).toBe("POST");
      expect(bodyOf(sent)).toEqual({ text: "Café\nnoua" });
    });

    it("clears the refusal as soon as the person types again", async () => {
      await typeAndSave("");
      expect(allIn(notes(), '[role="alert"]')).toHaveLength(1);

      typeIntoTextarea(field(), "a");

      expect(allIn(notes(), '[role="alert"]')).toHaveLength(0);
      expect(field().getAttribute("aria-invalid")).toBeNull();
    });
  });

  describe("saving", () => {
    it("shows the request out: the button stays the one element, busy and named for it, and the text stays in the field", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      typeIntoTextarea(field(), TYPED);
      const button = saveButton();

      click(button);
      await harness.settle();

      expect(saveButton()).toBe(button);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.textContent).toBe(copy.submitting);
      expect(field().value).toBe(TYPED);
      expect(field().readOnly).toBe(true);
    });

    it("sends one request however often it is pressed while it is out", async () => {
      serve(() => "hold");
      await harness.mount({ locale });
      typeIntoTextarea(field(), TYPED);

      click(saveButton());
      click(saveButton());
      act(() => {
        requireIn<HTMLFormElement>(notes(), "form").dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await harness.settle();

      expect(writesOf(harness.server)).toHaveLength(1);
    });

    it("puts the stored note on top, empties the field, says it is saved, and does not read the kitchen again", async () => {
      serve(
        () => noteCreated({ text: TYPED }),
        wireKitchen({
          notes: [wireNoteStored({ id: "old", text: "Veche" })],
        }),
      );
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      expect(listedTexts()).toEqual([TYPED, "Veche"]);
      expect(field().value).toBe("");
      expect(requireIn(notes(), '[role="status"]').textContent).toBe(
        copy.saved,
      );
      expect(readsOf(harness.server)).toHaveLength(1);
      expect(allIn(notes(), 'li[data-fresh="true"]')).toHaveLength(1);
      expect(
        requireIn(notes(), '[data-testid="staff-notes-count"]').textContent,
      ).toBe(say("count", { count: 2 }));
    });

    it("takes the saved notice away when the person types the next note", async () => {
      serve(() => noteCreated());
      await harness.mount({ locale });
      await typeAndSave(TYPED);

      typeIntoTextarea(field(), "a");

      expect(allIn(notes(), '[role="status"]')).toHaveLength(0);
    });

    it("keeps the list at a hundred and says it is cut when a hundred and first is added", async () => {
      const hundred = Array.from({ length: 100 }, (_, index) =>
        wireNoteStored({
          id: `n${String(index)}`,
          text: `Nota ${String(index)}`,
        }),
      );
      serve(
        () => noteCreated({ id: "newest", text: "Cea mai noua" }),
        wireKitchen({ notes: hundred }),
      );
      await harness.mount({ locale });

      await typeAndSave("Cea mai noua");

      expect(allIn(notes(), "li")).toHaveLength(100);
      expect(listedTexts()[0]).toBe("Cea mai noua");
      expect(listedTexts()).not.toContain("Nota 99");
      expect(
        requireIn(notes(), '[data-testid="staff-notes-count"]').textContent,
      ).toBe(say("truncated", { count: 100 }));
    });

    it("lets a second note be added after the first, each once", async () => {
      let serial = 0;
      serve((request) => {
        serial += 1;
        const { text } = bodyOf(request) as { text: string };
        return noteCreated({ id: `n${String(serial)}`, text });
      });
      await harness.mount({ locale });

      await typeAndSave("Prima");
      await typeAndSave("A doua");

      expect(listedTexts()).toEqual(["A doua", "Prima"]);
      expect(writesOf(harness.server)).toHaveLength(2);
    });
  });

  describe("when the note is not saved", () => {
    it.each([
      ["a 503", UNAVAILABLE_ANSWER],
      ["no connection", "offline"],
      ["a 500", { status: 500, body: undefined }],
      [
        "a 400 invalid-request",
        { status: 400, body: { status: "invalid-request" } },
      ],
      ["a 413", { status: 413, body: { status: "payload-too-large" } }],
    ] as const)(
      "says so after %s, keeps the text and sends nothing more by itself",
      async (_, answer) => {
        serve(() => answer);
        await harness.mount({ locale });

        await typeAndSave(TYPED);
        await harness.pass(A_DAY_MS);

        const alert = requireIn(notes(), '[role="alert"]');
        expect(alert.textContent).toContain(copy.errorTitle);
        expect(alert.textContent).toContain(copy.errorBody);
        expect(field().value).toBe(TYPED);
        expect(writesOf(harness.server)).toHaveLength(1);
        expect(readsOf(harness.server)).toHaveLength(1);
        expect(listedTexts()).toEqual([]);
      },
    );

    it("lets the person press again after a failure, and saves the note once", async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1
          ? UNAVAILABLE_ANSWER
          : noteCreated({ text: TYPED });
      });
      await harness.mount({ locale });
      await typeAndSave(TYPED);

      click(saveButton());
      await harness.settle();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(listedTexts()).toEqual([TYPED]);
      expect(field().value).toBe("");
      expect(allIn(notes(), '[role="alert"]')).toHaveLength(0);
    });

    it("places a text the server refused at the field, with its sentence, and keeps the text", async () => {
      serve(() => invalidInput("text", "NOTE_TEXT_NOT_JUDGED"));
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      expect(field().getAttribute("aria-invalid")).toBe("true");
      expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
        errors.noteNotJudged,
      );
      expect(field().value).toBe(TYPED);
      expect(document.activeElement).toBe(field());
    });

    it("tells a 400 that names no field of the note as a failed save", async () => {
      serve(() => invalidInput("status", "REQUIRED"));
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      expect(field().getAttribute("aria-invalid")).toBeNull();
      expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
        copy.errorBody,
      );
    });

    it("tells a 403 as a right the account lacks, and keeps the text", async () => {
      serve(() => FORBIDDEN_ANSWER);
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
        copy.forbiddenBody,
      );
      expect(field().value).toBe(TYPED);
      expect(getStaffSessionExpiry()).toBeUndefined();
    });

    it("tells the one refusal as a kitchen that is gone, and keeps the text", async () => {
      serve(() => ONE_REFUSAL);
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
        copy.kitchenGoneBody,
      );
      expect(field().value).toBe(TYPED);
    });
  });

  describe("a limit (429)", () => {
    beforeEach(async () => {
      let attempt = 0;
      serve(() => {
        attempt += 1;
        return attempt === 1
          ? RATE_LIMITED_ANSWER(30)
          : noteCreated({ text: TYPED });
      });
      await harness.mount({ locale });
      await typeAndSave(TYPED);
    });

    it("says it as a warning, keeps the text, and holds the button off for the wait", () => {
      expect(requireIn(notes(), '[data-tone="warning"]')).not.toBeNull();
      expect(field().value).toBe(TYPED);
      expect(saveButton().getAttribute("aria-disabled")).toBe("true");
      expect(saveButton().textContent).toBe(copy.submit);
    });

    it("sends nothing for a press before the wait is over, and one request for the first press after it", async () => {
      click(saveButton());
      await harness.settle();
      await harness.pass(20_000);
      click(saveButton());
      await harness.settle();
      expect(writesOf(harness.server)).toHaveLength(1);

      await harness.pass(11_000);
      expect(saveButton().getAttribute("aria-disabled")).toBeNull();
      click(saveButton());
      await harness.settle();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(listedTexts()).toEqual([TYPED]);
    });

    it("sends nothing by itself when the wait is over", async () => {
      await harness.pass(A_DAY_MS);

      expect(writesOf(harness.server)).toHaveLength(1);
    });
  });

  describe("the session ends (401, frame S1C)", () => {
    it("draws the sheet over the page, leaves the typed note in the field, and does not navigate", async () => {
      serve(() => UNAUTHENTICATED_ANSWER);
      await harness.mount({ locale });

      await typeAndSave(TYPED);

      const sheet = requireIn(
        harness.container(),
        '[data-testid="staff-session-sheet"]',
      );
      expect(sheet.textContent).toContain(
        CATALOGUES[locale].staffActions.sessionBodyKeepsText,
      );
      expect(field().value).toBe(TYPED);
      expect(requireIn(harness.container(), PAGE)).not.toBeNull();
      expect(harness.assigned).toEqual([]);
      expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
      expect(allIn(notes(), '[role="alert"]')).toHaveLength(0);
    });

    it("sends nothing by itself, and saves the note once when the person says they are signed in and presses again", async () => {
      serve(() => UNAUTHENTICATED_ANSWER);
      await harness.mount({ locale });
      await typeAndSave(TYPED);
      await harness.pass(A_DAY_MS);
      expect(writesOf(harness.server)).toHaveLength(1);
      const answerOfNote = routeKitchen({
        read: () => ({ body: wireKitchen() }),
        note: () => noteCreated({ text: TYPED }),
      });
      harness.server.script((request) =>
        request.url.pathname === "/api/account/session"
          ? {
              body: {
                state: "signed-in",
                email: "mihai.rusu@lemnaria.md",
                capabilities: ["design.read.any"],
              },
            }
          : answerOfNote(request),
      );

      const recheck = byWords(
        harness.container(),
        "button",
        CATALOGUES[locale].staffActions.sessionRecheck,
      );
      click(recheck);
      await harness.settle();

      expect(
        allIn(harness.container(), '[data-testid="staff-session-sheet"]'),
      ).toHaveLength(0);
      expect(field().value).toBe(TYPED);
      expect(writesOf(harness.server)).toHaveLength(1);

      click(saveButton());
      await harness.settle();

      expect(writesOf(harness.server)).toHaveLength(2);
      expect(listedTexts()).toEqual([TYPED]);
    });
  });

  describe("what a note is never put in", () => {
    it("is in the request body and nowhere else: not an address, not storage, not the console, not a navigation", async () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const logged = [
        vi.spyOn(console, "log"),
        vi.spyOn(console, "info"),
        vi.spyOn(console, "warn"),
        vi.spyOn(console, "error"),
        vi.spyOn(console, "debug"),
      ];
      serve(() => UNAVAILABLE_ANSWER);
      await harness.mount({ locale });
      const secret = "parola-clientului-9f3a";

      await typeAndSave(secret);
      typeIntoTextarea(field(), `${secret} din nou`);

      for (const request of harness.server.requests) {
        expect(request.url.href).not.toContain(secret);
      }
      expect(setItem).not.toHaveBeenCalled();
      for (const spy of logged) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
      }
      expect(harness.assigned).toEqual([]);
      expect(document.title).not.toContain(secret);
    });
  });
});
