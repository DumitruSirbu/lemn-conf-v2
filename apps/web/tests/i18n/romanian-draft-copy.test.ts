// The Romanian copy the owner has NOT approved (Lot 1 of the account screens), held apart from the approved lock (see
// `draft-romanian-copy.ts`). Three things are asserted: every part of `ro.json` is classified exactly once, approved or
// draft; a draft namespace changes only with a visible edit to its digest; and the approved lock still describes exactly
// the approved part, so a draft can never pass for approved copy.
import { describe, expect, it } from "vitest";

import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import {
  APPROVED_PATHS_IN_DRAFT_NAMESPACES,
  canonicalJson,
  currentDraftDigests,
  digestOf,
  DRAFT_ROMANIAN_DIGESTS,
  DRAFT_ROMANIAN_NAMESPACES,
  draftPartOf,
  leafNameOf,
  namespaceOf,
  valueAtPath,
  withoutDraftCopy,
} from "../support/draft-romanian-copy";

const approvedNamespaces = Object.keys(APPROVED_ROMANIAN_MESSAGES);
const draftNamespaces: readonly string[] = DRAFT_ROMANIAN_NAMESPACES;
const namespacesWithApprovedPaths = new Set(
  APPROVED_PATHS_IN_DRAFT_NAMESPACES.map(namespaceOf),
);

function approvedLeavesIn(namespace: string): string[] {
  return APPROVED_PATHS_IN_DRAFT_NAMESPACES.filter(
    (path) => namespaceOf(path) === namespace,
  ).map(leafNameOf);
}

