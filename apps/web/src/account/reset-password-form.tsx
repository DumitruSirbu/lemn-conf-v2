"use client";

import {
  countPasswordCharacters,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import { createRef, useEffect, useRef, useState, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useAccountResetCopy,
  useAccountShellCopy,
} from "@/i18n/use-content";

import {
  AccountForm,
  FormNotice,
  OutcomeHero,
  PasswordField,
  RateLimitNotice,
  SubmitButton,
  type SubmitWait,
} from "./account-form-parts";
import {
  TokenRequestFailedScreen,
  useFocusOnMount,
} from "./account-outcome-screens";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  accountPathOf,
  PrimaryLink,
  SecondaryAction,
  startPathOf,
} from "./account-shell";
import {
  useResetPassword,
  type ResetFeedback,
  type ResetFocusRequest,
  type ResetPassword,
} from "./use-reset-password";

// The new-password page (Lot 1 frames A6A to A6H). The e-mail's link brings a token in the address fragment; the page
// takes it out of the address at once and asks for the password to use from now on. A changed password starts no
// session: the person is sent to sign in with it. It says one thing when the link is no longer good, whatever the
// reason, because the server answers all of it alike. It loads nothing from any other origin and draws no challenge.
// Its language links are left out: a new document in the other language would have no token to read (Lot 1 review,
// P3).

export interface ResetPasswordFormProps {
  readonly locale: AppLocale;
}

export function ResetPasswordForm({ locale }: ResetPasswordFormProps) {
  const reset = useResetPassword();
  const copy = useAccountResetCopy();
  return (
    <AccountShell locale={locale} headerTitle={copy.headerTitle}>
      <ResetScreen reset={reset} locale={locale} />
    </AccountShell>
  );
}

/** The server renders and the client hydrates the form (`reading`); the invalid-link screen can only come after the
 *  client has looked at the address, so a valid link never flashes it. */
function ResetScreen({
  reset,
  locale,
}: ResetPasswordFormProps & { readonly reset: ResetPassword }) {
  switch (reset.feedback.kind) {
    case "password-changed":
      return <ChangedScreen locale={locale} />;
    case "link-invalid":
      return <LinkInvalidScreen locale={locale} />;
    case "request-failed":
      return <TokenRequestFailedScreen locale={locale} />;
    default:
      return reset.tokenStatus === "absent" ? (
        <LinkInvalidScreen locale={locale} />
      ) : (
        <AskingScreen reset={reset} />
      );
  }
}

/** Frame A6E. No session was started: the way on is a document load to the sign-in page. */
function ChangedScreen({ locale }: ResetPasswordFormProps) {
  const copy = useAccountResetCopy();
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

/** Frame A6F: a link that is expired, used, replaced or missing. One sentence for all of them, and the way to ask for
 *  a new one. */
function LinkInvalidScreen({ locale }: ResetPasswordFormProps) {
  const copy = useAccountResetCopy();
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
        <PrimaryLink href={accountPathOf(locale, "forgot-password")}>
          {copy.requestNewLink}
        </PrimaryLink>
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

interface AskingFocusTargets {
  readonly password: RefObject<HTMLInputElement | null>;
  readonly notice: RefObject<HTMLDivElement | null>;
}

function createFocusTargets(): AskingFocusTargets {
  return {
    password: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

function AskingScreen({ reset }: { readonly reset: ResetPassword }) {
  const copy = useAccountResetCopy();
  const [targets] = useState(createFocusTargets);
  useFocusPasswordWhenReady(reset, targets.password);
  useMoveFocusOnAnswer(reset.focusRequest, targets);
  return (
    <AccountForm onSubmit={reset.submit} isBusy={reset.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.body} />
        <FeedbackNotice feedback={reset.feedback} noticeRef={targets.notice} />
        <NewPasswordField reset={reset} inputRef={targets.password} />
      </AccountPane>
      <AccountActions>
        <SubmitArea reset={reset} />
      </AccountActions>
    </AccountForm>
  );
}

/** The password is chosen here, so its length is counted live while it is shorter than the rule asks. */
function NewPasswordField({
  reset,
  inputRef,
}: {
  readonly reset: ResetPassword;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}) {
  const kit = useAccountKitCopy();
  const { feedback } = reset;
  const length = countPasswordCharacters(reset.password);
  const isCounting = length > 0 && length < PASSWORD_MIN_LENGTH;
  return (
    <PasswordField
      label={kit.newPasswordLabel}
      name="password"
      autoComplete="new-password"
      value={reset.password}
      onChange={reset.editPassword}
      hint={kit.passwordHint}
      {...(isCounting
        ? { count: kit.passwordCount(length, PASSWORD_MIN_LENGTH) }
        : {})}
      {...(feedback.kind === "password-refused"
        ? { error: kit.fieldError(feedback.issue) }
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
  readonly feedback: ResetFeedback;
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

function SubmitArea({ reset }: { readonly reset: ResetPassword }) {
  const copy = useAccountResetCopy();
  const kit = useAccountKitCopy();
  const { feedback } = reset;
  const isRetry =
    feedback.kind === "unavailable" || feedback.kind === "unanswered";
  const wait = waitOf(reset);
  return (
    <SubmitButton
      label={isRetry ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={reset.isBusy}
      isOff={reset.tokenStatus !== "present"}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}

/** A short limit is counted down on the button; a longer one is told in the notice and the button stays ready. */
function waitOf({
  feedback,
  clearFeedback,
}: ResetPassword): SubmitWait | undefined {
  if (
    feedback.kind !== "rate-limited" ||
    feedback.countdownSeconds === undefined
  ) {
    return undefined;
  }
  return { seconds: feedback.countdownSeconds, onElapsed: clearFeedback };
}

/** Frame A6A: a link that held a token starts the person at the password. */
function useFocusPasswordWhenReady(
  { tokenStatus }: ResetPassword,
  password: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    if (tokenStatus === "present") password.current?.focus();
  }, [tokenStatus, password]);
}

/** After an answer, focus goes where the person must look: the password to correct, or the notice that now heads the
 *  form. It moves once per answer, and never while the person types. */
function useMoveFocusOnAnswer(
  request: ResetFocusRequest | undefined,
  targets: AskingFocusTargets,
): void {
  useEffect(() => {
    if (request === undefined || request.target === "nowhere") return;
    targets[request.target].current?.focus();
  }, [request, targets]);
}
