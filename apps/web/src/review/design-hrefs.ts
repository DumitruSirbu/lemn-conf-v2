import type { DesignId } from "@lemnaria/configurator-domain";

/** What the editor is asked to do on arrival: select one body, or open the whole-kitchen settings. */
export interface EditorArrival {
  readonly select?: string;
  readonly settings?: "open";
}

/** The design's editor, optionally asking it to select a body or open its settings. The editor honours the
 *  parameters once, on arrival. */
export function editorHref(designId: DesignId, arrival: EditorArrival = {}) {
  return { pathname: `/d/${designId}`, query: { ...arrival } };
}

/** The design's review. Its page runs the owned lookup, so a link to it is never prefetched. */
export function reviewHref(designId: DesignId): string {
  return `/d/${designId}/review`;
}
