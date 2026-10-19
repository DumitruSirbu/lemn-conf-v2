"use client";

import { createRef, useMemo, useState, type RefObject } from "react";

import type { AccountFieldIssue, AccountLoginCopy } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useAccountLoginCopy } from "@/i18n/use-content";

import { isRetryable } from "./account-answer";
import { useMoveFocusOnAnswer } from "./account-focus";
import {
  AccountForm,
  AccountLink,
  ChallengedSubmit,
  ChallengeField,
  FieldLinks,
  FormNotice,
  PasswordField,
  RateLimitNotice,
  TextField,
  waitOfFeedback,
} from "./account-form-parts";
import { RequestFailedScreen } from "./account-outcome-screens";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  accountPathOf,
  ActionsLine,
} from "./account-shell";
import { ClaimDialog } from "./claim-dialog";
import type { LoginArrival } from "./login-arrival";
import {
  useSignIn,
  type LoginFeedback,
  type LoginField,
  type SignIn,
} from "./use-sign-in";

// The login page (Lot 1 frames A4A to A4G). It asks for an address and a password and says one thing when they do not
// match: the same sentence whether the address is unknown, the password wrong or the account not yet confirmed, because
// the server answers all three alike and the page must not tell them apart.

export interface LoginFormProps {
  readonly locale: AppLocale;
  /** `TURNSTILE_SITE_KEY` and the request's nonce, read on the server (`readChallengePageProps`). */
  readonly siteKey: string | undefined;
  readonly nonce: string | undefined;
  /** Why the person was sent here, if something did (frame A4G). */
  readonly arrival: LoginArrival | undefined;
  /** Where to go once signed in, if the person came from a saved kitchen: parsed on the server (`returnPathOf`). */
  readonly returnPath: string | undefined;
}

export function LoginForm(props: LoginFormProps) {
  const [claimableCount, askToClaim] = useState<number>();
  const { locale, returnPath } = props;
  const destination = useMemo(
    () => ({ locale, returnPath }),
    [locale, returnPath],
  );
  const signIn = useSignIn(destination, askToClaim);
  const copy = useAccountLoginCopy();
  return (
    <AccountShell
      locale={props.locale}
      page="login"
      headerTitle={copy.headerTitle}
    >
      {signIn.feedback.kind === "request-failed" ? (
        <RequestFailedScreen locale={props.locale} />
      ) : (
        <AskingScreen signIn={signIn} {...props} />
      )}
      {claimableCount === undefined ? null : (
        <ClaimDialog destination={destination} count={claimableCount} />
      )}
    </AccountShell>
  );
}

type AskingScreenProps = LoginFormProps & { readonly signIn: SignIn };

function AskingScreen({
  signIn,
  locale,
  siteKey,
  nonce,
  arrival,
}: AskingScreenProps) {
  const copy = useAccountLoginCopy();
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(signIn.focusRequest, targets);
  return (
    <AccountForm onSubmit={signIn.submit} isBusy={signIn.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <FeedbackNotice
          feedback={signIn.feedback}
          arrival={signIn.hasSubmitted ? undefined : arrival}
          noticeRef={targets.notice}
        />
        <EmailField signIn={signIn} inputRef={targets.email} />
        <PasswordInput signIn={signIn} inputRef={targets.password} />
        <FieldLinks>
          <AccountLink href={accountPathOf(locale, "forgot-password")}>
            {copy.forgot}
          </AccountLink>
        </FieldLinks>
        <ChallengeField
          siteKey={siteKey}
          nonce={nonce}
          action="login"
          onTokenChange={signIn.receiveToken}
          resetCount={signIn.resetCount}
          isRefused={signIn.feedback.kind === "challenge-failed"}
          onUnavailable={signIn.markChallengeUnavailable}
        />
      </AccountPane>
      <AccountActions>
        <SubmitArea signIn={signIn} />
        <ActionsLine lead={copy.noAccount}>
          <AccountLink href={accountPathOf(locale, "register")}>
            {copy.createOne}
          </AccountLink>
        </ActionsLine>
      </AccountActions>
    </AccountForm>
  );
}

/** The refusal standing against a field, if any: the first one the field has. */
function issueOf(
  { feedback }: SignIn,
  field: LoginField,
): AccountFieldIssue | undefined {
  return feedback.kind === "fields-refused"
    ? feedback.issues.find((issue) => issue.field === field)
    : undefined;
}

interface FieldProps {
  readonly signIn: SignIn;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

function EmailField({ signIn, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const issue = issueOf(signIn, "email");
  return (
    <TextField
      label={kit.emailLabel}
      name="email"
      type="email"
      autoComplete="email"
      placeholder={kit.emailPlaceholder}
      value={signIn.email}
      onChange={(value) => {
        signIn.editField("email", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The password that exists, entered: no hint and no count, since its length is no business of this page. */
function PasswordInput({ signIn, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const issue = issueOf(signIn, "password");
  return (
    <PasswordField
      label={kit.passwordLabel}
      name="password"
      autoComplete="current-password"
      value={signIn.password}
      onChange={(value) => {
        signIn.editField("password", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/**
 * The note that heads the form: the answer's, or, until there is one, why the person was sent here. A single refused
 * field is said beside the field and needs no summary; a refused challenge is said under its slot.
 */
function FeedbackNotice({
  feedback,
  arrival,
  noticeRef,
}: {
  readonly feedback: LoginFeedback;
  readonly arrival: LoginArrival | undefined;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const copy = useAccountLoginCopy();
  const kit = useAccountKitCopy();
  switch (feedback.kind) {
    case "none":
      return arrival === undefined ? null : (
        <FormNotice tone="info">{arrivalSentenceOf(arrival, copy)}</FormNotice>
      );
    case "fields-refused": {
      const count = new Set(feedback.issues.map((issue) => issue.field)).size;
      return count > 1 ? (
        <FormNotice tone="error" ref={noticeRef}>
          {kit.fieldSummary(count)}
        </FormNotice>
      ) : null;
    }
    case "invalid-credentials":
      return (
        <FormNotice tone="error" ref={noticeRef}>
          {copy.invalidCredentials}
        </FormNotice>
      );
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

/** What each reason says. A reason added to the closed list cannot be drawn with another's sentence: the switch has to
 *  name it. */
function arrivalSentenceOf(
  arrival: LoginArrival,
  copy: AccountLoginCopy,
): string {
  switch (arrival) {
    case "session-expired":
      return copy.sessionExpired;
    case "signed-out-everywhere":
      return copy.signedOutEverywhere;
  }
}

function SubmitArea({ signIn }: { readonly signIn: SignIn }) {
  const copy = useAccountLoginCopy();
  const kit = useAccountKitCopy();
  return (
    <ChallengedSubmit
      label={isRetryable(signIn.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={signIn.isBusy}
      hasToken={signIn.hasToken}
      isChallengeUnavailable={signIn.isChallengeUnavailable}
      wait={waitOfFeedback(signIn.feedback, signIn.clearFeedback)}
    />
  );
}

function createFocusTargets() {
  return {
    email: createRef<HTMLInputElement>(),
    password: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}
