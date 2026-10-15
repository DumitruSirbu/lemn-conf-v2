"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import type { ComponentProps } from "react";

import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import type { BreakdownRow } from "@/price/price-breakdown-model";

import { editorHref } from "./design-hrefs";
import type { ReviewView } from "./review-model";
import { selectingTheFirstBody } from "./review-groups";

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
      href={editorHref(
        designId,
        selectingTheFirstBody(rowsOfTheFirstGroup(review)),
      )}
      {...anchorProps}
    >
      {content.reviewScreen.openEditor}
    </Link>
  );
}

/**
 * The first group's rows, in display order, as each group's *Editează* takes the first. A review that cannot be shown,
 * or a kitchen with no body, has none, and the link then lands on the editor as it is.
 */
function rowsOfTheFirstGroup(review: ReviewView): readonly BreakdownRow[] {
  if (review.kind !== "available") return [];
  return review.groups[0]?.rows ?? [];
}
