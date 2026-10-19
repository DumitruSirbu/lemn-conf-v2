// The Romanian copy the owner has NOT approved, held apart from the approved lock (see `draft-romanian-copy.ts`). Three
// things are asserted: every part of `ro.json` is classified exactly once, approved or draft; a draft unit changes only
// with a visible edit to its digest; and the approved lock still describes exactly the approved part, so a draft can
// never pass for approved copy.
import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import {
  canonicalJson,
  currentDraftDigests,
  digestOf,
  DRAFT_ROMANIAN_DIGESTS,
  DRAFT_ROMANIAN_LEAVES,
  DRAFT_ROMANIAN_NAMESPACES,
  DRAFT_ROMANIAN_UNITS,
  valueAtPath,
  withoutDraftCopy,
} from "../support/draft-romanian-copy";

const approvedNamespaces = Object.keys(APPROVED_ROMANIAN_MESSAGES);

describe("every part of the Romanian catalogue is classified exactly once", () => {
  it("splits the top-level namespaces into approved and draft, with none in both and none in neither", () => {
    const catalogueNamespaces = Object.keys(ro);
    const draftNamespaces: readonly string[] = DRAFT_ROMANIAN_NAMESPACES;
    expect(
      approvedNamespaces.filter((name) => draftNamespaces.includes(name)),
    ).toEqual([]);
    expect(
      catalogueNamespaces.filter(
        (name) =>
          !approvedNamespaces.includes(name) && !draftNamespaces.includes(name),
      ),
    ).toEqual([]);
    expect(
      [...approvedNamespaces, ...draftNamespaces].filter(
        (name) => !catalogueNamespaces.includes(name),
      ),
    ).toEqual([]);
  });

  it("lists no namespace twice, and no draft leaf inside a draft namespace", () => {
    expect(new Set(DRAFT_ROMANIAN_NAMESPACES).size).toBe(
      DRAFT_ROMANIAN_NAMESPACES.length,
    );
    expect(new Set(DRAFT_ROMANIAN_LEAVES).size).toBe(
      DRAFT_ROMANIAN_LEAVES.length,
    );
    const draftNamespaces: readonly string[] = DRAFT_ROMANIAN_NAMESPACES;
    for (const leafPath of DRAFT_ROMANIAN_LEAVES) {
      expect(draftNamespaces, leafPath).not.toContain(leafPath.split(".")[0]);
    }
  });

  it.each(DRAFT_ROMANIAN_LEAVES)(
    "draft leaf %s is a real leaf of both catalogues and not in the approved lock",
    (leafPath) => {
      expect(typeof valueAtPath(ro, leafPath)).toBe("string");
      expect(typeof valueAtPath(ru, leafPath)).toBe("string");
      expect(valueAtPath(APPROVED_ROMANIAN_MESSAGES, leafPath)).toBeUndefined();
    },
  );

  it.each(DRAFT_ROMANIAN_NAMESPACES)(
    "draft namespace %s exists in both catalogues, with the same keys, and is not in the approved lock",
    (namespace) => {
      const romanian = valueAtPath(ro, namespace);
      const russian = valueAtPath(ru, namespace);
      expect(typeof romanian).toBe("object");
      expect(Object.keys(russian as object).sort()).toEqual(
        Object.keys(romanian as object).sort(),
      );
      expect(Object.hasOwn(APPROVED_ROMANIAN_MESSAGES, namespace)).toBe(false);
    },
  );
});

describe("the approved lock describes exactly the approved part", () => {
  it("is equal to the catalogue once the draft units are taken out", () => {
    expect(withoutDraftCopy(ro)).toEqual(APPROVED_ROMANIAN_MESSAGES);
  });

  it("holds none of the draft units' wording, leaf for leaf", () => {
    const approvedSentences = new Set(
      JSON.stringify(APPROVED_ROMANIAN_MESSAGES).match(/"(?:[^"\\]|\\.)+"/g),
    );
    for (const unit of DRAFT_ROMANIAN_UNITS) {
      const unitJson = canonicalJson(valueAtPath(ro, unit));
      for (const sentence of unitJson.match(/"(?:[^"\\]|\\.)+"/g) ?? []) {
        if (sentence.length < 40) continue;
        expect(
          approvedSentences.has(sentence),
          `${unit}: ${sentence.slice(0, 60)}`,
        ).toBe(false);
      }
    }
  });
});

describe("withoutDraftCopy", () => {
  it("leaves its input untouched", () => {
    const before = JSON.stringify(ro);
    withoutDraftCopy(ro);
    expect(JSON.stringify(ro)).toBe(before);
  });

  it("takes out a draft leaf from an approved namespace and leaves the namespace's other leaves", () => {
    const projected = withoutDraftCopy(ro) as {
      designLoadError: Record<string, string>;
    };
    expect(Object.hasOwn(projected.designLoadError, "bodyClient")).toBe(false);
    expect(projected.designLoadError.title).toBe(ro.designLoadError.title);
  });

  it("does not pass a catalogue with a namespace nobody classified for the approved lock", () => {
    const withStranger = {
      ...withoutDraftCopy(ro),
      accountSurprise: { title: "new" },
    };
    expect(withStranger).not.toEqual(APPROVED_ROMANIAN_MESSAGES);
  });
});

describe("digests", () => {
  it("do not move when only the authoring order of keys does", () => {
    expect(digestOf({ a: "1", b: { c: "2", d: "3" } })).toBe(
      digestOf({ b: { d: "3", c: "2" }, a: "1" }),
    );
  });

  it("move for a one-character edit and for a removed leaf", () => {
    const base = { a: "Salut", b: "Pa" };
    expect(digestOf({ ...base, a: "Salut!" })).not.toBe(digestOf(base));
    expect(digestOf({ a: "Salut" })).not.toBe(digestOf(base));
  });

  it("are pinned for every unit of unapproved draft copy: an edit is a visible, deliberate change", () => {
    const current = currentDraftDigests(ro);
    const regenerated = `export const DRAFT_ROMANIAN_DIGESTS: Readonly<Record<string, string>> = ${JSON.stringify(current, null, 2)};`;
    expect(
      Object.keys(DRAFT_ROMANIAN_DIGESTS).sort(),
      `Unit list moved. Replace DRAFT_ROMANIAN_DIGESTS with:\n${regenerated}`,
    ).toEqual([...DRAFT_ROMANIAN_UNITS].sort());
    for (const unit of DRAFT_ROMANIAN_UNITS) {
      expect(
        current[unit],
        `Unapproved draft copy "${unit}" changed. If the edit is intended, replace DRAFT_ROMANIAN_DIGESTS with:\n${regenerated}`,
      ).toBe(DRAFT_ROMANIAN_DIGESTS[unit]);
    }
  });
});