describe("every part of the Romanian catalogue is classified exactly once", () => {
  it("splits the top-level namespaces into approved and draft, sharing only those that hold approved paths inside a draft namespace", () => {
    const catalogueNamespaces = Object.keys(ro);
    expect(
      approvedNamespaces.filter((name) => draftNamespaces.includes(name)),
    ).toEqual(
      draftNamespaces.filter((name) => namespacesWithApprovedPaths.has(name)),
    );
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

  it("lists no namespace and no approved path twice, and every approved path inside a draft namespace", () => {
    expect(new Set(DRAFT_ROMANIAN_NAMESPACES).size).toBe(
      DRAFT_ROMANIAN_NAMESPACES.length,
    );
    expect(new Set(APPROVED_PATHS_IN_DRAFT_NAMESPACES).size).toBe(
      APPROVED_PATHS_IN_DRAFT_NAMESPACES.length,
    );
    for (const path of APPROVED_PATHS_IN_DRAFT_NAMESPACES) {
      expect(leafNameOf(path), path).not.toContain(".");
      expect(draftNamespaces, path).toContain(namespaceOf(path));
    }
  });

  it.each(APPROVED_PATHS_IN_DRAFT_NAMESPACES)(
    "approved path %s is in both catalogues and the lock with the catalogue's wording, and is not in the draft part",
    (path) => {
      expect(valueAtPath(ro, path)).toBeDefined();
      expect(valueAtPath(ru, path)).toBeDefined();
      expect(valueAtPath(APPROVED_ROMANIAN_MESSAGES, path)).toEqual(
        valueAtPath(ro, path),
      );
      expect(
        Object.hasOwn(
          draftPartOf(ro, namespaceOf(path)) as object,
          leafNameOf(path),
        ),
      ).toBe(false);
    },
  );

  it.each(DRAFT_ROMANIAN_NAMESPACES)(
    "draft namespace %s exists in both catalogues with the same keys, and the lock holds none of it but its approved paths",
    (namespace) => {
      const romanian = valueAtPath(ro, namespace);
      const russian = valueAtPath(ru, namespace);
      expect(typeof romanian).toBe("object");
      expect(Object.keys(russian as object).sort()).toEqual(
        Object.keys(romanian as object).sort(),
      );
      const lockedKeys = Object.keys(
        (APPROVED_ROMANIAN_MESSAGES as Record<string, unknown>)[namespace] ??
          {},
      );
      expect(lockedKeys.sort()).toEqual(approvedLeavesIn(namespace).sort());
    },
  );
});

describe("the approved lock describes exactly the approved part", () => {
  it("is equal to the catalogue once the draft parts are taken out", () => {
    expect(withoutDraftCopy(ro)).toEqual(APPROVED_ROMANIAN_MESSAGES);
  });

  it("holds none of the draft namespaces' wording, leaf for leaf", () => {
    const approvedSentences = new Set(
      JSON.stringify(APPROVED_ROMANIAN_MESSAGES).match(/"(?:[^"\\]|\\.)+"/g),
    );
    // A draft leaf may say the very same sentence as an approved path (`accountFieldErrors.emailForbiddenCharacter` and
    // `.addressForbiddenCharacter` both read "Adresa conține caractere care nu sunt permise."): that is two leaves
    // agreeing, not a draft leaf pasted into the lock, which the equality test above catches by key.
    const sentencesOfApprovedPaths = new Set(
      APPROVED_PATHS_IN_DRAFT_NAMESPACES.flatMap(
        (path) =>
          canonicalJson(valueAtPath(ro, path)).match(/"(?:[^"\\]|\\.)+"/g) ??
          [],
      ),
    );
    for (const namespace of DRAFT_ROMANIAN_NAMESPACES) {
      const draftJson = canonicalJson(draftPartOf(ro, namespace));
      for (const sentence of draftJson.match(/"(?:[^"\\]|\\.)+"/g) ?? []) {
        if (sentence.length < 40 || sentencesOfApprovedPaths.has(sentence)) {
          continue;
        }
        expect(
          approvedSentences.has(sentence),
          `${namespace}: ${sentence.slice(0, 60)}`,
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

  it("keeps a draft namespace's approved leaves and takes out the rest of it", () => {
    const projected = withoutDraftCopy(ro) as {
      accountForm: Record<string, string>;
    };
    expect(projected.accountForm).toEqual({
      rateLimitedCountdown: ro.accountForm.rateLimitedCountdown,
      rateLimitedReady: ro.accountForm.rateLimitedReady,
    });
    expect(Object.hasOwn(projected.accountForm, "emailLabel")).toBe(false);
  });

  it("takes out a draft namespace that holds no approved path altogether", () => {
    expect(Object.hasOwn(withoutDraftCopy(ro), "accountRegister")).toBe(false);
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

  it("are pinned for every draft namespace: an edit is a visible, deliberate change", () => {
    const current = currentDraftDigests(ro);
    const regenerated = `export const DRAFT_ROMANIAN_DIGESTS: Readonly<Record<string, string>> = ${JSON.stringify(current, null, 2)};`;
    expect(
      Object.keys(DRAFT_ROMANIAN_DIGESTS).sort(),
      `Namespace list moved. Replace DRAFT_ROMANIAN_DIGESTS with:\n${regenerated}`,
    ).toEqual([...DRAFT_ROMANIAN_NAMESPACES].sort());
    for (const namespace of DRAFT_ROMANIAN_NAMESPACES) {
      expect(
        current[namespace],
        `Unapproved draft copy "${namespace}" changed. If the edit is intended, replace DRAFT_ROMANIAN_DIGESTS with:\n${regenerated}`,
      ).toBe(DRAFT_ROMANIAN_DIGESTS[namespace]);
    }
  });

  it("do not move when an approved path of a mixed namespace is edited, and do move when its draft part is", () => {
    const edited = structuredClone(ro) as {
      accountForm: Record<string, string>;
    };
    edited.accountForm.rateLimitedReady = "edited approved leaf";
    expect(digestOf(draftPartOf(edited, "accountForm"))).toBe(
      DRAFT_ROMANIAN_DIGESTS.accountForm,
    );
    edited.accountForm.emailLabel = "edited draft leaf";
    expect(digestOf(draftPartOf(edited, "accountForm"))).not.toBe(
      DRAFT_ROMANIAN_DIGESTS.accountForm,
    );
  });
});
