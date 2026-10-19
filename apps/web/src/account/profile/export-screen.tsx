"use client";

import { createRef, useState, type ReactNode, type RefObject } from "react";

import type { AccountExportCopy, AccountKitCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountExportCopy, useAccountKitCopy } from "@/i18n/use-content";

import { isRetryable } from "../account-answer";
import { useMoveFocusOnAnswer } from "../account-focus";
import {
  AccountForm,
  FormNotice,
  RateLimitNotice,
  SubmitButton,
  waitOfFeedback,
} from "../account-form-parts";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  accountPathOf,
  PrimaryAction,
  PrimaryLink,
} from "../account-shell";
import { ForbiddenScreen } from "../forbidden-screen";
import {
  useExport,
  type AccountExport,
  type ExportFeedback,
} from "./use-export";

// "Exportă datele mele" (Lot 2 frames A12A to A12E): one button that downloads the account's data as a JSON file. The
// page shows nothing of the file and keeps nothing of it. An account too large for one file is told so and offered the
// way back, not a retry, since asking again cannot succeed. Every link is a plain anchor, as on every account page.

export function ExportScreen({ locale }: { readonly locale: AppLocale }) {
  const exporting = useExport(locale);
  if (exporting.feedback.kind === "forbidden") {
    return <ForbiddenScreen locale={locale} />;
  }
  return (
    <ExportFrame locale={locale}>
      <AskingScreen locale={locale} exporting={exporting} />
    </ExportFrame>
  );
}

/** The page when the server could not read the session: nobody can say whether it is live, so the button is not drawn,
 *  and the way on is the page asked for again. */
export function ExportUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const copy = useAccountExportCopy();
  const kit = useAccountKitCopy();
  return (
    <ExportFrame locale={locale}>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <FormNotice tone="error" title={kit.unavailable.title}>
          {kit.unavailable.body}
        </FormNotice>
      </AccountPane>
      <AccountActions>
        <PrimaryAction
          onClick={() => {
            window.location.reload();
          }}
        >
          {kit.retry}
        </PrimaryAction>
      </AccountActions>
    </ExportFrame>
  );
}

function ExportFrame({
  locale,
  children,
}: {
  readonly locale: AppLocale;
  readonly children: ReactNode;
}) {
  return (
    <AccountShell locale={locale} page="export">
      {children}
    </AccountShell>
  );
}

function createFocusTargets() {
  return { notice: createRef<HTMLDivElement>() };
}

function AskingScreen({
  locale,
  exporting,
}: {
  readonly locale: AppLocale;
  readonly exporting: AccountExport;
}) {
  const copy = useAccountExportCopy();
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(exporting.focusRequest, targets);
  return (
    <AccountForm onSubmit={exporting.download} isBusy={exporting.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.lead} />
        <ExportNotice exporting={exporting} noticeRef={targets.notice} />
      </AccountPane>
      <AccountActions>
        <ActionArea locale={locale} exporting={exporting} />
      </AccountActions>
    </AccountForm>
  );
}

/** The page's one message: the file being prepared, the download begun, a limit, or why the file could not be made. */
function ExportNotice({
  exporting,
  noticeRef,
}: {
  readonly exporting: AccountExport;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const copy = useAccountExportCopy();
  const kit = useAccountKitCopy();
  if (exporting.isBusy) {
    return <FormNotice tone="info">{copy.preparing}</FormNotice>;
  }
  const { feedback } = exporting;
  switch (feedback.kind) {
    case "downloaded":
      return <FormNotice tone="success">{copy.downloaded}</FormNotice>;
    case "rate-limited":
      return <RateLimitNotice notice={feedback.notice} ref={noticeRef} />;
    case "unavailable":
      return (
        <FormNotice tone="error" title={kit.unavailable.title} ref={noticeRef}>
          {kit.unavailable.body}
        </FormNotice>
      );
    case "unanswered":
      return (
        <FormNotice tone="error" title={kit.offline.title} ref={noticeRef}>
          {kit.offline.body}
        </FormNotice>
      );
    case "request-failed":
      return (
        <FormNotice
          tone="error"
          title={kit.requestFailed.title}
          ref={noticeRef}
        >
          {kit.requestFailed.body}
        </FormNotice>
      );
    case "too-large":
      return (
        <FormNotice tone="error" ref={noticeRef}>
          {copy.tooLarge}
        </FormNotice>
      );
    case "none":
    case "forbidden":
      return null;
  }
}

function ActionArea({
  locale,
  exporting,
}: {
  readonly locale: AppLocale;
  readonly exporting: AccountExport;
}) {
  const copy = useAccountExportCopy();
  if (exporting.feedback.kind === "too-large") {
    return (
      <PrimaryLink href={accountPathOf(locale, "profile")}>
        {copy.backToProfile}
      </PrimaryLink>
    );
  }
  return <DownloadButton exporting={exporting} />;
}

function DownloadButton({ exporting }: { readonly exporting: AccountExport }) {
  const copy = useAccountExportCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(exporting.feedback);
  return (
    <SubmitButton
      label={submitLabelOf({ feedback: exporting.feedback, copy, kit })}
      busyLabel={copy.submitting}
      isBusy={exporting.isBusy}
      isOff={false}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}

interface SubmitLabelInput {
  readonly feedback: ExportFeedback;
  readonly copy: AccountExportCopy;
  readonly kit: AccountKitCopy;
}

function submitLabelOf({ feedback, copy, kit }: SubmitLabelInput): string {
  if (feedback.kind === "downloaded") return copy.downloadAgain;
  return isRetryable(feedback) ? kit.retry : copy.submit;
}
