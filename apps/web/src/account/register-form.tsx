"use client";

import {
  countPasswordCharacters,
  PASSWORD_MIN_LENGTH,
} from "@lemnaria/configurator-domain";
import {
  createRef,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { AccountFieldIssue, AccountIssueField } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountCheckInboxCopy,
  useAccountKitCopy,
  useAccountRegisterCopy,
} from "@/i18n/use-content";

import {
  AccountForm,
  AccountLink,
  ChallengeField,
  FormHint,
  FormNotice,
  InlineLink,
  LegalLine,
  PasswordField,
  RateLimitNotice,
  SubmitButton,
  TextField,
  type SubmitWait,
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
  type FocusRequest,
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

type InputRefs = Readonly<
  Record<AccountIssueField, RefObject<HTMLInputElement | null>>
>;

function createInputRefs(): InputRefs {
  return {
    email: createRef<HTMLInputElement>(),
    password: createRef<HTMLInputElement>(),
    phone: createRef<HTMLInputElement>(),
  };
}

function AskingScreen({
  register,
  locale,
  siteKey,
  nonce,
}: RegisterFormProps & { readonly register: RegisterAccount }) {
  const copy = useAccountRegisterCopy();
  const [inputRefs] = useState(createInputRefs);
  const noticeRef = useRef<HTMLDivElement>(null);
  useMoveFocusOnAnswer(register.focusRequest, { inputRefs, noticeRef });
  return (
    <AccountForm onSubmit={register.submit} isBusy={register.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.body} />
        <FeedbackNotice feedback={register.feedback} noticeRef={noticeRef} />
        <Fields register={register} inputRefs={inputRefs} />
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
  inputRefs,
}: {
  readonly register: RegisterAccount;
  readonly inputRefs: InputRefs;
}) {
  return (
    <>
      <EmailField register={register} inputRef={inputRefs.email} />
      <NewPasswordField register={register} inputRef={inputRefs.password} />
      <PhoneField register={register} inputRef={inputRefs.phone} />
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

/**
 * The primary action and, while it waits for a challenge token, the line that says why it is off. When the challenge
 * slot has said it cannot load, that is the reason and it is already on the page: the waiting line would contradict it.
 */
function SubmitArea({ register }: { readonly register: RegisterAccount }) {
  const copy = useAccountRegisterCopy();
  const kit = useAccountKitCopy();
  const reasonId = useId();
  const wait = waitOf(register);
  const isWaitingForChallenge =
    !register.hasToken && !register.isBusy && !register.isChallengeUnavailable;
  const isRetry =
    register.feedback.kind === "unavailable" ||
    register.feedback.kind === "unanswered";
  return (
    <>
      <SubmitButton
        label={isRetry ? kit.retry : copy.submit}
        busyLabel={copy.submitting}
        isBusy={register.isBusy}
        isOff={!register.hasToken}
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
function waitOf(register: RegisterAccount): SubmitWait | undefined {
  const { feedback } = register;
  if (
    feedback.kind !== "rate-limited" ||
    feedback.countdownSeconds === undefined
  ) {
    return undefined;
  }
  return {
    seconds: feedback.countdownSeconds,
    onElapsed: register.clearFeedback,
  };
}

interface FocusTargets {
  readonly inputRefs: InputRefs;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}

/** After an answer, focus goes where the person must look: the one refused field, or the notice that now heads the
 *  form. It moves once per answer, and never while the person types. */
function useMoveFocusOnAnswer(
  request: FocusRequest | undefined,
  { inputRefs, noticeRef }: FocusTargets,
): void {
  useEffect(() => {
    if (request === undefined) return;
    switch (request.target) {
      case "notice":
        noticeRef.current?.focus();
        return;
      case "nowhere":
        return;
      default:
        inputRefs[request.target].current?.focus();
        return;
    }
  }, [request, inputRefs, noticeRef]);
}
