"use client";

import { useCallback, useState } from "react";

import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";

import { orFailed } from "./async-seams";
import type {
  PriceVersionListWire,
  PriceVersionSummaryWire,
} from "./price-dashboard-wire-contract";
import type { PublishClient, VersionPageOutcome } from "./publish-client";
import { useLateAnswerGuard } from "./use-late-answer-guard";

// The history one page at a time. The page on screen stays until the next one has arrived, a page asked for after
// another wins whichever answers last, and a page that cannot be read leaves the page on screen with its notice.

const PAGE_FAILED: VersionPageOutcome = { kind: "failed" };
const FIRST_PAGE = 1;

export type HistoryStatus = "idle" | "loading" | "failed";

export interface VersionHistory {
  readonly list: PriceVersionListWire;
  readonly status: HistoryStatus;
  readonly goToPage: (page: number) => void;
  /** A version was just published: it heads the first page and every other version is archived. Only the pending view
   *  publishes, and it holds the first page. */
  readonly showPublished: (published: PriceVersionSummaryWire) => void;
}

export function useVersionHistory(input: {
  readonly client: PublishClient;
  readonly initial: PriceVersionListWire;
}): VersionHistory {
  const { client, initial } = input;
  const [list, setList] = useState(initial);
  const [status, setStatus] = useState<HistoryStatus>("idle");
  const { moveOn, begin } = useLateAnswerGuard();

  const goToPage = useCallback(
    (page: number) => {
      moveOn();
      const hasMoved = begin();
      setStatus("loading");
      void orFailed(() => client.readVersionPage(page), PAGE_FAILED).then(
        (outcome) => {
          if (hasMoved()) return;
          if (outcome.kind === "listed") setList(outcome.list);
          if (outcome.kind === "session-ended") raiseStaffSessionExpired();
          setStatus(outcome.kind === "listed" ? "idle" : "failed");
        },
      );
    },
    [client, moveOn, begin],
  );

  const showPublished = useCallback(
    (published: PriceVersionSummaryWire) => {
      moveOn();
      setStatus("idle");
      setList((held) => ({
        ...held,
        total: held.total + 1,
        page: FIRST_PAGE,
        versions: [
          published,
          ...held.versions.map((version) => ({
            ...version,
            state: "archived" as const,
          })),
        ].slice(0, held.pageSize),
      }));
    },
    [moveOn],
  );

  return { list, status, goToPage, showPublished };
}
