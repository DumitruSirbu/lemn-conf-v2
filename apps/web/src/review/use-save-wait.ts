import { clockTimeOf } from "@/i18n/clock-time";
import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";
import { pausedUntilMs, type SaveStatus } from "@/persistence/save-coalescer";
import { useConfiguratorStore } from "@/store/configurator-store";

/** Whether the design on screen is the one the server holds. An edit made in the editor can still be queued or in
 *  flight when the review opens, and a request for an offer must not go out for a design the server does not have. */
export type SaveWait =
  | { readonly kind: "saved" }
  | {
      readonly kind: "waiting";
      readonly sentence: string;
      /** The wait is one the customer ends in the editor, so the sentence comes with a way there. */
      readonly isSettledInTheEditor: boolean;
      /** The save has failed or stopped; otherwise it is only under way, which is not an error to draw as one. */
      readonly hasFailed: boolean;
    };

export function useSaveWait(): SaveWait {
  const content = useContent();
  const isSaved = useConfiguratorStore(
    (state) => state.design === state.savedDesign,
  );
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const resumesAtMs = useConfiguratorStore((state) => state.saveResumesAtMs);
  if (isSaved) return { kind: "saved" };
  const pausedUntil = pausedUntilMs(saveStatus, resumesAtMs);
  if (pausedUntil !== undefined) {
    return {
      kind: "waiting",
      sentence: content.panel.savePausedNotice(clockTimeOf(pausedUntil)),
      isSettledInTheEditor: false,
      hasFailed: false,
    };
  }
  return {
    kind: "waiting",
    sentence: sentenceForUnsavedEdit(saveStatus, content),
    isSettledInTheEditor: saveStatus === "conflict",
    hasFailed: saveStatus !== "idle" && saveStatus !== "saving",
  };
}

/** What the customer is told while an edit is unsaved: that it is being saved, or, once the save has failed, the
 *  sentence the editor already says for that failure. The exception is a conflict: the editor's sentence names
 *  reload and overwrite, which this screen does not have, so the review says where the choice is made. A write the
 *  limit on saves holds is told by `useSaveWait`, which has its time. */
function sentenceForUnsavedEdit(
  saveStatus: SaveStatus,
  content: Content,
): string {
  switch (saveStatus) {
    case "error":
      return content.panel.saveFailedNotice;
    case "stopped":
      return content.panel.saveStoppedNotice;
    case "conflict":
      return content.reviewScreen.conflict;
    case "unauthorized":
      return content.panel.readOnlyRefusedNotice;
    case "idle":
    case "saving":
      return content.reviewScreen.saving;
  }
}
