// **Adversarial QA — wave 7F1, the copy obligation (ADR 0113) and the conversions' real reach**
// (criteria 7, 8 and 16).
//
// **The copy half.** 26 leaves were added under `room.*`. The lock proves the wording is the
// approved wording; it cannot prove the wording is *used*, and an unconsumed leaf is a sentence
// nobody ever reads that the lock will keep alive forever. The wave also made two deliberate
// absences — the step pill and the two group labels — and a later editor who "completes" the
// namespace by adding `room.step` would pin one owner-approved sentence in the lock twice, which is
// the scar ruling R7 exists to avoid.
//
// **The conversions half.** `metres-text.test.ts` sweeps the **approved policy's** ranges. Neither
// conversion is confined to them: the refill (`room-query-sync.ts`'s `withLengthFromQuery`) runs on
// whatever the URL holds, and it accepts any length `parse-metres.ts` accepts. So the round trip is
// swept over the range the parser actually admits, not the range the policy approves — the gap
// between the two is where a stale link or a customer typing past the maximum lands. Since wave 7F2
// S1b (ADR 0126) the field shows whole millimetres, so what is swept is the wire's metres coming back
// as the field's digits; the metre display formatter this half once swept is gone.
import { fc } from "@fast-check/vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { metresTextForUrl } from "@/room/metres-text";
import { parseMetresToMillimetres } from "@/room/parse-metres";
import { parseMillimetres } from "@/room/parse-millimetres";
import { roomDraftFromQuery } from "@/room/room-query-sync";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { catalogueLeaves, type Catalogue } from "../support/catalogues";

const SWEEP_RUNS = 2000;

/** Far past any room and still a length the parser accepts, which is the point: the conversions have
 *  no bound of their own and a test confined to the policy's would not say so. */
const A_LENGTH_NO_ROOM_REACHES_MM = 9_000_000;

/** Every module the room screen is built from, as `[name, source]`. */
const ROOM_MODULE_SOURCES: readonly (readonly [string, string])[] = (() => {
  const directory = resolve(import.meta.dirname, "../../src/room");
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map(
      (entry) =>
        [entry, readFileSync(resolve(directory, entry), "utf8")] as const,
    );
})();

const ALL_ROOM_SOURCE = ROOM_MODULE_SOURCES.map(([, source]) => source).join(
  "\n",
);

/** The dotted keys the wave added, read out of the shipped catalogue rather than listed by hand: a
 *  leaf added later is covered by the claims below without anybody remembering to add it. */
const ROOM_KEYS: readonly string[] = catalogueLeaves(roMessages)
  .map(([key]) => key)
  .filter((key) => key.startsWith("room."));

describe("every leaf the wave added is a leaf the screen reads (ADR 0113)", () => {
  it("added the namespace this file is about, so the claims below are not vacuous", () => {
    // 26 from wave 7F1's frames 1A and 1B, wave 7F4a's 20 under `room.compose.*` for 1F, wave
    // 7F4b's 2 for the hand-off that 1F's footer now performs, and wave 7A3's 8 — the hint above the
    // wall fields, each wall's help name and explanation, and wall A's second explanation for a room
    // with a corner. Wave 7D5b's 1 is 1F's sixth row, `room.compose.dishwasher` (ADR 0110
    // Amendment M3). Wave 7F2 S1's 11 are frame 1C's: six reasons, one per reachable issue code, the
    // unreadable-length reason (Q-7F2-4), the linear suggestion wired off until 7J, the plan wall's two
    // short labels, and the note. Wave 7F2 S1b (ADR 0126) swaps one for one: `room.unitMetres` is
    // removed and `room.unitMillimetres` added, so the count does not move. Wave 7J S4's 1 is
    // `room.compose.roomSummaryLinear` (ADR 0130 D10): a straight room's own 1F summary, drafted
    // rather than approved because no frame draws it. Wave 7L S3's 2 are D1C's *Sugestii* card,
    // `room.suggestion.title` and `room.suggestion.switchToLinear` — the desktop-only actionable
    // suggestion the milestone's own criterion asks for. Wave U5 S1's 1 is
    // `room.compose.roomSummaryU`: a U's own 1F summary, drafted, the third length of `roomSummary`.
    expect(ROOM_KEYS.length).toBe(72);
  });

  it.each(ROOM_KEYS)("reads %s somewhere under src/room", (key) => {
    // A key is spelled in full in the source — `room-screen.tsx` and `shape-picker.tsx` both say why
    // a built key would defeat next-intl's generated declaration — so the whole directory's text is
    // the right place to look for it.
    expect(ALL_ROOM_SOURCE).toContain(`"${key}"`);
  });

  it("gives the Russian draft exactly the same key set", () => {
    const russianRoomKeys = catalogueLeaves(ruMessages as Catalogue)
      .map(([key]) => key)
      .filter((key) => key.startsWith("room."));

    expect(russianRoomKeys).toEqual(ROOM_KEYS);
  });
});

