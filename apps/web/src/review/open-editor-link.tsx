"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import type { ComponentProps } from "react";

import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";

import { editorHref } from "./review-groups";
import type { ReviewView } from "./review-model";

type OpenEditorLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "prefetch" | "replace" | "children"
> & {
  readonly designId: DesignId;
  readonly review: ReviewView;
};

/**
 * The way to the editor under a sentence that says the choice is made there (a save in conflict), for every screen
 * that draws that sentence. It lands so that the conflict is on screen: the editor draws a conflict, and its controls,
 * in the panel, and the panel needs a selection, so the link selects the first body.
 */
export function OpenEditorLink({
  designId,
  review,
  ...anchorProps
}: OpenEditorLinkProps) {
  const content = useContent();
  return (
    <Link
      prefetch={false}
      href={editorHref(designId, selectingTheFirstBody(review))}
      {...anchorProps}
    >
      {content.reviewScreen.openEditor}
    </Link>
  );
}

/**
 * The first body in display order, which is the first row of the first group, as each group's *Editează* takes it. A
 * review with no rows (one that cannot be shown, or a kitchen with no body) has no body to name, and the link then
 * lands on the editor as it is.
 */
function selectingTheFirstBody(review: ReviewView): { select?: string } {
  if (review.kind !== "available") return {};
  const firstBody = review.groups[0]?.rows[0];
  return firstBody === undefined ? {} : { select: firstBody.key };
}
