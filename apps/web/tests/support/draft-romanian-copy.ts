import { createHash } from "node:crypto";

// **OWNER-UNAPPROVED DRAFT Romanian copy (Lot 1 of the account screens), tracked apart from the approved lock.**
//
// `approved-romanian-messages.ts` is the corpus the owner agreed to, and `romanian-copy-lock.test.ts` holds `ro.json`'s
// approved part to it leaf for leaf. Lot 2's wording and `designLoadError.bodyClient` were approved as drafted on
// 2026-10-20 (open questions O27 and O25 of `M8B-account-screens-lot2-plan.md` section 9; ADR 0113 decision 2) and are
// in the lock. **What this file still holds is Lot 1's wording** (the register, log-in, forgot, reset, confirm and
// check-inbox screens, the shared form kit and the privacy-notice stub): an agent wrote it from the mockups, and its
// approval is O1 of `M8B-account-screens-lot1-review.md` ("Approve the Lot 1 Romanian copy ... the copy lock; milestone
// close"), which no record shows as ruled. O27 is "all draft copy of Lot 2" and does not name it. Pasting it into the
// approved lock would record "a person agreed to this" for words nobody has read, and the lock's whole value is that claim.
//
// **Mixed namespaces.** Four Lot 1 namespaces gained leaves in Lot 2 and those leaves are approved:
// `APPROVED_PATHS_IN_DRAFT_NAMESPACES` names them. The rest of the namespace stays draft and is what the digest covers.
// Lot 1 leaves that Lot 2's screens also read (`accountForm.retry`, the `accountFieldErrors.phone*` wording of O14) are
// still Lot 1's, and still unapproved.
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
// **Promoting a unit** when the owner approves it: delete it from `DRAFT_ROMANIAN_NAMESPACES` and from
// `DRAFT_ROMANIAN_DIGESTS`, and paste its wording into `APPROVED_ROMANIAN_MESSAGES` in the same commit, with the date and
// the form the approval was relayed in. For a leaf inside a namespace that stays draft, add its path to
// `APPROVED_PATHS_IN_DRAFT_NAMESPACES` instead of the namespace to the list.

/** Top-level namespaces whose Romanian wording, wholly or in part, is a Lot 1 draft. */
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
  "privacyNotice",
] as const;

/**
 * Lot 2 wording that stands inside a draft namespace and is approved (2026-10-20, O27). Each path is a leaf or a
 * subtree, and is in the approved lock; it is not part of the draft unit it sits in.
 */
export const APPROVED_PATHS_IN_DRAFT_NAMESPACES = [
  "accountMail.emailChange",
  "accountMail.emailChangeAddressInUse",
  "accountMail.emailChanged",
  "accountForm.rateLimitedCountdown",
  "accountForm.rateLimitedReady",
  "accountFieldErrors.nameTooLong",
  "accountFieldErrors.nameForbiddenCharacter",
  "accountFieldErrors.addressTooLong",
  "accountFieldErrors.addressForbiddenCharacter",
  "accountLogin.signedOutEverywhere",
  "accountLogin.passwordMaybeChanged",
] as const;

/** UNAPPROVED. One digest per draft namespace, from `canonicalJson` of its draft part in `ro.json`. */
export const DRAFT_ROMANIAN_DIGESTS: Readonly<Record<string, string>> = {
  accountMail:
    "798d1306f0beae93adacaed7319861266280f5458c3235b08ba9a55d70962e94",
  accountForm:
    "4c184d0bb113e562b245aefc0d28634ad8aa0f69d9d55feb424ef00c10fe523b",
  accountFieldErrors:
    "1e08ec0fa5523cb9e810c5f55277e3b6483d4d509eeec144a75e4ca333bd50e5",
  accountShell:
    "47ec7c738bb4fce7f40aceb40f94db0f79d2ee575c7b527c5b77ca999b2b1df6",
  accountForgot:
    "271808992d561ec8ec6dc42d682347ec46d4cf5e56e3e0ac677c1bf57f5154f5",
  accountRegister:
    "03bed37c188d5bec972c08cd90c8155771761541a525e80622b04b1532a91fa9",
  accountCheckInbox:
    "8224338a71b6284b9ecbad840217e41e0c352402b99c5317435b9f0a224fb066",
  accountLogin:
    "5ee8ada2ca9747e15d5c4ecb69783772718261b745c35102ba68c5329b63f5ff",
  accountVerify:
    "c23d94a59babfebd95b6a071b9333895ee14c28bbbe0bd118e9a548183beb875",
  accountReset:
    "70cdfb40fc7245047276c32b288dc27f4eb6c05fb3f794fb577b237371b483c5",
  accountNotFound:
    "66f8891cb76b0efd9892bdd0b223becba42f521c6356ecec35ad67bbf907acb0",
  privacyNotice:
    "068ab2caac0814c9ccbe82d2008908662208b4131eff0768d3c2d4c440b9e702",
};

type Tree = Readonly<Record<string, unknown>>;
type MutableTree = Record<string, unknown>;

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

/** The leaves of `namespace` that are approved: every path is `namespace.leaf`, a leaf or a subtree of the namespace. */
function approvedLeavesIn(namespace: string): readonly string[] {
  return APPROVED_PATHS_IN_DRAFT_NAMESPACES.filter(
    (path) => namespaceOf(path) === namespace,
  ).map(leafNameOf);
}

/** The namespace an approved path sits in. */
export function namespaceOf(path: string): string {
  return path.slice(0, path.indexOf("."));
}

/** The leaf (or subtree) name of an approved path, which is `namespace.leaf`. */
export function leafNameOf(path: string): string {
  return path.slice(path.indexOf(".") + 1);
}

/** One draft namespace as the digest sees it: the namespace with its approved leaves taken out. The input is not changed. */
export function draftPartOf(catalogue: Tree, namespace: string): unknown {
  const draftPart = structuredClone(valueAtPath(catalogue, namespace));
  if (!isTree(draftPart)) return draftPart;
  for (const leafName of approvedLeavesIn(namespace)) {
    Reflect.deleteProperty(draftPart, leafName);
  }
  return draftPart;
}

/**
 * The catalogue as the approved lock describes it: each draft namespace reduced to its approved paths, and dropped
 * where it has none. The input is not changed.
 */
export function withoutDraftCopy(catalogue: Tree): Tree {
  const approved = structuredClone(catalogue) as MutableTree;
  for (const namespace of DRAFT_ROMANIAN_NAMESPACES) {
    const approvedPart: MutableTree = {};
    for (const leafName of approvedLeavesIn(namespace)) {
      approvedPart[leafName] = valueAtPath(
        catalogue,
        `${namespace}.${leafName}`,
      );
    }
    if (Object.keys(approvedPart).length === 0) {
      Reflect.deleteProperty(approved, namespace);
    } else {
      approved[namespace] = approvedPart;
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

/** The digest of each draft namespace's draft part as the catalogue holds it now. */
export function currentDraftDigests(catalogue: Tree): Record<string, string> {
  return Object.fromEntries(
    DRAFT_ROMANIAN_NAMESPACES.map((namespace) => [
      namespace,
      digestOf(draftPartOf(catalogue, namespace)),
    ]),
  );
}
