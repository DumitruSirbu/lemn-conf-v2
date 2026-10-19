"use client";

import { createRef, useState, type ReactNode, type RefObject } from "react";

import type { AccountFieldIssue } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useAccountKitCopy, useAccountProfileCopy } from "@/i18n/use-content";

import { isRetryable } from "../account-answer";
import { useMoveFocusOnAnswer } from "../account-focus";
import {
  AccountForm,
  FormNotice,
  RateLimitNotice,
  SubmitButton,
  TextField,
  waitOfFeedback,
} from "../account-form-parts";
import {
  AccountActions,
  AccountHeading,
  AccountPane,
  AccountShell,
  PrimaryAction,
} from "../account-shell";
import { ForbiddenScreen } from "../forbidden-screen";
import styles from "./profile.module.css";
import { ProfileRows } from "./profile-rows";
import {
  useProfileSave,
  type ProfileFeedback,
  type ProfileSave,
} from "./use-profile-save";
import type { ProfileField, ProfileValues } from "./profile-values";

// "Profil" (Lot 2 frames A10A to A10D and A10H): the optional name, address and phone a signed-in account keeps, and its
// address as text. It is drawn filled from the server, and a save sends only what changed. The address cannot be changed
// here yet, and the page says nothing of a way to. Every link is a plain anchor, as on every account page.

export interface ProfileFormProps {
  readonly locale: AppLocale;
  /** The account's address, as the session holds it. */
  readonly email: string;
  /** What the server holds now. */
  readonly profile: ProfileValues;
}

export function ProfileForm({ locale, email, profile }: ProfileFormProps) {
  const save = useProfileSave(profile, locale);
  if (save.feedback.kind === "forbidden") {
    return <ForbiddenScreen locale={locale} />;
  }
  return (
    <ProfileFrame locale={locale}>
      <ProfileScreen locale={locale} email={email} save={save} />
    </ProfileFrame>
  );
}

/** The page when the server could not read the details: nothing is known of them, so the form is not drawn (a save
 *  from it could clear what it never showed), and the way on is the page asked for again. */
export function ProfileUnavailableScreen({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const copy = useAccountProfileCopy();
  const kit = useAccountKitCopy();
  return (
    <ProfileFrame locale={locale}>
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
    </ProfileFrame>
  );
}

function ProfileFrame({
  locale,
  children,
}: {
  readonly locale: AppLocale;
  readonly children: ReactNode;
}) {
  return (
    <AccountShell locale={locale} page="profile">
      {children}
    </AccountShell>
  );
}

function createFocusTargets() {
  return {
    name: createRef<HTMLInputElement>(),
    address: createRef<HTMLInputElement>(),
    phone: createRef<HTMLInputElement>(),
    notice: createRef<HTMLDivElement>(),
  };
}

function ProfileScreen({
  locale,
  email,
  save,
}: {
  readonly locale: AppLocale;
  readonly email: string;
  readonly save: ProfileSave;
}) {
  const copy = useAccountProfileCopy();
  const [targets] = useState(createFocusTargets);
  useMoveFocusOnAnswer(save.focusRequest, targets);
  return (
    <AccountForm onSubmit={save.submit} isBusy={save.isBusy}>
      <AccountPane>
        <AccountHeading title={copy.title} />
        <FeedbackNotice feedback={save.feedback} noticeRef={targets.notice} />
        <NameField save={save} inputRef={targets.name} />
        <AddressField save={save} inputRef={targets.address} />
        <EmailText email={email} />
        <PhoneField save={save} inputRef={targets.phone} />
        <ProfileRows locale={locale} />
      </AccountPane>
      <AccountActions>
        <SubmitArea save={save} />
      </AccountActions>
    </AccountForm>
  );
}

/** The refusal standing against a field, if any: the first one the field has. */
function issueOf(
  { feedback }: ProfileSave,
  field: ProfileField,
): AccountFieldIssue | undefined {
  return feedback.kind === "fields-refused"
    ? feedback.issues.find((issue) => issue.field === field)
    : undefined;
}

interface FieldProps {
  readonly save: ProfileSave;
  readonly inputRef: RefObject<HTMLInputElement | null>;
}

function NameField({ save, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountProfileCopy();
  const issue = issueOf(save, "name");
  return (
    <TextField
      label={copy.nameLabel}
      name="name"
      type="text"
      autoComplete="name"
      autoCapitalize="words"
      spellCheck
      placeholder={copy.namePlaceholder}
      value={save.values.name}
      onChange={(value) => {
        save.editField("name", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

function AddressField({ save, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountProfileCopy();
  const issue = issueOf(save, "address");
  return (
    <TextField
      label={copy.addressLabel}
      name="address"
      type="text"
      autoComplete="street-address"
      autoCapitalize="words"
      spellCheck
      placeholder={copy.addressPlaceholder}
      value={save.values.address}
      onChange={(value) => {
        save.editField("address", value);
      }}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** Optional, unverified, and said so: no code is sent to it. Emptied and saved, it is withdrawn. */
function PhoneField({ save, inputRef }: FieldProps) {
  const kit = useAccountKitCopy();
  const copy = useAccountProfileCopy();
  const issue = issueOf(save, "phone");
  return (
    <TextField
      label={copy.phoneLabel}
      name="phone"
      type="tel"
      autoComplete="tel"
      placeholder={copy.phonePlaceholder}
      value={save.values.phone}
      onChange={(value) => {
        save.editField("phone", value);
      }}
      hint={copy.phoneHint}
      {...(issue === undefined ? {} : { error: kit.fieldError(issue) })}
      inputRef={inputRef}
    />
  );
}

/** The account's address, as text: it is what the person signs in with, and this page does not change it. */
function EmailText({ email }: { readonly email: string }) {
  const kit = useAccountKitCopy();
  return (
    <div className={styles.readOnly}>
      <span className={styles.readOnlyLabel}>{kit.emailLabel}</span>
      <span className={styles.readOnlyValue}>{email}</span>
    </div>
  );
}

/** The form-level message: "Salvat", "Nimic de salvat", the summary of several refused fields, a limit, an unavailable
 *  service, a request that got no answer or one that failed. A single refused field is said beside the field and
 *  needs no summary. */
function FeedbackNotice({
  feedback,
  noticeRef,
}: {
  readonly feedback: ProfileFeedback;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const kit = useAccountKitCopy();
  const copy = useAccountProfileCopy();
  switch (feedback.kind) {
    case "saved":
      return <FormNotice tone="success">{copy.saved}</FormNotice>;
    case "unchanged":
      return <FormNotice tone="info">{copy.nothingToSave}</FormNotice>;
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
    case "forbidden":
      return null;
  }
}

function SubmitArea({ save }: { readonly save: ProfileSave }) {
  const copy = useAccountProfileCopy();
  const kit = useAccountKitCopy();
  const wait = waitOfFeedback(save.feedback, save.clearFeedback);
  return (
    <SubmitButton
      label={isRetryable(save.feedback) ? kit.retry : copy.submit}
      busyLabel={copy.submitting}
      isBusy={save.isBusy}
      isOff={false}
      {...(wait === undefined ? {} : { wait })}
    />
  );
}
