import { createHash } from "node:crypto";

// **OWNER-UNAPPROVED DRAFT Romanian copy, tracked apart from the approved lock.**
//
// `approved-romanian-messages.ts` is the corpus the owner agreed to, and `romanian-copy-lock.test.ts` holds `ro.json`'s
// approved part to it leaf for leaf. The account screens' wording (Lot 1 and Lot 2) was written by an agent from the
// mockups and is not approved: Lot 2's is open owner question O13 (Lot 2 plan section 9, "Approve Lot 2's Romanian copy
// ... the copy lock; milestone close") and Lot 1's is O1 of `M8B-account-screens-lot1-review.md` ("Approve the Lot 1
// Romanian copy ... the copy lock; milestone close"). The dispatch that asked for this manifest also names O27, which no
// document in the repository carries. Pasting the wording into the approved lock would record "a person agreed to this" for
// words nobody has read, and the lock's whole value is that claim. Leaving it out altogether left the lock red (the
// catalogue grew twenty-two namespaces the lock knew nothing of), which hides every real change behind a standing failure.
//
// **This departs from the written precedent.** `M8B-account-screens-lot1-review.md` section 3.4 and its risk table say to
// register unapproved leaves in the lock itself, as M8C did, marked in a comment as drafted. The M8C leaves inside approved
// namespaces are still carried that way. For whole new namespaces this manifest was asked for instead; which convention the
// project keeps is the owner's and the scribe's to settle.
//
// So each unit of draft copy is named here, **explicitly** (a namespace the catalogue gains is never classified for you:
// `romanian-draft-copy.test.ts` fails until it is listed as approved or as draft), and pinned by a SHA-256 digest of its
// canonical JSON. A digest is deliberately not a second corpus: it cannot be read as approved wording, it goes red on any
// edit to the unit, and its failure message prints the new digests ready to paste.
//
// **Regenerating after an edit to draft copy** (the only command): run
//   pnpm --filter @lemnaria/web exec vitest run tests/i18n/romanian-draft-copy.test.ts
// and replace `DRAFT_ROMANIAN_DIGESTS` with the block the failure prints. Review which keys moved: an edit to one
// namespace must move one digest.
//
// **Promoting a unit** when the owner approves it: delete it from `DRAFT_ROMANIAN_NAMESPACES` (or `_LEAVES`) and from
// `DRAFT_ROMANIAN_DIGESTS`, and paste its wording into `APPROVED_ROMANIAN_MESSAGES` in the same commit, with the date and
// the form the approval was relayed in.

/** Top-level namespaces whose Romanian wording is a draft. */
export const DRAFT_ROMANIAN_NAMESPACES = [
  "accountMail",
  "accountForm",
  "accountFieldErrors",
  "accountShell",
  "accountForgot",
  "accountRegister",
  "accountCheckInbox",
  "accountLogin",
  "accountVerify",
  "accountReset",
  "accountNotFound",
  "accountForbidden",
  "accountControl",
  "logoutEverywhere",
  "sessionExpiredSheet",
  "claimDialog",
  "accountKitchens",
  "accountProfile",
  "accountPassword",
  "accountEmailChange",
  "accountExport",
  "privacyNotice",
] as const;

/**
 * Draft leaves that stand inside a namespace whose other leaves are approved. `designLoadError.bodyClient` is the
 * sentence a signed-in client reads in place of the reason (Lot 2 U9b; the leaf first appears in commit 8a066f7d); no ADR,
 * plan section or commit message was found that records an owner approval of it.
 */
export const DRAFT_ROMANIAN_LEAVES = ["designLoadError.bodyClient"] as const;

