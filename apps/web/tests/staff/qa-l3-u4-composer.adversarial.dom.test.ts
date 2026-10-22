// @vitest-environment happy-dom
//
// Adversarial QA of wave L3-U4, the note composer against the rule of P-L3-5 written out again here, independently of
// `judgeNoteText`: for any text a person can type, the counter shows the code points the server will count, a refused text
// sends nothing and stays in the field with its sentence, and an accepted one goes out as one body of one member, composed to
// NFC and trimmed, inside the server's 8 KiB bound. The oracle below is the plan's sentence, not the domain's code.
import { fc } from "@fast-check/vitest";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  bodyOf,
  noteCreated,
  routeKitchen,
  typeIntoTextarea,
  writesOf,
} from "../support/staff-kitchen-actions-screen";
import { wireKitchen } from "../support/staff-kitchen-wire";

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

const NOTE_LIMIT = 2000;
/** The account routes' bound on a request body, in bytes (`ACCOUNT_BODY_MAX_BYTES`, `account-request.ts`). */
const SERVER_BODY_LIMIT_BYTES = 8 * 1024;
const ERRORS = roMessages.accountFieldErrors;
const say = createTranslator({
  locale: "ro",
  messages: roMessages,
  namespace: "staffNotes",
});
const sayError = createTranslator({
  locale: "ro",
  messages: roMessages,
  namespace: "accountFieldErrors",
});

type Verdict =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly sentence: string };

/** P-L3-5 as a sentence: a control character other than the line feed, a line or paragraph separator, a lone surrogate half
 *  or a bidi override or isolate refuses the text; format characters are removed; the rest is composed to NFC and trimmed,
 *  and counted in code points from 1 to 2000. */
function verdictOf(typed: string): Verdict {
  const forbidden = /[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u202A-\u202E\u2066-\u2069]/u;
  const withLineFeedsOut = typed.replaceAll("\n", "");
  if (forbidden.test(withLineFeedsOut)) {
    return { ok: false, sentence: ERRORS.noteForbiddenCharacter };
  }
  const visible = typed.replace(/\p{Cf}/gu, "");
  if (visible.length > NOTE_LIMIT * 8) {
    return {
      ok: false,
      sentence: sayError("noteTooLong", { max: NOTE_LIMIT }),
    };
  }
  const text = visible.normalize("NFC").trim();
  if (text === "") return { ok: false, sentence: ERRORS.noteRequired };
  return Array.from(text).length > NOTE_LIMIT
    ? { ok: false, sentence: sayError("noteTooLong", { max: NOTE_LIMIT }) }
    : { ok: true, text };
}

const FRAGMENTS = [
  "a",
  "Ab ",
  " ",
  "  ",
  "\n",
  "\r\n",
  "\t",
  "\u0000",
  "\u0007",
  "\u0085",
  "\u2028",
  "\u00A0",
  "e\u0301",
  "\u00E9",
  "\u1112\u1161\u11AB",
  "\uD55C",
  "\u{1F600}",
  "\uD83D",
  "\uDE00",
  "\u0301",
  "\u200B",
  "\u200E",
  "\uFEFF",
  "\u00AD",
  "\u202E",
  "\u2066",
  "<b>{count}</b>",
  "'",
  '"',
  "\\",
] as const;

const typedTexts = fc
  .array(
    fc.tuple(
      fc.constantFrom(...FRAGMENTS),
      fc.oneof(
        { weight: 6, arbitrary: fc.integer({ min: 1, max: 6 }) },
        { weight: 1, arbitrary: fc.integer({ min: 300, max: 700 }) },
      ),
    ),
    { minLength: 0, maxLength: 8 },
  )
  .map((runs) => runs.map(([piece, count]) => piece.repeat(count)).join(""));

let harness: ScreenHarness;

beforeEach(async () => {
  harness = setUpScreenHarness();
  harness.answers(
    routeKitchen({
      read: () => ({ body: wireKitchen() }),
      note: (request) =>
        noteCreated({
          id: `n${String(harness.server.requests.length)}`,
          text: (bodyOf(request) as { text: string }).text,
        }),
    }),
  );
  await harness.mount();
});

afterEach(() => {
  harness.tearDown();
});

function notes(): HTMLElement {
  return requireIn(harness.container(), '[data-testid="staff-notes"]');
}

function field(): HTMLTextAreaElement {
  return requireIn<HTMLTextAreaElement>(notes(), "textarea");
}

async function press(): Promise<void> {
  click(requireIn(notes(), 'button[type="submit"]'));
  await harness.settle();
}

function bytesOf(body: unknown): number {
  return new TextEncoder().encode(body as string).length;
}

describe("the composer for any text a person can type (property)", () => {
  it("counts what the server will count, sends nothing for a refused text and keeps it, and sends one composed body for an accepted one", async () => {
    await fc.assert(
      fc.asyncProperty(typedTexts, async (typed) => {
        const verdict = verdictOf(typed);
        const writesBefore = writesOf(harness.server).length;

        typeIntoTextarea(field(), typed);
        if (verdict.ok) {
          expect(notes().textContent).toContain(
            say("counter", {
              count: Array.from(verdict.text).length,
              max: NOTE_LIMIT,
            }),
          );
        }
        await press();
        const writes = writesOf(harness.server).slice(writesBefore);

        if (verdict.ok) {
          expect(writes).toHaveLength(1);
          const [sent] = writes;
          const body = bodyOf(sent as never) as Record<string, unknown>;
          expect(Object.keys(body)).toEqual(["text"]);
          expect(body.text).toBe(verdict.text);
          expect(bytesOf(sent?.init.body)).toBeLessThan(
            SERVER_BODY_LIMIT_BYTES,
          );
          expect(field().value).toBe("");
        } else {
          expect(writes).toHaveLength(0);
          expect(field().value).toBe(typed);
          expect(field().getAttribute("aria-invalid")).toBe("true");
          expect(requireIn(notes(), '[role="alert"]').textContent).toBe(
            verdict.sentence,
          );
          expect(document.activeElement).toBe(field());
        }
      }),
      { numRuns: 120 },
    );
  }, 60_000);
});

