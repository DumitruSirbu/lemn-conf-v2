"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountForgotCopy,
  useAccountKitCopy,
  useAccountShellCopy,
} from "@/i18n/use-content";

import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  accountPathOf,
  ActionsLine,
  SecondaryAction,
  startPathOf,
} from "./account-shell";
import {
  AccountForm,
  AccountLink,
  ChallengeField,
  FormHint,
  FormNotice,
  HelpItem,
  HelpList,
  OutcomeHero,
  RateLimitNotice,
  SubmitButton,
  TextField,
  type SubmitWait,
} from "./account-form-parts";
import {
  RequestFailedScreen,
  useFocusOnMount,
} from "./account-outcome-screens";
import {
  useForgotPassword,
  type ForgotFeedback,
  type ForgotPassword,
} from "./use-forgot-password";

// The forgotten-password page (Lot 1 frames A5A to A5G). It asks for an address and says the same thing whether or not
// an account has it: the sent screen never names the address, and nothing on the page varies with the answer but its
// class, the wait it states and the field it marks.

export interface ForgotPasswordFormProps {
  readonly locale: AppLocale;
  /** `TURNSTILE_SITE_KEY` and the request's nonce, read on the server (`readChallengePageProps`). */
  readonly siteKey: string | undefined;
  readonly nonce: string | undefined;
}

export function ForgotPasswordForm({
  locale,
  siteKey,
  nonce,
}: ForgotPasswordFormProps) {
  const forgot = useForgotPassword();
  const copy = useAccountForgotCopy();
  return (
    <AccountShell
      locale={locale}
      page="forgot-password"
      headerTitle={copy.headerTitle}
    >
      <ForgotScreen
        forgot={forgot}
        locale={locale}
        siteKey={siteKey}
        nonce={nonce}
      />
    </AccountShell>
  );
}

function ForgotScreen({
  forgot,
  ...page
}: ForgotPasswordFormProps & { readonly forgot: ForgotPassword }) {
  switch (forgot.feedback.kind) {
    case "sent":
      return <SentScreen locale={page.locale} />;
    case "request-failed":
      return <RequestFailedScreen locale={page.locale} />;
    default:
      return <AskingScreen forgot={forgot} {...page} />;
  }
}

function AskingScreen({
  forgot,
  locale,
  siteKey,
  nonce,
}: ForgotPasswordFormProps & { readonly forgot: ForgotPassword }) {
  const copy = useAccountForgotCopy();
  const emailRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOnFeedback(forgot.feedback, { emailRef, noticeRef });
  return (
    <AccountForm onSubmit={forgot.submit} isBusy={forgot.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.body} />
        <FeedbackNotice feedback={forgot.feedback} noticeRef={noticeRef} />
        <EmailField forgot={forgot} inputRef={emailRef} />
        <ChallengeField
          siteKey={siteKey}
          nonce={nonce}
          action="reset"
          onTokenChange={forgot.receiveToken}
          resetCount={forgot.resetCount}
          isRefused={forgot.feedback.kind === "challenge-failed"}
        />
      </AccountPane>
      <AccountActions>
        <SubmitArea forgot={forgot} />
        <ActionsLine lead={copy.remembered}>
          <AccountLink href={accountPathOf(locale, "login")}>
            {copy.logIn}
          </AccountLink>
        </ActionsLine>
      </AccountActions>
    </AccountForm>
  );
}

function EmailField({
  forgot,
  inputRef,
}: {
  readonly forgot: ForgotPassword;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}) {
  const kit = useAccountKitCopy();
  const { feedback } = forgot;
  return (
    <TextField
      label={kit.emailLabel}
      name="email"
      type="email"
      autoComplete="email"
      placeholder={kit.emailPlaceholder}
      value={forgot.email}
      onChange={forgot.editEmail}
      {...(feedback.kind === "email-refused"
        ? { error: kit.fieldError(feedback.issue) }
        : {})}
      inputRef={inputRef}
    />
  );
}

/** The form-level message for a limit, an unavailable service or a request that got no answer. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: ForgotFeedback;
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

/** The primary action and, while it waits for a challenge token, the line that says why it is off. */
function SubmitArea({ forgot }: { readonly forgot: ForgotPassword }) {
  const copy = useAccountForgotCopy();
  const kit = useAccountKitCopy();
  const reasonId = useId();
  const wait = waitOf(forgot);
  const isWaitingForChallenge = !forgot.hasToken && !forgot.isBusy;
  const isRetry =
    forgot.feedback.kind === "unavailable" ||
    forgot.feedback.kind === "unanswered";
  return (
    <>
      <SubmitButton
        label={isRetry ? kit.retry : copy.submit}
        busyLabel={copy.submitting}
        isBusy={forgot.isBusy}
        isOff={!forgot.hasToken}
        {...(wait === undefined ? {} : { wait })}
        {...(isWaitingForChallenge && wait === undefined
          ? { describedBy: reasonId }
          : {})}
      />
      {isWaitingForChallenge && wait === undefined ? (
        <FormHint id={reasonId}>{kit.challenge.waiting}</FormHint>
      ) : null}
    </>
  );
}

/** A short limit is counted down on the button; a longer one is told in the notice and the button stays ready. */
function waitOf(forgot: ForgotPassword): SubmitWait | undefined {
  const { feedback } = forgot;
  if (
    feedback.kind !== "rate-limited" ||
    feedback.countdownSeconds === undefined
  ) {
    return undefined;
  }
  return {
    seconds: feedback.countdownSeconds,
    onElapsed: forgot.clearFeedback,
  };
}

/** Frame A5C, identical for a known, an unknown and an unconfirmed address. The address is not shown. */
function SentScreen({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountForgotCopy();
  const kit = useAccountKitCopy();
  const shell = useAccountShellCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="neutral"
          glyph="mail"
          title={copy.sentTitle}
          headingRef={headingRef}
        >
          {copy.sentBody}
        </OutcomeHero>
        <HelpList title={kit.checkInbox.helpTitle}>
          <HelpItem>{kit.checkInbox.spam}</HelpItem>
          <HelpItem>{kit.checkInbox.newest}</HelpItem>
        </HelpList>
      </AccountPane>
      <AccountActions>
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

interface FocusTargets {
  readonly emailRef: RefObject<HTMLInputElement | null>;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}

/** After an answer, focus goes where the person must look: the refused field (one field, so no summary), or the
 *  notice that now heads the form. A refused challenge is announced where it stands and keeps focus where it was. */
function useFocusOnFeedback(
  feedback: ForgotFeedback,
  { emailRef, noticeRef }: FocusTargets,
): void {
  useEffect(() => {
    switch (feedback.kind) {
      case "email-refused":
        emailRef.current?.focus();
        return;
      case "rate-limited":
      case "unavailable":
      case "unanswered":
        noticeRef.current?.focus();
        return;
      default:
        return;
    }
  }, [feedback, emailRef, noticeRef]);
}
