"use client";

import { createRef, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { AccountFieldIssue } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import {
  useAccountEmailChangeCopy,
  useAccountKitCopy,
  useAccountPasswordCopy,
} from "@/i18n/use-content";

import { AccountDialog } from "../account-dialog";
import { useMoveFocusOnAnswer } from "../account-focus";
import {
  FormNotice,
  LinkButton,
  PasswordField,
  RateLimitNotice,
  TextField,
} from "../account-form-parts";
import {
  useChangeEmail,
  type ChangeEmail,
  type ChangeEmailFeedback,
  type ChangeEmailField,
} from "./use-change-email";

// "Schimbă e-mailul" (Lot 2 frames A10E to A10H): a sheet on the profile that asks for the new address and the current
// password, and answers the same whether or not the address can be used (A10G). Nothing changes until the link it
// sends is confirmed, so the sheet says the account keeps its old address meanwhile.
//
// Its fields are not in a `<form>`. The sheet is portalled into the profile's `<main>` from inside the profile's form,
// and React lets a `submit` event cross a portal along the component tree, so a form here would also save the profile.

/** The control that opens the sheet, beside the address it would change. */
export function ChangeEmailControl({ locale }: { readonly locale: AppLocale }) {
  const copy = useAccountEmailChangeCopy();
  const controlRef = useRef<HTMLSpanElement>(null);
  const [screen, setScreen] = useState<HTMLElement | undefined>(undefined);
  return (
    <span ref={controlRef}>
      <LinkButton
        onClick={() => {
          setScreen(controlRef.current?.closest("main") ?? document.body);
        }}
      >
        {copy.changeControl}
      </LinkButton>
      {screen === undefined
        ? null
        : createPortal(
            <ChangeEmailSheet
              locale={locale}
              onClose={() => {
                setScreen(undefined);
              }}
            />,
            screen,
          )}
    </span>
  );
}

function createFocusTargets() {
  return {
    newEmail: createRef<HTMLInputElement>(),
    currentPassword: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

/** One dialog from the question to the answer. Once the link is sent the same sheet holds its confirmation, whose one
 *  button is the one just pressed, so focus stays where it was and Escape closes. */
function ChangeEmailSheet({
  locale,
  onClose,
}: {
  readonly locale: AppLocale;
  readonly onClose: () => void;
}) {
  const copy = useAccountEmailChangeCopy();
  const change = useChangeEmail(locale);
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(change.focusRequest, targets);
  const isSent = change.feedback.kind === "sent";
  const confirm = {
    label: isSent ? copy.close : copy.send,
    busyLabel: copy.sending,
    isBusy: change.isBusy,
    onPress: isSent ? onClose : change.submit,
  };
  const wayOut = isSent
    ? { dismiss: onClose }
    : { cancel: { label: copy.cancel, onPress: onClose } };
  return (
    <AccountDialog
      kind="standard"
      title={isSent ? copy.sentTitle : copy.sheetTitle}
      announcesTitleChange
      confirm={confirm}
      initialFocusRef={targets.newEmail}
      {...wayOut}
    >
      {isSent ? (
        <FormNotice tone="info">{copy.sentBody}</FormNotice>
      ) : (
        <SheetFields change={change} targets={targets} />
      )}
    </AccountDialog>
  );
}

function SheetFields({
  change,
  targets,
}: {
  readonly change: ChangeEmail;
  readonly targets: ReturnType<typeof createFocusTargets>;
}) {
  return (
    <>
      <FeedbackNotice feedback={change.feedback} noticeRef={targets.notice} />
      <NewEmailField change={change} inputRef={targets.newEmail} />
      <CurrentPasswordField
        change={change}
        inputRef={targets.currentPassword}
      />
    </>
  );
}

/** The refusal standing against a field, if any: the first one the field has. */
function issueOf(
  { feedback }: ChangeEmail,
  field: ChangeEmailField,
): AccountFieldIssue | undefined {
  return feedback.kind === "fields-refused"
    ? feedback.issues.find((issue) => issue.field === field)
    : undefined;
}

interface FieldProps {
  readonly change: ChangeEmail;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

function NewEmailField({ change, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountEmailChangeCopy();
  const issue = issueOf(change, "newEmail");
  return (
    <TextField
      label={copy.newEmailLabel}
      name="newEmail"
      type="email"
      autoComplete="email"
      placeholder={kit.emailPlaceholder}
      value={change.values.newEmail}
      onChange={(value) => {
        change.editField("newEmail", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The password that exists: its refusal is the server's `wrong-password`, said in the password page's words. */
function CurrentPasswordField({ change, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountEmailChangeCopy();
  const passwordCopy = useAccountPasswordCopy();
  const issue = issueOf(change, "currentPassword");
  const error = currentPasswordErrorOf({
    isWrong: change.feedback.kind === "wrong-password",
    issue,
    wrongSentence: passwordCopy.currentPasswordWrong,
    sentenceOf: kit.fieldError,
  });
  return (
    <PasswordField
      label={passwordCopy.currentPasswordLabel}
      name="currentPassword"
      autoComplete="current-password"
      value={change.values.currentPassword}
      onChange={(value) => {
        change.editField("currentPassword", value);
      }}
      hint={copy.passwordHint}
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

/** The note above the fields: a limit, an unavailable service, a request that got no answer or one that failed. A
 *  refused field and a wrong password are said beside the field and need none. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: ChangeEmailFeedback;
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
    case "fields-refused":
    case "wrong-password":
    case "sent":
      return null;
  }
}