describe("the limit exactly, in each way of reaching it", () => {
  const ONE_LETTER_OF_EACH_KIND = [
    ["plain letters", "a", 1],
    ["astral characters", "\u{1F600}", 2],
    ["decomposed Hangul syllables", "\u1112\u1161\u11AB", 3],
    ["letters with a combining accent", "e\u0301", 2],
  ] as const;

  it.each(ONE_LETTER_OF_EACH_KIND)(
    "accepts %s at 2000 code points after composing and refuses 2001, sending nothing for the refusal",
    async (_, unit) => {
      const atTheLimit = unit.repeat(NOTE_LIMIT);
      const pastTheLimit = unit.repeat(NOTE_LIMIT + 1);

      typeIntoTextarea(field(), pastTheLimit);
      await press();
      expect(writesOf(harness.server)).toHaveLength(0);
      expect(field().value).toBe(pastTheLimit);
      expect(notes().textContent).toContain(
        say("counter", { count: NOTE_LIMIT + 1, max: NOTE_LIMIT }),
      );

      typeIntoTextarea(field(), atTheLimit);
      await press();
      expect(writesOf(harness.server)).toHaveLength(1);
      const sent = writesOf(harness.server)[0];
      expect(bodyOf(sent as never)).toEqual({
        text: atTheLimit.normalize("NFC"),
      });
      expect(bytesOf(sent?.init.body)).toBeLessThan(SERVER_BODY_LIMIT_BYTES);
    },
  );

  it("sends a note of 2000 astral characters, the widest the rule allows, inside the body bound", async () => {
    typeIntoTextarea(field(), "\u{1F600}".repeat(NOTE_LIMIT));

    await press();

    const sent = writesOf(harness.server)[0];
    expect(bytesOf(sent?.init.body)).toBe(
      NOTE_LIMIT * 4 + '{"text":""}'.length,
    );
    expect(bytesOf(sent?.init.body)).toBeLessThan(SERVER_BODY_LIMIT_BYTES);
  });

  it("sends a note of 2000 characters that JSON writes in two, still inside the body bound", async () => {
    typeIntoTextarea(field(), '"'.repeat(NOTE_LIMIT));

    await press();

    const sent = writesOf(harness.server)[0];
    expect(bytesOf(sent?.init.body)).toBeLessThan(SERVER_BODY_LIMIT_BYTES);
    expect(allIn(notes(), '[role="alert"]')).toHaveLength(0);
  });

  it("composes 6000 decomposed jamo to 2000 syllables before it counts and before it sends", async () => {
    const typed = "\u1112\u1161\u11AB".repeat(NOTE_LIMIT);

    typeIntoTextarea(field(), typed);
    expect(notes().textContent).toContain(
      say("counter", { count: NOTE_LIMIT, max: NOTE_LIMIT }),
    );
    await press();

    const sent = writesOf(harness.server)[0];
    expect(bodyOf(sent as never)).toEqual({
      text: "\uD55C".repeat(NOTE_LIMIT),
    });
    expect(bytesOf(sent?.init.body)).toBeLessThan(typed.length * 3);
  });
});

describe("an answer to a note that is not a stored note", () => {
  const STORED = {
    id: "n1",
    text: "Am sunat.",
    createdAt: "2026-10-19T11:41:00.000Z",
    author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
  };

  it.each([
    ["no note", {}],
    ["a note with no id", { note: { ...STORED, id: undefined } }],
    ["a note whose author is null", { note: { ...STORED, author: null } }],
    ["a note whose text is a number", { note: { ...STORED, text: 7 } }],
    [
      "a note whose time is not an instant",
      { note: { ...STORED, createdAt: "today" } },
    ],
    ["a list of notes", { note: [STORED] }],
  ])(
    "is told as a note that was not saved after a 201 with %s: the text stays, nothing is listed and nothing is called saved",
    async (_, body) => {
      harness.answers(
        routeKitchen({
          read: () => ({ body: wireKitchen() }),
          note: () => ({ status: 201, body }),
        }),
      );
      harness.unmount();
      await harness.mount();
      typeIntoTextarea(field(), "Am sunat.");

      await press();

      expect(field().value).toBe("Am sunat.");
      expect(allIn(notes(), "li")).toHaveLength(0);
      // The status region is kept mounted, empty: nothing is said in it.
      expect(
        allIn(notes(), '[role="status"]').map(({ textContent }) => textContent),
      ).toEqual([""]);
      expect(requireIn(notes(), '[role="alert"]').textContent).toContain(
        roMessages.staffNotes.errorBody,
      );
    },
  );
});

describe("the text the page sends, judged again by the server", () => {
  it("is already in the form the server would store: composing it once more changes nothing (property)", async () => {
    const { judgeNoteText } = await import("@lemnaria/configurator-domain");
    fc.assert(
      fc.property(typedTexts, (typed) => {
        const first = judgeNoteText(typed);
        if (!first.ok) return;
        const second = judgeNoteText(first.text);
        expect(second).toEqual({ ok: true, text: first.text });
      }),
      { numRuns: 300 },
    );
  });
});
