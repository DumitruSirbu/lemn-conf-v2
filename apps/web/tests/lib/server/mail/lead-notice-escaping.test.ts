// What a customer's text can do to the HTML part, judged by a parser rather than by the escape: a value either is
// refused by its line's name, or parses back to exactly itself in its own slot and leaves every element where it was.
import { fc } from "@fast-check/vitest";
import type { ContactFields } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  composeLeadNotice,
  NoticeLineError,
  type NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";

import { ro } from "../../../support/romanian-content";
import {
  designSubmission,
  FIXTURE_PUBLIC_ORIGIN,
  fixtureContact,
  KITCHEN_LINK,
  noticeInput,
} from "./lead-notice-fixtures";
import {
  ownTextOf,
  parseNotice,
  tagSequenceOf,
  type ParsedNotice,
} from "./notice-html-dom-support";

const PROPERTY_SEED = 8_052_026;
const RUNS = 300;

/** What a line may never hold, written here rather than imported, so the oracle is not the code under test. */
const BREAKS_A_LINE = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const MARKUP_PIECES = [
  "<",
  "&",
  '"',
  "'",
  "</td>",
  "<script>",
  "javascript:",
  "{{",
  "&amp;",
  "<!--",
  "]]>",
  "‮",
  "‍",
];

const anyCodePoints = fc.string({ unit: "binary", maxLength: 24 });
const hostileText = fc
  .array(fc.oneof(fc.constantFrom(...MARKUP_PIECES), anyCodePoints), {
    minLength: 1,
    maxLength: 6,
  })
  .map((pieces) => pieces.join(""));

interface Slot {
  readonly field: "name" | "locality" | "email";
  readonly marker: string;
  readonly contactWith: (value: string) => ContactFields;
}

const SLOTS: readonly Slot[] = [
  {
    field: "name",
    marker: "SlotMarkerName",
    contactWith: (name) => ({ ...fixtureContact(), name }),
  },
  {
    field: "locality",
    marker: "SlotMarkerLocality",
    contactWith: (locality) => ({ ...fixtureContact(), locality }),
  },
  {
    field: "email",
    // No `@`, so neither the marker nor a generated value is a mailbox, and no e-mail button comes or goes with it.
    marker: "SlotMarkerEmail",
    contactWith: (email) => ({
      ...fixtureContact({ channel: "email", email: "a@example.md" }),
      email,
    }),
  },
];

function parsedWith(contact: ContactFields): ParsedNotice {
  const message = composeLeadNotice(noticeInput(designSubmission({ contact })));
  return parseNotice(message.html ?? "");
}

function slotIndexesOf(parsed: ParsedNotice, marker: string): number[] {
  return parsed.elements.flatMap((element, index) =>
    ownTextOf(element) === marker ? [index] : [],
  );
}

describe.each(SLOTS)("a generated value in the $field", (slot) => {
  const baseline = parsedWith(slot.contactWith(slot.marker));
  const slots = slotIndexesOf(baseline, slot.marker);
  const values = hostileText.filter(
    (value) => !value.includes("@") && value.trim() !== "",
  );

  it("has a slot of its own in the baseline, so the property reads a real place", () => {
    expect(slots.length).toBeGreaterThanOrEqual(1);
  });

  it("is refused by its line's name, or parses back to itself in its slot with every element where it was", () => {
    let refused = 0;
    let rendered = 0;
    fc.assert(
      fc.property(values, (value) => {
        const contact = slot.contactWith(value);
        let parsed: ParsedNotice;
        try {
          parsed = parsedWith(contact);
        } catch (thrown) {
          expect(thrown).toEqual(new NoticeLineError(slot.field));
          expect(BREAKS_A_LINE.test(value)).toBe(true);
          refused += 1;
          return;
        }
        expect(BREAKS_A_LINE.test(value)).toBe(false);
        expect(tagSequenceOf(parsed)).toEqual(tagSequenceOf(baseline));
        for (const index of slots) {
          const element = parsed.elements[index];
          expect(element === undefined ? undefined : ownTextOf(element)).toBe(
            value,
          );
        }
        rendered += 1;
      }),
      { numRuns: RUNS, seed: PROPERTY_SEED },
    );

    expect(rendered).toBeGreaterThanOrEqual(RUNS / 4);
    expect(refused).toBeGreaterThanOrEqual(1);
  });
});

