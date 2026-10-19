"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  useAccountKitCopy,
  useAccountShellCopy,
  useAccountVerifyCopy,
} from "@/i18n/use-content";

import { isRetryable } from "./account-answer";
import {
  createPasswordPageTargets,
  useFocusPasswordWhenReady,
  useMoveFocusOnAnswer,
} from "./account-focus";
import {
  AccountForm,
  FormNotice,
  InlineLink,
  OutcomeHero,
  PasswordField,
  RateLimitNotice,
  SubmitButton,
  waitOfFeedback,
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
  SecondaryAction,
  startPathOf,
} from "./account-shell";
import { ClaimDialog } from "./claim-dialog";
import { onSignedIn } from "./on-signed-in";
import {
  useVerifyEmail,
  type VerifyEmail,
  type VerifyFeedback,
} from "./use-verify-email";

// The confirm-address page (Lot 1 frames A3A to A3G). The e-mail's link brings a token in the address fragment; the page
// takes it out of the address at once and asks for the password the account was made with. It says one thing when
// the link or the password is wrong, whichever it was, because the server answers all of it alike. It loads nothing
// from any other origin and draws no challenge. Its language links are left out: a new document in the other language
// would have no token to read (Lot 1 review, P3).

export interface VerifyEmailFormProps {
  readonly locale: AppLocale;
}

/** How long the confirmation stays on screen before the document is replaced (frame A3G: about a second). */
const CONFIRMED_SCREEN_MS = 1_000;

export function VerifyEmailForm({ locale }: VerifyEmailFormProps) {
  const verify = useVerifyEmail();
  const copy = useAccountVerifyCopy();
  return (
    <AccountShell locale={locale} headerTitle={copy.headerTitle}>
      <VerifyScreen verify={verify} locale={locale} />
    </AccountShell>
  );
}

/** The server renders and the client hydrates the form (`reading`); the invalid-link screen can only come after the
 *  client has looked at the address, so a valid link never flashes it. */
function VerifyScreen({
  verify,
  locale,
}: VerifyEmailFormProps & { readonly verify: VerifyEmail }) {
  const { feedback } = verify;
  if (feedback.kind === "signed-in") {
    return <ConfirmedScreen locale={locale} claimable={feedback.claimable} />;
  }
  if (feedback.kind === "request-failed") {
    return <TokenRequestFailedScreen locale={locale} />;
  }
  return verify.tokenStatus === "absent" ? (
    <InvalidLinkScreen locale={locale} />
  ) : (
    <AskingScreen verify={verify} locale={locale} />
  );
}

/** Frame A3G. The session is already set; the page shows it, then leaves for the configurator. */
function ConfirmedScreen({
  locale,
  claimable,
}: VerifyEmailFormProps & { readonly claimable: number }) {
  const copy = useAccountVerifyCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [claimableCount, askToClaim] = useState<number>();
  // The confirm page is reached from an e-mail, so there is no kitchen to go back to.
  const destination = useMemo(
    () => ({ locale, returnPath: undefined }),
    [locale],
  );
  useFocusOnMount(headingRef);
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      onSignedIn({ ...destination, claimable }, askToClaim);
    }, CONFIRMED_SCREEN_MS);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [destination, claimable]);
  return (
    <>
      <AccountPane>
        <OutcomeHero
          tone="success"
          title={copy.confirmedTitle}
          headingRef={headingRef}
        >
          {copy.confirmedBody}
        </OutcomeHero>
      </AccountPane>
      {claimableCount === undefined ? null : (
        <ClaimDialog destination={destination} count={claimableCount} />
      )}
    </>
  );
}

/** Frame A3D: no usable token in the address. The same sentence as a refused confirmation, and no form. */
function InvalidLinkScreen({ locale }: VerifyEmailFormProps) {
  const copy = useAccountVerifyCopy();
  const shell = useAccountShellCopy();
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(noticeRef);
  return (
    <>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <FormNotice tone="error" ref={noticeRef}>
          <InvalidLinkSentence locale={locale} />
        </FormNotice>
      </AccountPane>
      <AccountActions>
        <SecondaryAction href={startPathOf(locale)}>
          {shell.backToConfigurator}
        </SecondaryAction>
      </AccountActions>
    </>
  );
}

/** The one sentence for a link or password that is not valid, with the way to sign in for a person who confirmed. */
function InvalidLinkSentence({ locale }: VerifyEmailFormProps) {
  const copy = useAccountVerifyCopy();
  return copy.invalidLink((chunks) => (
    <InlineLink href={accountPathOf(locale, "login")}>{chunks}</InlineLink>
  ));
}

function AskingScreen({
  verify,
  locale,
}: VerifyEmailFormProps & { readonly verify: VerifyEmail }) {
  const copy = useAccountVerifyCopy();
  const kit = useAccountKitCopy();
  const [targets] = useState(createPasswordPageTargets);
  useFocusPasswordWhenReady(verify.tokenStatus, targets.password);
  useMoveFocusOnAnswer(verify.focusRequest, targets);
  return (
    <AccountForm onSubmit={verify.submit} isBusy={verify.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} lead={copy.lead} />
        <FeedbackNotice
          feedback={verify.feedback}
          locale={locale}
          noticeRef={targets.notice}
        />
        <PasswordField
          label={kit.passwordLabel}
          name="password"
          autoComplete="current-password"
          value={verify.password}
          onChange={verify.editPassword}
          {...(verify.feedback.kind === "password-required"
            ? {
                error: kit.fieldError({
                  field: "password",
                  code: "PASSWORD_REQUIRED",
                }),
              }
            : {})}
          inputRef={targets.password}
        />
      </AccountPane>
      <AccountActions>
        <SubmitArea verify={verify} />
      </AccountActions>
    </AccountForm>
  );
}

/** The note that heads the form: the answer's. A single empty password is said beside the field and needs none. */
function FeedbackNotice({
  feedback,
  locale,
  noticeRef,
}: {
  readonly feedback: VerifyFeedback;
  readonly locale: AppLocale;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const kit = useAccountKitCopy();
  switch (feedback.kind) {
    case "link-or-password-invalid":
      return (
        <FormNotice tone="error" ref={noticeRef}>
          <InvalidLinkSentence locale={locale} />
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

function SubmitArea({ verify }: { readonly verify: VerifyEmail }) {
  const copy = useAccountVerifyCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(verify.feedback);
  return (
    <SubmitButton
      label={isRetryable(verify.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={verify.isBusy}
      isOff={verify.tokenStatus !== "present"}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}
