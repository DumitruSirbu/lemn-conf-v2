"use client";

import {
  countPasswordCharacters,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import {
  createRef,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import type { AccountFieldIssue } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useAccountPasswordCopy } from "@/i18n/use-content";

import { isRetryable } from "../account-answer";
import { useMoveFocusOnAnswer } from "../account-focus";
import {
  AccountForm,
  FormNotice,
  OutcomeHero,
  PasswordField,
  RateLimitNotice,
  SubmitButton,
  waitOfFeedback,
} from "../account-form-parts";
import { useFocusOnMount } from "../account-outcome-screens";
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
  useChangePassword,
  type ChangePassword,
  type ChangePasswordFeedback,
  type ChangePasswordField,
} from "./use-change-password";

// "Schimbă parola" (Lot 2 frames A11A to A11G): the current password and the new one, nothing else. There is no
// "repeat the password" field, and the show / hide control on each box is the check against a typing slip. A change
// ends every session of the account but this device's, which the server replaces on the same response, so the
// success says so and the person stays signed in. When that replacement could not be made, the person is told the
// password was changed and is asked to sign in. Every link is a plain anchor, as on every account page.

export interface ChangePasswordFormProps {
  readonly locale: AppLocale;
}

export function ChangePasswordForm({ locale }: ChangePasswordFormProps) {
  const change = useChangePassword(locale);
  switch (change.feedback.kind) {
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "changed":
      return (
        <PasswordFrame locale={locale}>
          <ChangedScreen locale={locale} />
        </PasswordFrame>
      );
    case "changed-sign-in":
      return (
        <PasswordFrame locale={locale}>
          <ChangedSignInScreen locale={locale} />
        </PasswordFrame>
      );
    default:
      return (
        <PasswordFrame locale={locale}>
          <AskingScreen change={change} />
        </PasswordFrame>
      );
  }
}

/** The page when the server could not read the session: nobody can say whether it is live, so the form is not drawn,
 *  and the way on is the page asked for again. */
export function ChangePasswordUnavailableScreen({
  locale,
}: ChangePasswordFormProps) {
  const copy = useAccountPasswordCopy();
  const kit = useAccountKitCopy();
  return (
    <PasswordFrame locale={locale}>
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
    </PasswordFrame>
  );
}

function PasswordFrame({
  locale,
  children,
}: {
  readonly locale: AppLocale;
  readonly children: ReactNode;
}) {
  return (
    <AccountShell locale={locale} page="password">
      {children}
    </AccountShell>
  );
}

/** Frame A11E: the change is made and this device stays signed in. */
function ChangedScreen({ locale }: ChangePasswordFormProps) {
  const copy = useAccountPasswordCopy();
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
        <PrimaryLink href={accountPathOf(locale, "profile")}>
          {copy.backToProfile}
        </PrimaryLink>
      </AccountActions>
    </>
  );
}

/** The change is made but this device's new session could not be started: the server ended the one it had, so the way
 *  on is the sign-in page, by a document load. */
function ChangedSignInScreen({ locale }: ChangePasswordFormProps) {
  const copy = useAccountPasswordCopy();
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
          {copy.changedSignInBody}
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

function createFocusTargets() {
  return {
    currentPassword: createRef<HTMLInputElement>(),
    newPassword: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

function AskingScreen({ change }: { readonly change: ChangePassword }) {
  const copy = useAccountPasswordCopy();
  const [targets] = useState(createFocusTargets);
  useFocusCurrentPasswordOnMount(targets.currentPassword);
  useMoveFocusOnAnswer(change.focusRequest, targets);
  return (
    <AccountForm onSubmit={change.submit} isBusy={change.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <FeedbackNotice feedback={change.feedback} noticeRef={targets.notice} />
        <CurrentPasswordField
          change={change}
          inputRef={targets.currentPassword}
        />
        <NewPasswordField change={change} inputRef={targets.newPassword} />
      </AccountPane>
      <AccountActions>
        <SubmitArea change={change} />
      </AccountActions>
    </AccountForm>
  );
}

/** The page opens on the first question it asks (frame A11A draws the field focused). */
function useFocusCurrentPasswordOnMount(
  currentPassword: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    currentPassword.current?.focus();
  }, [currentPassword]);
}

/** The refusal standing against a field, if any: the first one the field has. */
function issueOf(
  { feedback }: ChangePassword,
  field: ChangePasswordField,
): AccountFieldIssue | undefined {
  return feedback.kind === "fields-refused"
    ? feedback.issues.find((issue) => issue.field === field)
    : undefined;
}

interface FieldProps {
  readonly change: ChangePassword;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

/** The password that exists: its refusal is the server's `wrong-password`, said in the page's words. */
function CurrentPasswordField({ change, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountPasswordCopy();
  const issue = issueOf(change, "currentPassword");
  const error = currentPasswordErrorOf({
    isWrong: change.feedback.kind === "wrong-password",
    issue,
    wrongSentence: copy.currentPasswordWrong,
    sentenceOf: kit.fieldError,
  });
  return (
    <PasswordField
      label={copy.currentPasswordLabel}
      name="currentPassword"
      autoComplete="current-password"
      value={change.values.currentPassword}
      onChange={(value) => {
        change.editField("currentPassword", value);
      }}
      {...(error === undefined ? {} : { error })}
      inputRef={inputRef}
    />
  );
}

function currentPasswordErrorOf({
  isWrong,
  issue,
  wrongSentence,
  sentenceOf,
}: {
  readonly isWrong: boolean;
  readonly issue: AccountFieldIssue | undefined;
  readonly wrongSentence: string;
  readonly sentenceOf: (issue: AccountFieldIssue) => string;
}): string | undefined {
  if (isWrong) return wrongSentence;
  return issue === undefined ? undefined : sentenceOf(issue);
}

/** The password is chosen here, so its length is counted live while it is shorter than the rule asks. */
function NewPasswordField({ change, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountPasswordCopy();
  const issue = issueOf(change, "newPassword");
  const length = countPasswordCharacters(change.values.newPassword);
  const isCounting = length > 0 && length < PASSWORD_MIN_LENGTH;
  return (
    <PasswordField
      label={copy.newPasswordLabel}
      name="newPassword"
      autoComplete="new-password"
      value={change.values.newPassword}
      onChange={(value) => {
        change.editField("newPassword", value);
      }}
      hint={kit.passwordHint}
      {...(isCounting
        ? { count: kit.passwordCount(length, PASSWORD_MIN_LENGTH) }
        : {})}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The form-level message: the summary of both fields refused, a limit, an unavailable service, a request that got no
 *  answer or one that failed. A single refused field, and a wrong current password, are said beside the field and
 *  need no summary. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: ChangePasswordFeedback;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const kit = useAccountKitCopy();
  switch (feedback.kind) {
    case "fields-refused": {
      const count = new Set(feedback.issues.map((issue) => issue.field)).size;
      return count > 1 ? (
        <FormNotice tone="error" ref={noticeRef}>
          {kit.fieldSummary(count)}
        </FormNotice>
      ) : null;
    }
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
    case "none":
    case "wrong-password":
    case "changed":
    case "changed-sign-in":
    case "forbidden":
      return null;
  }
}

function SubmitArea({ change }: { readonly change: ChangePassword }) {
  const copy = useAccountPasswordCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(change.feedback, change.clearFeedback);
  return (
    <SubmitButton
      label={isRetryable(change.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={change.isBusy}
      isOff={false}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}
