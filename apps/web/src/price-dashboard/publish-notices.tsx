"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { FormNotice } from "@/account/account-form-parts";
import { isolated } from "@/staff/bidi-isolate";

import { itemSubjectOf } from "./publish-model";
import { CandidateRefusals } from "./publish-refusal-lines";
import { useRowWords } from "./publish-row-words";
import styles from "./publish.module.css";
import type { PublishDesk, PublishNotice } from "./use-publish-desk";

// What the last write left on the page, in words: the notice at the top of the pending list and of the history.

export function NoticeBody({
  notice,
  desk,
  cabinetNames,
}: {
  readonly notice: PublishNotice;
  readonly desk: PublishDesk;
  readonly cabinetNames: Readonly<Record<string, string>>;
}): ReactNode {
  const translate = useTranslations();
  const words = useRowWords();
  switch (notice.kind) {
    case "published":
      return (
        <FormNotice
          tone="success"
          title={translate("priceDashboard.publish.publishedTitle", {
            versionId: String(notice.sequenceNumber),
            versionName: isolated(notice.label),
          })}
        >
          {translate("priceDashboard.publish.publishedBody")}
        </FormNotice>
      );
    case "candidate-refused":
      return (
        <FormNotice
          tone="error"
          title={translate("priceDashboard.publish.candidateRefusedTitle")}
        >
          {translate("priceDashboard.publish.candidateRefusedBody")}
          <CandidateRefusals
            refusals={notice.refusals}
            context={{
              books: {
                before: desk.state.active.book,
                after:
                  desk.reading.kind === "ready"
                    ? desk.reading.view.candidateBook
                    : desk.state.active.book,
              },
              changes: desk.state.draft.changes,
              cabinetNames,
            }}
          />
        </FormNotice>
      );
    case "discarded":
      return (
        <FormNotice tone="success">
          {translate("priceDashboard.publish.discardedBody")}
        </FormNotice>
      );
    case "failed":
      return (
        <FormNotice
          tone="error"
          title={translate("priceDashboard.publish.failedTitle")}
        >
          {translate("priceDashboard.publish.failedBody")}
          <span className={styles.noticeActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={desk.requestPublish}
            >
              {translate("priceDashboard.publish.retry")}
            </button>
          </span>
        </FormNotice>
      );
    case "conflict":
      return (
        <FormNotice tone="warning">
          {translate("priceDashboard.errors.changedMeanwhile")}
        </FormNotice>
      );
    case "save-failed":
      return (
        <FormNotice tone="error">
          {translate("priceDashboard.errors.saveFailed")}
        </FormNotice>
      );
    case "blocked": {
      const item =
        notice.block.kind === "in-use"
          ? notice.block.items[0]
          : notice.block.item;
      const name =
        item === undefined
          ? ""
          : words.subject(
              itemSubjectOf(item, {
                before: desk.state.active.book,
                after: desk.state.active.book,
              }),
            );
      return (
        <FormNotice tone="error">
          {notice.block.kind === "in-use"
            ? translate("priceDashboard.publish.blockedInUse", { name })
            : translate("priceDashboard.publish.blockedIsDefault", { name })}
        </FormNotice>
      );
    }
  }
}
