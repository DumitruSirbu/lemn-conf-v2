"use client";

import {
  countPasswordCharacters,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import { createRef, useState, type RefObject } from "react";

import type { AccountFieldIssue, AccountIssueField } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountCheckInboxCopy,
  useAccountKitCopy,
  useAccountRegisterCopy,
} from "@/i18n/use-content";

import { isRetryable } from "./account-answer";
import { useMoveFocusOnAnswer } from "./account-focus";
import {
  AccountForm,
  AccountLink,
  ChallengedSubmit,
  ChallengeField,
  FormNotice,
  InlineLink,
  LegalLine,
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
import { CheckInboxView } from "./check-inbox-view";
import {
  useRegisterAccount,
  type RegisterAccount,
  type RegisterFeedback,
} from "./use-register-account";

// The register page (Lot 1 frames A1A to A1H) and, once the server accepts, the "check your e-mail" screen (A2A) in the
// same page. It asks for an address, a password and, if the person likes, a phone. There is no consent box: the
// notice is linked, and the version the account records is the one that link stands for.

/** The notice's page: its own document, opened beside the form so what was typed survives. */
const PRIVACY_NOTICE_PATH_SEGMENT = "privacy-notice";

export interface RegisterFormProps {
  readonly locale: AppLocale;
  /** `TURNSTILE_SITE_KEY` and the request's nonce, read on the server (`readChallengePageProps`). */
  readonly siteKey: string | undefined;
  readonly nonce: string | undefined;
}

export function RegisterForm(props: RegisterFormProps) {
  const register = useRegisterAccount(props.locale);
  const registerCopy = useAccountRegisterCopy();
  const inboxCopy = useAccountCheckInboxCopy();
  const isCheckingInbox = register.feedback.kind === "check-inbox";
  return (
    <AccountShell
      locale={props.locale}
      page="register"
      headerTitle={
        isCheckingInbox ? inboxCopy.headerTitle : registerCopy.headerTitle
      }
    >
      <RegisterScreen register={register} {...props} />
    </AccountShell>
  );
}

function RegisterScreen({
  register,
  ...page
}: RegisterFormProps & { readonly register: RegisterAccount }) {
  const { feedback } = register;
  switch (feedback.kind) {
    case "check-inbox":
      return (
        <CheckInboxView
          locale={page.locale}
          address={feedback.address}
          onWrongAddress={register.editAgain}
        />
      );
    case "request-failed":
      return <RequestFailedScreen locale={page.locale} />;
    default:
      return <AskingScreen register={register} {...page} />;
  }
}

function createFocusTargets() {
  return {
    email: createRef<HTMLInputElement>(),
    password: createRef<HTMLInputElement>(),
    phone: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

type FocusTargets = ReturnType<typeof createFocusTargets>;

function AskingScreen({
  register,
  locale,
  siteKey,
  nonce,
}: RegisterFormProps & { readonly register: RegisterAccount }) {
  const copy = useAccountRegisterCopy();
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(register.focusRequest, targets);
  return (
    <AccountForm onSubmit={register.submit} isBusy={register.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.body} />
        <FeedbackNotice
          feedback={register.feedback}
          noticeRef={targets.notice}
        />
        <Fields register={register} targets={targets} />
        <ChallengeField
          siteKey={siteKey}
          nonce={nonce}
          action="register"
          onTokenChange={register.receiveToken}
          resetCount={register.resetCount}
          isRefused={register.feedback.kind === "challenge-failed"}
          onUnavailable={register.markChallengeUnavailable}
        />
      </AccountPane>
      <AccountActions>
        <NoticeLine locale={locale} />
        <SubmitArea register={register} />
        <ActionsLine lead={copy.haveAccount}>
          <AccountLink href={accountPathOf(locale, "login")}>
            {copy.logIn}
          </AccountLink>
        </ActionsLine>
      </AccountActions>
    </AccountForm>
  );
}

function Fields({
  register,
  targets,
}: {
  readonly register: RegisterAccount;
  readonly targets: FocusTargets;
}) {
  return (
    <>
      <EmailField register={register} inputRef={targets.email} />
      <NewPasswordField register={register} inputRef={targets.password} />
      <PhoneField register={register} inputRef={targets.phone} />
    </>
  );
}

/** The refusal standing against a field, if any: the first one the field has. */
function issueOf(
  { feedback }: RegisterAccount,
  field: AccountIssueField,
): AccountFieldIssue | undefined {
  return feedback.kind === "fields-refused"
    ? feedback.issues.find((issue) => issue.field === field)
    : undefined;
}

interface FieldProps {
  readonly register: RegisterAccount;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

function EmailField({ register, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const issue = issueOf(register, "email");
  return (
    <TextField
      label={kit.emailLabel}
      name="email"
      type="email"
      autoComplete="email"
      placeholder={kit.emailPlaceholder}
      value={register.email}
      onChange={(value) => {
        register.editField("email", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The password is chosen here, so its length is counted live while it is shorter than the rule asks. */
function NewPasswordField({ register, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const issue = issueOf(register, "password");
  const length = countPasswordCharacters(register.password);
  const isCounting = length > 0 && length < PASSWORD_MIN_LENGTH;
  return (
    <PasswordField
      label={kit.passwordLabel}
      name="password"
      autoComplete="new-password"
      value={register.password}
      onChange={(value) => {
        register.editField("password", value);
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

/** Optional, unverified, and said so: no code is sent to it. */
function PhoneField({ register, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountRegisterCopy();
  const issue = issueOf(register, "phone");
  return (
    <TextField
      label={copy.phoneLabel}
      name="phone"
      type="tel"
      autoComplete="tel"
      placeholder={copy.phonePlaceholder}
      value={register.phone}
      onChange={(value) => {
        register.editField("phone", value);
      }}
      hint={copy.phoneHint}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The form-level message: the summary of several refused fields, a limit, an unavailable service or a request that
 *  got no answer. A single refused field is said beside the field and needs no summary. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: RegisterFeedback;
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
    default:
      return null;
  }
}

/** The line above the primary action: what creating the account means for the person's data, and the notice it names.
 *  The link is a document of its own, so it opens beside the form and says so. */
function NoticeLine({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountRegisterCopy();
  return (
    <LegalLine>
      {copy.legal((chunks) => (
        <InlineLink href={`/${locale}/${PRIVACY_NOTICE_PATH_SEGMENT}`} isNewTab>
          {chunks}
        </InlineLink>
      ))}{" "}
      {copy.noticeNewTab}
    </LegalLine>
  );
}

function SubmitArea({ register }: { readonly register: RegisterAccount }) {
  const copy = useAccountRegisterCopy();
  const kit = useAccountKitCopy();
  return (
    <ChallengedSubmit
      label={isRetryable(register.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={register.isBusy}
      hasToken={register.hasToken}
      isChallengeUnavailable={register.isChallengeUnavailable}
      wait={waitOfFeedback(register.feedback)}
    />
  );
}