describe("the hidden preheader", () => {
  it("parses back to the preheader's own words around a generated name and locality", () => {
    const values = hostileText.filter(
      (value) => !BREAKS_A_LINE.test(value) && value.trim() !== "",
    );
    fc.assert(
      fc.property(values, values, (name, locality) => {
        const contact = { ...fixtureContact(), name, locality };

        const { document } = parsedWith(contact);

        expect(document.body.firstElementChild?.textContent).toBe(
          ro.leadNotice.preheader({
            lead: ro.leadNotice.kitchen.button,
            name,
            locality,
          }),
        );
      }),
      { numRuns: RUNS / 3, seed: PROPERTY_SEED },
    );
  });
});

/** The four shapes, written here as the plan states them rather than imported from the template. */
const CALL = /^tel:\+[0-9]+$/;
const WHATSAPP = /^https:\/\/wa\.me\/[0-9]+$/;
const MAILTO = /^mailto:[^?&#@\s]+@example\.md$/;
const KITCHEN = /^https?:\/\/[^/?#@]+\/ro\/s\/[0-9A-Za-z]{12}$/;

const LOCAL_PART_CHARACTERS = Array.from("abcXYZ0189!#$%&'*+/=?^_`{|}~-");
const localPart = fc
  .array(fc.constantFrom(...LOCAL_PART_CHARACTERS), {
    minLength: 1,
    maxLength: 20,
  })
  .map((characters) => characters.join(""));

const TOKEN_CHARACTERS = Array.from(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
);
const token = fc
  .array(fc.constantFrom(...TOKEN_CHARACTERS), { minLength: 12, maxLength: 12 })
  .map((characters) => characters.join(""));
const origin = fc.constantFrom(
  "https://example.invalid",
  "https://configurator.lemnaria.example",
  "https://attacker.example",
  "http://localhost:4320",
  "http://127.0.0.1:3000",
);

/** A link as handed in, the origin the attempt read, and whether the notice may show the link. */
interface HandedInLink {
  readonly link: NoticeKitchenLink;
  readonly publicOrigin: PublicOriginOutcome;
  readonly isShown: boolean;
  readonly isForeign: boolean;
}

function configured(base: string): PublicOriginOutcome {
  return { status: "configured", origin: base };
}

const validLink = fc.tuple(origin, token).map(
  ([base, value]): HandedInLink => ({
    link: { kind: "link", url: `${base}/ro/s/${value}` },
    publicOrigin: configured(base),
    isShown: true,
    isForeign: false,
  }),
);
/** Well formed, but under an origin other than the one configured for the attempt. */
const foreignLink = fc
  .tuple(origin, origin, token)
  .filter(([configuredBase, linkBase]) => configuredBase !== linkBase)
  .map(
    ([configuredBase, linkBase, value]): HandedInLink => ({
      link: { kind: "link", url: `${linkBase}/ro/s/${value}` },
      publicOrigin: configured(configuredBase),
      isShown: false,
      isForeign: true,
    }),
  );
const HOSTILE_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "https://example.invalid/ro/s/Fixture0Tok1?next=javascript:x",
  'https://example.invalid/ro/s/Fixture0Tok1" onclick="x',
  "https://u@example.invalid/ro/s/Fixture0Tok1",
  "//example.invalid/ro/s/Fixture0Tok1",
  "https://example.invalid/ro/s/Fixture0Tok",
];
const hostileLink = fc.constantFrom(...HOSTILE_URLS).map(
  (url): HandedInLink => ({
    link: { kind: "link", url },
    publicOrigin: FIXTURE_PUBLIC_ORIGIN,
    isShown: false,
    isForeign: false,
  }),
);
const unavailable = fc.constant<HandedInLink>({
  link: { kind: "unavailable" },
  publicOrigin: FIXTURE_PUBLIC_ORIGIN,
  isShown: false,
  isForeign: false,
});

const generatedRequest = fc.record({
  channel: fc.constantFrom<ContactFields["channel"]>(
    "phone",
    "whatsapp",
    "email",
  ),
  local: localPart,
  handedIn: fc.oneof(validLink, foreignLink, hostileLink, unavailable),
  name: hostileText.filter((value) => !BREAKS_A_LINE.test(value)),
});

describe("every href in the HTML part", () => {
  it("matches exactly one of the four shapes, the kitchen link only as handed in and under the origin configured for it, e-mail only for its channel", () => {
    const seen = {
      kitchen: 0,
      call: 0,
      whatsapp: 0,
      mailto: 0,
      refusedLink: 0,
      foreignLink: 0,
    };
    fc.assert(
      fc.property(generatedRequest, ({ channel, local, handedIn, name }) => {
        const { link, publicOrigin, isShown, isForeign } = handedIn;
        const email = `${local}@example.md`;
        const contact = {
          ...fixtureContact(
            channel === "email"
              ? { channel, email: "a@example.md" }
              : { channel },
          ),
          name,
          email: channel === "email" ? email : undefined,
        };
        const message = composeLeadNotice({
          ...noticeInput(designSubmission({ contact }), link),
          publicOrigin,
        });

        const hrefs = [
          ...parseNotice(message.html ?? "").document.querySelectorAll("a"),
        ].map((anchor) => anchor.getAttribute("href") ?? "");

        for (const href of hrefs) {
          const shapes = [CALL, WHATSAPP, MAILTO, KITCHEN].filter((shape) =>
            shape.test(href),
          );
          expect(shapes).toHaveLength(1);
        }
        const kitchenHrefs = hrefs.filter((href) => KITCHEN.test(href));
        expect(kitchenHrefs).toEqual(
          isShown && link.kind === "link" ? [link.url] : [],
        );
        expect(hrefs.filter((href) => CALL.test(href))).toHaveLength(1);
        expect(hrefs.filter((href) => WHATSAPP.test(href))).toHaveLength(
          channel === "whatsapp" ? 1 : 0,
        );
        const mailtos = hrefs.filter((href) => href.startsWith("mailto:"));
        expect(mailtos).toHaveLength(channel === "email" ? 1 : 0);
        for (const mailto of mailtos) {
          expect(mailto).toMatch(MAILTO);
          expect(mailto).not.toMatch(/%0[ad]/i);
          expect(decodeURIComponent(mailto.slice("mailto:".length))).toBe(
            email,
          );
        }
        seen.kitchen += kitchenHrefs.length;
        seen.call += 1;
        seen.whatsapp += channel === "whatsapp" ? 1 : 0;
        seen.mailto += mailtos.length;
        seen.refusedLink += link.kind === "link" && !isShown ? 1 : 0;
        seen.foreignLink += isForeign ? 1 : 0;
      }),
      { numRuns: RUNS, seed: PROPERTY_SEED },
    );

    for (const count of Object.values(seen))
      expect(count).toBeGreaterThanOrEqual(20);
  });

  it("is the kitchen link's own text, so a refused link shows the unavailable sentence and no button", () => {
    for (const url of HOSTILE_URLS) {
      const message = composeLeadNotice(
        noticeInput(designSubmission(), { kind: "link", url }),
      );

      expect(message.html).toContain(ro.leadNotice.kitchen.unavailable);
      expect(message.html).not.toContain(ro.leadNotice.kitchen.button);
      expect(message.text.split("\n")[0]).toBe(
        ro.leadNotice.kitchen.unavailable,
      );
    }
  });

  it("holds the minted link the composer was handed, for the fixture link", () => {
    const hrefs = [
      ...parseNotice(
        composeLeadNotice(noticeInput(designSubmission(), KITCHEN_LINK)).html ??
          "",
      ).document.querySelectorAll("a"),
    ].map((anchor) => anchor.getAttribute("href"));

    expect(hrefs[0]).toBe(KITCHEN_LINK.kind === "link" ? KITCHEN_LINK.url : "");
  });
});
