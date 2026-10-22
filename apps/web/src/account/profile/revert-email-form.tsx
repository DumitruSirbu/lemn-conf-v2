"use client";

import {
  countPasswordCharacters,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import { useRef, useState, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useAccountRevertEmailCopy,
  useAccountShellCopy,
} from "@/i18n/use-content";

import { isRetryable } from "../account-answer";
import {
  createPasswordPageTargets,
  useFocusPasswordWhenReady,
  useMoveFocusOnAnswer,
} from "../account-focus";
import {
  AccountForm,
  FormNotice,
  OutcomeHero,
  PasswordField,
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
  startPathOf,
} from "../account-shell";
import {
  useRevertEmail,
  type RevertEmail,
  type RevertEmailFeedback,
} from "./use-revert-email";

// The undo page (Lot 2 plan 14.3.3, R-13). The link in the notice to the old address brings a token in the address
// fragment; the page takes it out of the address at once and asks for the password to use from now on, because whoever
// moved the account knows the old one. It sends the token only when the person presses the button, so a program that
// opens the link reverts nothing. A revert ends every session and starts none: the way on is signing in with the
// restored address. It says one thing when the link is no longer good, whatever the reason, because the server answers
// all of it alike, and it offers no way to ask for a new link: none exists. It is outside the e-mail-change switch so
// that a link already mailed is never stranded. It loads nothing from any other origin, draws no challenge and, as every
// token page, no language links: a new document in the other language would have no token to read.

export interface RevertEmailFormProps {
  readonly locale: AppLocale;
}

export function RevertEmailForm({ locale }: RevertEmailFormProps) {
  const revert = useRevertEmail();
  return (
    <AccountShell locale={locale}>
      <RevertScreen revert={revert} locale={locale} />
    </AccountShell>
  );
}

/** The server renders and the client hydrates the form (`reading`); the invalid-link screen can only come after the
 *  client has looked at the address, so a valid link never flashes it. */
function RevertScreen({
  revert,
  locale,
}: RevertEmailFormProps & { readonly revert: RevertEmail }) {
  switch (revert.feedback.kind) {
    case "reverted":
      return <RestoredScreen locale={locale} />;
    case "link-invalid":
      return <LinkInvalidScreen locale={locale} />;
    case "request-failed":
      return <TokenRequestFailedScreen locale={locale} />;
    default:
      return revert.tokenStatus === "absent" ? (
        <LinkInvalidScreen locale={locale} />
      ) : (
        <AskingScreen revert={revert} />
      );
  }
}

/** Every session ended with the revert, this device's included: the way on is a document load to sign in. */
function RestoredScreen({ locale }: RevertEmailFormProps) {
  const copy = useAccountRevertEmailCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="success"
          title={copy.doneTitle}
          headingRef={headingRef}
        >
          {copy.doneBody}
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

/** A link that is expired, used, retired or missing. One sentence for all of them, which also points a person who did
 *  revert to signing in. No reload is offered (the address no longer holds the token) and no new link either. */
function LinkInvalidScreen({ locale }: RevertEmailFormProps) {
  const copy = useAccountRevertEmailCopy();
  const shell = useAccountShellCopy();
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
        <PrimaryLink href={accountPathOf(locale, "login")}>
          {copy.logIn}
        </PrimaryLink>
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

function AskingScreen({ revert }: { readonly revert: RevertEmail }) {
  const copy = useAccountRevertEmailCopy();
  const [targets] = useState(createPasswordPageTargets);
  useFocusPasswordWhenReady(revert.tokenStatus, targets.password);
  useMoveFocusOnAnswer(revert.focusRequest, targets);
  return (
    <AccountForm onSubmit={revert.submit} isBusy={revert.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.lead} />
        <FeedbackNotice feedback={revert.feedback} noticeRef={targets.notice} />
        <NewPasswordField revert={revert} inputRef={targets.password} />
      </AccountPane>
      <AccountActions>
        <SubmitArea revert={revert} />
      </AccountActions>
    </AccountForm>
  );
}

/** The password is chosen here, so its length is counted live while it is shorter than the rule asks. The one refusal
 *  only this page can get, the password the account holds now, is told in the page's own words. */
function NewPasswordField({
  revert,
  inputRef,
}: {
  readonly revert: RevertEmail;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}) {
  const kit = useAccountKitCopy();
  const copy = useAccountRevertEmailCopy();
  const { feedback } = revert;
  const length = countPasswordCharacters(revert.password);
  const isCounting = length > 0 && length < PASSWORD_MIN_LENGTH;
  return (
    <PasswordField
      label={kit.newPasswordLabel}
      name="newPassword"
      autoComplete="new-password"
      value={revert.password}
      onChange={revert.editPassword}
      hint={kit.passwordHint}
      {...(isCounting
        ? { count: kit.passwordCount(length, PASSWORD_MIN_LENGTH) }
        : {})}
      {...(feedback.kind === "password-refused"
        ? {
            error:
              feedback.issue.code === "PASSWORD_UNCHANGED"
                ? copy.passwordUnchanged
                : kit.fieldError(feedback.issue),
          }
        : {})}
      inputRef={inputRef}
    />
  );
}

/** The note that heads the form: a limit, an unavailable service or a request that got no answer. A refused password
 *  is said beside the field and needs none. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: RevertEmailFeedback;
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

function SubmitArea({ revert }: { readonly revert: RevertEmail }) {
  const copy = useAccountRevertEmailCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(revert.feedback);
  return (
    <SubmitButton
      label={isRetryable(revert.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={revert.isBusy}
      isOff={revert.tokenStatus !== "present"}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}