describe("no owner-approved sentence is pinned twice (ruling R7)", () => {
  it("adds no room-scoped copy of the step pill", () => {
    // R7's mechanism: the room renders `configure.step` and `configure.stepPill` at `step: 1`. A
    // `room.step` leaf would be the same approved sentence entered in the lock a second time, and
    // the two copies would drift the first time one of them is edited.
    expect(ROOM_KEYS).not.toContain("room.step");
    expect(ROOM_KEYS).not.toContain("room.stepPill");
    expect(ALL_ROOM_SOURCE).toContain('translate("configure.step"');
    expect(ALL_ROOM_SOURCE).toContain('translate("configure.stepPill"');
  });

  it("invents no accessible name for either group", () => {
    // The copy obligation's second and third deliberate absences. Both radiogroups are named by the
    // visible heading through `aria-labelledby`, and the plan drawing is `aria-hidden` with its
    // measurements beside it as real text.
    expect(ROOM_KEYS).not.toContain("room.shapeGroupLabel");
    expect(ROOM_KEYS).not.toContain("room.cornerGroupLabel");
    expect(ROOM_KEYS).not.toContain("room.planAlt");
    expect(ALL_ROOM_SOURCE).toContain("aria-labelledby");
  });

  it("hands no accessible name to an element as a literal", () => {
    // The unkeyed-name half of the lint gate, asserted as a claim about the directory rather than
    // about the rule: every `aria-label` in the room comes out of the catalogue.
    for (const [name, source] of ROOM_MODULE_SOURCES) {
      expect(source, `${name} names an element with a bare string`).not.toMatch(
        /aria-label=["'][^"']/,
      );
    }
  });
});

/** What a wall field shows once the wire's `wallA` has been read back into it. */
function refilledWallA(wire: string): string {
  return roomDraftFromQuery("L", { shape: "L", wallA: wire }).lengths.wallA
    .text;
}

describe("the conversions hold past the approved policy's ranges (criteria 7 and 8)", () => {
  it("refills a field that reads back to the exact millimetre, for every length the parser admits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: A_LENGTH_NO_ROOM_REACHES_MM }),
        (mm) => {
          const shown = refilledWallA(metresTextForUrl(mm));

          expect(shown).toBe(String(mm));
          expect(parseMillimetres(shown)).toEqual({ ok: true, mm });
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps the wire form free of a comma at every one of those lengths", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: A_LENGTH_NO_ROOM_REACHES_MM }),
        (mm) => {
          const text = metresTextForUrl(mm);

          expect(text).not.toContain(",");
          expect(parseMetresToMillimetres(text)).toEqual({ ok: true, mm });
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it.each([
    [1, "0.001", "1"],
    [10, "0.01", "10"],
    [100, "0.1", "100"],
    [999, "0.999", "999"],
    [1000, "1", "1000"],
    [1001, "1.001", "1001"],
    [1010, "1.01", "1010"],
    [1100, "1.1", "1100"],
  ] as const)(
    "carries %i mm as %s on the wire and shows it as %s, where the pad and the strip meet",
    (mm, wire, shown) => {
      // The transitions the wire's trailing-zero strip and three-digit pad share a boundary at. Every
      // one of these is a millimetre apart from a value that is written differently.
      expect(metresTextForUrl(mm)).toBe(wire);
      expect(refilledWallA(wire)).toBe(shown);
    },
  );
});

describe("the room builds against no figure taken off the mockup (criterion 16)", () => {
  it("carries none of frame 1B's three example dimensions as a literal", () => {
    // The lint gate is the mechanism; this is the claim itself, measured over the shipped directory
    // with the prose stripped out, so a `eslint-disable` added later would fail here too.
    for (const [name, source] of ROOM_MODULE_SOURCES) {
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      for (const figure of ["3600", "2400", "2600"]) {
        expect(code, `${name} builds against ${figure}`).not.toMatch(
          new RegExp(`(?<![\\d.])${figure}(?![\\d])`, "u"),
        );
      }
      expect(code, `${name} suppresses the gate`).not.toContain(
        "eslint-disable",
      );
    }
  });
});
