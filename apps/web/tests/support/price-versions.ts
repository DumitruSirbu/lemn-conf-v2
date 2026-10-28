import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import {
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
} from "./price-dashboard-requests";

// The history a test of the version routes builds through the routes themselves: a change in the draft and a publish, as a
// page makes them. The book is the sample book (the one book of the tests that passes the catalogue's judgement as it is),
// and its row `cabinet.base-3drawer` is priced from an anchor.

export const VERSIONED_BOOK = SAMPLE_PRICE_BOOK;
export const VERSIONED_RULE_ID = "cabinet.base-3drawer";
export const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: VERSIONED_RULE_ID,
  field: "anchorMinor",
} as const;
export const SAMPLE_ANCHOR_MINOR = 480_000;

/** Puts one change in the draft, at the revision the store holds now. */
export async function putChange(
  cookie: string,
  address: unknown,
  value: unknown,
): Promise<void> {
  const answer = await changeDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      change: { address, value },
    },
  });
  if (answer.status !== 200) {
    throw new Error(`the change was refused with ${String(answer.status)}`);
  }
}

/** Publishes the draft under `label`; the id of the version that went live. */
export async function publishWithLabel(
  cookie: string,
  label: string,
): Promise<string> {
  const answer = await publishDraft({
    cookie,
    json: await publishBody({ label }),
  });
  if (answer.status !== 200) {
    throw new Error(`the publish was refused with ${String(answer.status)}`);
  }
  return ((await answer.json()) as { versionId: string }).versionId;
}

/** Sets the anchor of the versioned row and publishes it: one more version, whose book holds `anchorMinor`. */
export async function publishAnchor(
  cookie: string,
  anchorMinor: number,
  label = `Anchor ${String(anchorMinor)}`,
): Promise<string> {
  await putChange(cookie, ANCHOR_ADDRESS, anchorMinor);
  return publishWithLabel(cookie, label);
}
