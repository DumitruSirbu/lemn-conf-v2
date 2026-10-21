// @vitest-environment happy-dom
//
// What a client or a colleague typed, drawn by the staff kitchen page (wave L3-U3), in Romanian and Russian: markup, a script, a
// right-to-left override, a joined emoji, message syntax, ten thousand characters, a line break and a NUL. Each lands in every
// place the page prints a typed string (the title, the sender under it, the client's profile, the request's reference, the
// colleague who last changed the status). The promises: it is text and only text, it is printed exactly as typed (message
// syntax is not interpreted a second time), and it adds no element, no attribute and no address to the page: the page of a
// hostile kitchen has the shape of the page of a plain one.
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { allIn, requireIn, type TestLocale } from "../support/render-with-intl";
import { wireChangedStatus, wireKitchen } from "../support/staff-kitchen-wire";

import {
  PAGE,
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

const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const SENT_AT = "2026-10-17T11:08:00.000Z";
const PLAIN = "Plain text";

const PAYLOADS: readonly (readonly [string, string])[] = [
  ["a script element", "<script>globalThis.pwned=1</script>"],
  ["an image with a handler", '<img src=x onerror="globalThis.pwned=1">'],
  ["an anchor to a script", '<a href="javascript:globalThis.pwned=1">go</a>'],
  ["a svg with a handler", "<svg onload=globalThis.pwned=1></svg>"],
  ["an entity", "&lt;b&gt; &amp; &#60;"],
  ["a right-to-left override and an isolate left open", "\u202Eevil\u2066"],
  ["a joined emoji", "\u{1F469}\u200D\u{1F4BB} \u{1F3F3}️\u200D\u{1F308}"],
  ["message syntax", "{count, plural, one {# kitchen} other {# kitchens}}"],
  ["a message argument", "{email} {date} {when} {name} {reference}"],
  ["an unbalanced brace", "{"],
  ["quotes that message syntax reads", "it's '{x}' ''"],
  ["a placeholder of another syntax", "%s %1$s ${x} {{x}} <%= x %>"],
  ["ten thousand characters", "N".repeat(10_000)],
  ["a line break", "line one\nline two\r\nline three"],
  ["a NUL and a tab", "a\u0000b\tc"],
  ["a telephone address", "tel:+37378900555"],
  ["a mail address", "mailto:someone@else.md?subject=x"],
];

let harness: ScreenHarness;

beforeEach(() => {
  harness = setUpScreenHarness();
  Reflect.deleteProperty(globalThis, "pwned");
  document.title = "unchanged";
});

afterEach(() => {
  harness.tearDown();
});

const FIRST_STRONG_ISOLATE = "\u2068";
const POP_DIRECTIONAL_ISOLATE = "\u2069";
const RIGHT_TO_LEFT_OVERRIDE = "\u202E";

/** The characters that reorder or isolate the text around them. A typed part of a sentence is shown without them, between
 *  isolate marks of the page's own, so a closing mark inside it cannot end the fence early. */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

function withoutBidiControls(text: string): string {
  return text.replace(BIDI_CONTROLS, "");
}

/** The marks that fence a typed part of a sentence from its neighbours; a page may add them, and the words stay the same. */
function withoutIsolates(text: string): string {
  return text
    .replaceAll(FIRST_STRONG_ISOLATE, "")
    .replaceAll(POP_DIRECTIONAL_ISOLATE, "");
}

function typedEverywhere(typed: string): Record<string, unknown> {
  return wireKitchen({
    kitchen: { name: typed },
    client: { email: typed, name: typed, phone: typed },
    request: { reference: typed, sentAt: SENT_AT },
    status: wireChangedStatus("contacted", { email: typed, name: typed }),
  });
}

/** The tags, the names of the attributes and the addresses of a page: what a string that became markup would change. */
function shapeOf(root: ParentNode): {
  readonly elements: string[];
  readonly attributes: string[];
  readonly addresses: string[];
  readonly attributeValues: string[];
} {
  const everything = allIn(root as HTMLElement, "*");
  return {
    elements: everything.map((element) => element.tagName),
    attributes: everything.flatMap((element) =>
      element.getAttributeNames().map((name) => `${element.tagName}.${name}`),
    ),
    attributeValues: everything.flatMap((element) =>
      element
        .getAttributeNames()
        .map((name) => element.getAttribute(name) ?? ""),
    ),
    addresses: everything.flatMap((element) =>
      ["href", "src", "srcset", "action", "formaction", "data"].flatMap(
        (name) => {
          const value = element.getAttribute(name);
          return value === null ? [] : [value];
        },
      ),
    ),
  };
}

describe.each(LOCALES)(
  "a hostile string in every place it is printed, in %s",
  (locale) => {
    const lists = CATALOGUES[locale].staffKitchens;
    const say = createTranslator({
      locale,
      messages: CATALOGUES[locale] as typeof roMessages,
      namespace: "staffKitchen",
    });

    async function draw(typed: string): Promise<HTMLElement> {
      harness.answers(() => ({ body: typedEverywhere(typed) }));
      await harness.mount({ locale });
      return requireIn(harness.container(), PAGE);
    }

    async function shapeWhenTypedIs(typed: string) {
      const page = await draw(typed);
      const shape = shapeOf(harness.container());
      expect(page.querySelector("h1")).not.toBeNull();
      harness.unmount();
      return shape;
    }

    it.each(PAYLOADS)(
      "%s is text, printed as typed, and changes nothing of the page's shape",
      async (_, typed) => {
        const plainShape = await shapeWhenTypedIs(PLAIN);

        const page = await draw(typed);
        const shape = shapeOf(harness.container());

        expect(shape.elements).toEqual(plainShape.elements);
        expect(shape.attributes).toEqual(plainShape.attributes);
        expect(shape.addresses).toEqual(plainShape.addresses);
        expect(
          shape.attributeValues.filter((value) => value.includes(typed)),
        ).toEqual([]);
        expect((globalThis as { pwned?: unknown }).pwned).toBeUndefined();
        expect(document.title).toBe("unchanged");
        expect(requireIn(page, "h1").textContent).toBe(typed);
        const facts = allIn(page, "dd").map((fact) => fact.textContent);
        expect(
          facts.filter((fact) => fact.startsWith(typed)).length,
        ).toBeGreaterThanOrEqual(3);
      },
    );

    it.each(PAYLOADS)(
      "%s survives the sentences that carry it unchanged by message syntax",
      async (_, typed) => {
        const page = await draw(typed);
        const when = new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "Europe/Chisinau",
        });

        expect(withoutIsolates(requireIn(page, "header p").textContent)).toBe(
          say("subSent", {
            email: withoutBidiControls(typed),
            date: "17.10.2026",
          }),
        );
        expect(
          withoutIsolates(
            requireIn(page, '[data-testid="staff-kitchen-request"]')
              .textContent,
          ),
        ).toContain(
          say("requestLine", {
            reference: typed,
            date: when.format(new Date(SENT_AT)),
          }),
        );
        expect(
          withoutIsolates(
            requireIn(page, '[data-testid="staff-kitchen-last-change"]')
              .textContent,
          ),
        ).toBe(
          say("statusLastChange", {
            name: withoutBidiControls(typed),
            when: when.format(new Date("2026-10-18T11:22:00.000Z")),
          }),
        );
        expect(
          requireIn(page, '[data-testid="staff-kitchen-profile"]').textContent,
        ).toContain(lists.phoneUnverified);
      },
    );

    it("makes no link to call or to write of a phone and an address typed to look like one", async () => {
      const page = await draw("tel:+37378900555 mailto:a@b.md");

      expect(
        allIn(harness.container(), "a[href^='tel:' i], a[href^='mailto:' i]"),
      ).toHaveLength(0);
      expect(allIn(page, "a")).toHaveLength(1);
      expect(allIn(page, "button")).not.toHaveLength(0);
    });
  },
);

