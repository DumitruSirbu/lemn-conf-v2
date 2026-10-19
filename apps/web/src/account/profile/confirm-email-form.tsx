"use client";

import { createRef, useRef, useState, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountEmailChangeCopy,
  useAccountKitCopy,
} from "@/i18n/use-content";

import { isRetryable } from "../account-answer";
import { useMoveFocusOnAnswer } from "../account-focus";
import {
  AccountForm,
  FormNotice,
  OutcomeHero,
  RateLimitNotice,
  SubmitButton,
  waitOfFeedback,
} from "../account-form-parts";
import {
  TokenRequestFailedScreen,
  useFocusOnMount,
} from "../account-outcome-screens";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  accountPathOf,
  PrimaryLink,
  SecondaryAction,
} from "../account-shell";
import {
  useConfirmEmail,
  type ConfirmEmail,
  type ConfirmEmailFeedback,
} from "./use-confirm-email";

// The confirm-new-address page (Lot 2 frames A10T1 to A10T5). The e-mailed link brings a token in the address fragment;
// the page takes it out of the address at once and sends it only when the person presses "Confirmă", so a program that
// opens the link confirms nothing. A confirmation ends every session of the account, so the way on is signing in with
// the new address. It says one thing when the link is no longer good, whatever the reason, because the server answers
// all of it alike. It loads nothing from any other origin, draws no challenge and, as every token page, no language
// links: a new document in the other language would have no token to read.

export interface ConfirmEmailFormProps {
  readonly locale: AppLocale;
}

export function ConfirmEmailForm({ locale }: ConfirmEmailFormProps) {
  const confirm = useConfirmEmail();
  return (
    <AccountShell locale={locale}>
      <ConfirmScreen confirm={confirm} locale={locale} />
    </AccountShell>
  );
}

/** The server renders and the client hydrates the form (`reading`); the invalid-link screen can only come after the
 *  client has looked at the address, so a valid link never flashes it. */
function ConfirmScreen({
  confirm,
  locale,
}: ConfirmEmailFormProps & { readonly confirm: ConfirmEmail }) {
  switch (confirm.feedback.kind) {
    case "confirmed":
      return <ChangedScreen locale={locale} />;
    case "link-invalid":
      return <LinkInvalidScreen locale={locale} />;
    case "request-failed":
      return <TokenRequestFailedScreen locale={locale} />;
    default:
      return confirm.tokenStatus === "absent" ? (
        <LinkInvalidScreen locale={locale} />
      ) : (
        <AskingScreen confirm={confirm} />
      );
  }
}

/** Frame A10T3. Every session ended with the change, this device's included: the way on is a document load to sign in. */
function ChangedScreen({ locale }: ConfirmEmailFormProps) {
  const copy = useAccountEmailChangeCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="success"
          title={copy.changedTitle}
          headingRef={headingRef}
        >
          {copy.changedBody}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        <PrimaryLink href={accountPathOf(locale, "login")}>
          {copy.logIn}
        </PrimaryLink>
      </AccountActions>
    </>
  );
}

/** Frame A10T4: a link that is expired, used, replaced, now unusable or missing. One sentence for all of them, which
 *  also points a person who did confirm to signing in. No reload is offered: the address no longer holds the token. */
function LinkInvalidScreen({ locale }: ConfirmEmailFormProps) {
  const copy = useAccountEmailChangeCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="error"
          title={copy.linkInvalidTitle}
          headingRef={headingRef}
        >
          {copy.linkInvalidBody}
        </OutcomeHero>
      </AccountPane>
      <AccountActions>
        <PrimaryLink href={accountPathOf(locale, "profile")}>
          {copy.openProfile}
        </PrimaryLink>
        <SecondaryAction href={accountPathOf(locale, "login")}>
          {copy.logIn}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

function createFocusTargets() {
  return { notice: createRef<HTMLDivElement>() };
}

/** Frames A10T1, A10T2 and A10T5. The form has no field: its one act is the button, which stays off until the page has
 *  found a token in the address. */
function AskingScreen({ confirm }: { readonly confirm: ConfirmEmail }) {
  const copy = useAccountEmailChangeCopy();
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(confirm.focusRequest, targets);
  return (
    <AccountForm onSubmit={confirm.submit} isBusy={confirm.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.lead} />
        <FeedbackNotice
          feedback={confirm.feedback}
          noticeRef={targets.notice}
        />
      </AccountPane>
      <AccountActions>
        <SubmitArea confirm={confirm} />
      </AccountActions>
    </AccountForm>
  );
}

/** The note that heads the form: a limit, an unavailable service or a request that got no answer. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: ConfirmEmailFeedback;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const kit = useAccountKitCopy();
  switch (feedback.kind) {
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
    default:
      return null;
  }
}

function SubmitArea({ confirm }: { readonly confirm: ConfirmEmail }) {
  const copy = useAccountEmailChangeCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(confirm.feedback);
  return (
    <SubmitButton
      label={isRetryable(confirm.feedback) ? kit.retry : copy.confirm}
      busyLabel={copy.confirming}
      isBusy={confirm.isBusy}
      isOff={confirm.tokenStatus !== "present"}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}