/** UNAPPROVED. One digest per unit above, from `canonicalJson` of the unit's value in `ro.json`. */
export const DRAFT_ROMANIAN_DIGESTS: Readonly<Record<string, string>> = {
  accountMail:
    "fdec7dc2c999076b1c19d1ddfa9abfe532ede4e30c6dfc4864e627a3434a9edd",
  accountForm:
    "e0ce283325750e58d56343ee654a9636bdd609f014642c3149401ad6afbb7211",
  accountFieldErrors:
    "131be8ff76ce5d4d2e7418dd6e3d133dcafd6f21c668f5971a42c78fc7b72573",
  accountShell:
    "47ec7c738bb4fce7f40aceb40f94db0f79d2ee575c7b527c5b77ca999b2b1df6",
  accountForgot:
    "271808992d561ec8ec6dc42d682347ec46d4cf5e56e3e0ac677c1bf57f5154f5",
  accountRegister:
    "03bed37c188d5bec972c08cd90c8155771761541a525e80622b04b1532a91fa9",
  accountCheckInbox:
    "8224338a71b6284b9ecbad840217e41e0c352402b99c5317435b9f0a224fb066",
  accountLogin:
    "fe1ded1e9bb20635dba53f2429c94ab57f6331eb0db0fc7519931186431eba60",
  accountVerify:
    "c23d94a59babfebd95b6a071b9333895ee14c28bbbe0bd118e9a548183beb875",
  accountReset:
    "70cdfb40fc7245047276c32b288dc27f4eb6c05fb3f794fb577b237371b483c5",
  accountNotFound:
    "66f8891cb76b0efd9892bdd0b223becba42f521c6356ecec35ad67bbf907acb0",
  accountForbidden:
    "2688dceada104131f175c285556b82b3b1d2ac5415de435ce6dc688916a177f4",
  accountControl:
    "6f96eff1a404d1676d0f67e3a547e7081a0fd52069fb5cf7abec589960182c94",
  logoutEverywhere:
    "2dce367d9892971e22f7cfec03aba2f8d299fda40987bcc26d3831c12b616320",
  sessionExpiredSheet:
    "fea4c73f35cd04865017feb553bc6ebf3b76f7312e659a00d3ce1d581bb6f1c2",
  claimDialog:
    "d1ffe50d10b35d4885419931e88d5875545c295737387cda5487eed27d29e8af",
  accountKitchens:
    "b950a1a067bf6f83fee0f8607c3268d69e5e6e4e067b333300187031da6c9260",
  accountProfile:
    "35b86dcaa0ea621edab2533c30da8785d98eb4e367208acfb64813babe79604b",
  accountPassword:
    "a329b5f71fb519f7c7a7cbb423f5b3b28283157514360f664c38ed76c7e2ca8d",
  accountEmailChange:
    "78b9b49793a1699479302df226c6a979c040ff87c861568870897a98c53621e0",
  accountExport:
    "5b529ca5ee59a043000d718b1cfb1d61bbf96a8a8b2ff7336f967f82f203d26f",
  privacyNotice:
    "068ab2caac0814c9ccbe82d2008908662208b4131eff0768d3c2d4c440b9e702",
  "designLoadError.bodyClient":
    "120ace76a8255bd732545704d9ab3e732682e6a93a3ac79c54d934fcfb4257b9",
};

type Tree = Readonly<Record<string, unknown>>;

/** Every unit of draft copy, by the name it carries in `DRAFT_ROMANIAN_DIGESTS`. */
export const DRAFT_ROMANIAN_UNITS: readonly string[] = [
  ...DRAFT_ROMANIAN_NAMESPACES,
  ...DRAFT_ROMANIAN_LEAVES,
];

function isTree(value: unknown): value is Tree {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The value at a dotted path, or `undefined` where the path names nothing. */
export function valueAtPath(catalogue: Tree, path: string): unknown {
  let cursor: unknown = catalogue;
  for (const segment of path.split(".")) {
    if (!isTree(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/** The catalogue as the approved lock describes it: every draft namespace and leaf taken out. The input is not changed. */
export function withoutDraftCopy(catalogue: Tree): Tree {
  const approved = structuredClone(catalogue) as Record<string, unknown>;
  for (const namespace of DRAFT_ROMANIAN_NAMESPACES) {
    Reflect.deleteProperty(approved, namespace);
  }
  for (const leafPath of DRAFT_ROMANIAN_LEAVES) {
    const segments = leafPath.split(".");
    const leafName = segments.pop();
    const parent = valueAtPath(approved, segments.join("."));
    if (leafName !== undefined && isTree(parent)) {
      Reflect.deleteProperty(parent, leafName);
    }
  }
  return approved;
}

/** JSON with every object's keys in sorted order, so a digest does not move when only the authoring order does. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isTree(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : nested,
  );
}

export function digestOf(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

/** The digest of each draft unit as the catalogue holds it now; a unit the catalogue lacks digests `undefined`. */
export function currentDraftDigests(catalogue: Tree): Record<string, string> {
  return Object.fromEntries(
    DRAFT_ROMANIAN_UNITS.map((unit) => [
      unit,
      digestOf(valueAtPath(catalogue, unit)),
    ]),
  );
}