// The stylesheet says that a string somebody typed "is isolated from the text around it so a right-to-left run cannot reorder
// its neighbours" (`staff-kitchen.module.css`, head). A paragraph isolated as a whole does not do that for the typed part of
// the sentence inside it: an override left open in a colleague's name turns the minute that follows it around. The typed part
// is fenced when the text carries it between isolate marks, or draws it in an element of its own that isolates it.
describe.each(LOCALES)(
  "a right-to-left override left open inside a sentence, in %s",
  (locale) => {
    async function drawTyped(typed: string): Promise<HTMLElement> {
      harness.answers(() => ({ body: typedEverywhere(typed) }));
      await harness.mount({ locale });
      return requireIn(harness.container(), PAGE);
    }

    function isFenced(box: Element, typedValue: string): boolean {
      const typed = withoutBidiControls(typedValue);
      const text = box.textContent;
      const fencedInText = text.includes(
        `${FIRST_STRONG_ISOLATE}${typed}${POP_DIRECTIONAL_ISOLATE}`,
      );
      const inItsOwnElement = allIn(
        box as HTMLElement,
        "bdi, [dir='auto'], [dir='ltr'], [dir='rtl']",
      ).some((element) => element.textContent === typed);
      return fencedInText || inItsOwnElement;
    }

    const TYPED = `${RIGHT_TO_LEFT_OVERRIDE}evil`;

    it("is fenced in the line under the title, where a sender's address stands beside the day", async () => {
      const page = await drawTyped(TYPED);

      expect(isFenced(requireIn(page, "header p"), TYPED)).toBe(true);
    });

    it("is fenced in the line that names who changed the status, beside the minute", async () => {
      const page = await drawTyped(TYPED);

      expect(
        isFenced(
          requireIn(page, '[data-testid="staff-kitchen-last-change"]'),
          TYPED,
        ),
      ).toBe(true);
    });
  },
);
