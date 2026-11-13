import {
  CONSENT_TEXT_VERSIONS,
  validateContactFields,
  validateContactSubmission,
  type ConsentTextVersion,
  type ContactChannel,
  type ContactFieldCode,
  type ContactFieldsInput,
  type ContactIntent,
  type ContactSubmissionRequest,
  type DesignReference,
  type SubmissionIssue,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";

import { routing, type AppLocale } from "@/i18n/routing";

// The contact form as a value: what the customer typed, which errors are showing, and the body that is sent. No
// React and no copy. Every rule is the domain's: a field is judged by `validateContactFields` and the whole body by
// `validateContactSubmission`, so the form holds no rule, no length and no code list of its own.

/** The form's fields in the order a refused submit looks for the first invalid one. */
export const CONTACT_FORM_FIELDS = [
  "name",
  "phone",
  "locality",
  "email",
  "consent",
] as const;
export type ContactFormField = (typeof CONTACT_FORM_FIELDS)[number];
export type ContactTextField = Exclude<ContactFormField, "consent">;

/** The consent text this form shows; the request states which one, and the domain refuses any not published. */
export const SHOWN_CONSENT_TEXT_VERSION: ConsentTextVersion =
  CONSENT_TEXT_VERSIONS[0];

export interface ContactFormValues {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly channel: ContactChannel;
  /** Kept while another channel is chosen, so choosing e-mail again finds it; it is sent only for e-mail. */
  readonly email: string;
  readonly consent: boolean;
  readonly honeypot: string;
}

/** The code each showing error carries; the screen finds its sentence by the code, never shows it. */
export type ContactFormErrors = Readonly<
  Partial<Record<ContactFormField, ContactFieldCode>>
>;

export interface ContactFormState {
  readonly values: ContactFormValues;
  readonly errors: ContactFormErrors;
  /** Fields the customer has typed in or left: a profile never fills them, even if they are empty again. */
  readonly touchedFields: readonly ContactTextField[];
  /** Fields whose value is the profile's and not yet the customer's: the ones a changed session takes back. */
  readonly profileFilledFields: readonly ContactTextField[];
  /** Typed under an account that has since gone: the form names no account until the customer edits a field, so one
   *  account's details are never saved to another's profile. */
  readonly isEnteredUnderAnotherAccount: boolean;
}

/** The form fields a profile offers, and the profile field each reads: `locality` is the profile's address. */
export const PROFILE_OFFERED_FIELDS = ["name", "phone", "locality"] as const;
export type ProfileOfferedField = (typeof PROFILE_OFFERED_FIELDS)[number];

/** What the profile holds for each offered field, as text: empty for one never given. */
export type ProfileOffer = Readonly<Record<ProfileOfferedField, string>>;

/** Which of the profile's details are blank, by the form field that would fill each. */
export type ProfileBlanks = Readonly<Record<ProfileOfferedField, boolean>>;

/** The account whose profile the form was filled from, and which of its details are blank: what the line is about. */
export interface ProfileAccount {
  readonly email: string;
  readonly blanks: ProfileBlanks;
}

export type ContactFormEvent =
  | {
      readonly type: "text-changed";
      readonly field: ContactTextField;
      readonly text: string;
    }
  | { readonly type: "consent-changed"; readonly isGiven: boolean }
  | { readonly type: "channel-chosen"; readonly channel: ContactChannel }
  | { readonly type: "honeypot-filled"; readonly text: string }
  | { readonly type: "field-left"; readonly field: ContactFormField }
  | { readonly type: "profile-arrived"; readonly offer: ProfileOffer }
  | { readonly type: "profile-withdrawn" }
  | { readonly type: "account-changed" }
  | { readonly type: "submit-pressed" };

export const INITIAL_CONTACT_FORM: ContactFormState = {
  values: {
    name: "",
    phone: "",
    locality: "",
    channel: "phone",
    email: "",
    consent: false,
    honeypot: "",
  },
  errors: {},
  touchedFields: [],
  profileFilledFields: [],
  isEnteredUnderAnotherAccount: false,
};

function isContactTextField(
  field: ContactFormField,
): field is ContactTextField {
  return field !== "consent";
}

export function isContactFormField(text: string): text is ContactFormField {
  return CONTACT_FORM_FIELDS.some((field) => field === text);
}

/**
 * A field's error is judged when the field is left, each time it is left. While it has focus a showing error clears
 * as soon as the value is valid, and none appears or changes. A refused submit shows the first invalid field's error
 * and the consent's, and no error for a field never left.
 */
export function reduceContactForm(
  state: ContactFormState,
  event: ContactFormEvent,
): ContactFormState {
  switch (event.type) {
    case "text-changed":
      return withFieldTyped(
        afterEdit(
          { ...state.values, [event.field]: event.text },
          state,
          event.field,
        ),
        event.field,
      );
    case "consent-changed":
      return afterEdit(
        { ...state.values, consent: event.isGiven },
        state,
        "consent",
      );
    case "channel-chosen":
      return chooseChannel(state, event.channel);
    case "honeypot-filled":
      return { ...state, values: { ...state.values, honeypot: event.text } };
    case "field-left":
      return afterLeaving(state, event.field);
    // The profile's events are ADR 0179 d1 and d5: arrival fills blanks only, withdrawal takes the filled values back,
    // and a change of account does that and stops naming an account for what the customer typed under the last one.
    case "profile-arrived":
      return afterProfileArrived(state, event.offer);
    case "profile-withdrawn":
      return afterProfileWithdrawn(state);
    case "account-changed":
      return afterAccountChanged(state);
    case "submit-pressed":
      return afterSubmitPressed(state);
  }
}

/** The one error a field has, or none; an e-mail the channel does not use is never judged. */
export function judgeFormField(
  values: ContactFormValues,
  field: ContactFormField,
): ContactFieldCode | undefined {
  return judgeFormFields(values)[field];
}

export function firstInvalidField(
  values: ContactFormValues,
): ContactFormField | undefined {
  return firstFieldOf(judgeFormFields(values));
}

function afterEdit(
  editedValues: ContactFormValues,
  state: ContactFormState,
  field: ContactFormField,
): ContactFormState {
  const isErrorShowing = state.errors[field] !== undefined;
  const isStillInvalid = judgeFormField(editedValues, field) !== undefined;
  const errors =
    isErrorShowing && !isStillInvalid
      ? withoutError(state.errors, field)
      : state.errors;
  return { ...state, values: editedValues, errors };
}

/** Format characters (direction marks, zero-width, soft hyphen): the server removes them before it judges a text empty. */
const FORMAT_CHARACTER = /\p{Cf}/gu;

/** A text the server would read as empty: nothing, or only spaces and format characters (as `readTypedText` reads it). */
export function isBlankText(text: string | null): boolean {
  return text === null || text.replace(FORMAT_CHARACTER, "").trim() === "";
}

/** The address of the account the line names, when the form shows the line for this form as it stands: the body carries
 *  it so the server fills that account's profile and no other. */
export function shownProfileAccountEmail(
  account: ProfileAccount | undefined,
  form: ContactFormState,
): string | undefined {
  if (account === undefined || form.isEnteredUnderAnotherAccount) {
    return undefined;
  }
  return isProfileFillWanted(account.blanks, form.values)
    ? account.email
    : undefined;
}

/** Whether a profile's details would be saved by sending the form as it stands: a blank name or phone always (both are
 *  required), a blank address only when the customer gave a locality, as the server's fill does. */
export function isProfileFillWanted(
  blanks: ProfileBlanks,
  values: ContactFormValues,
): boolean {
  return (
    blanks.name ||
    blanks.phone ||
    (blanks.locality && !isBlankText(values.locality))
  );
}

function withFieldTyped(
  state: ContactFormState,
  field: ContactTextField,
): ContactFormState {
  return {
    ...state,
    isEnteredUnderAnotherAccount: false,
    touchedFields: withField(state.touchedFields, field),
    profileFilledFields: withoutField(state.profileFilledFields, field),
  };
}

/** A profile fills a field that is empty and untouched, or one it filled before and the customer has not touched. A
 *  filled value raises no error: it is judged when the field is left, like any value, and clears one a refused submit
 *  showed once it is valid. */
function afterProfileArrived(
  state: ContactFormState,
  offer: ProfileOffer,
): ContactFormState {
  return PROFILE_OFFERED_FIELDS.reduce(
    (current, field) =>
      isFillableByProfile(current, field) && !isBlankText(offer[field])
        ? withFieldFilled(current, field, offer[field])
        : current,
    state,
  );
}

function isFillableByProfile(
  state: ContactFormState,
  field: ProfileOfferedField,
): boolean {
  if (state.touchedFields.includes(field)) return false;
  return (
    state.values[field] === "" || state.profileFilledFields.includes(field)
  );
}

function withFieldFilled(
  state: ContactFormState,
  field: ProfileOfferedField,
  text: string,
): ContactFormState {
  const edited = afterEdit({ ...state.values, [field]: text }, state, field);
  return {
    ...edited,
    profileFilledFields: withField(state.profileFilledFields, field),
  };
}

/** The profile's values go back to empty, and an error that was about one goes with it. */
function afterProfileWithdrawn(state: ContactFormState): ContactFormState {
  const taken = state.profileFilledFields;
  return {
    ...state,
    values: taken.reduce(
      (values, field) => ({ ...values, [field]: "" }),
      state.values,
    ),
    errors: taken.reduce(withoutError, state.errors),
    profileFilledFields: [],
  };
}

function afterAccountChanged(state: ContactFormState): ContactFormState {
  const withdrawn = afterProfileWithdrawn(state);
  const holdsWhatWasTyped = withdrawn.touchedFields.some(
    (field) => withdrawn.values[field] !== "",
  );
  return {
    ...withdrawn,
    isEnteredUnderAnotherAccount:
      state.isEnteredUnderAnotherAccount || holdsWhatWasTyped,
  };
}

function withField(
  fields: readonly ContactTextField[],
  field: ContactTextField,
): readonly ContactTextField[] {
  return fields.includes(field) ? fields : [...fields, field];
}

function withoutField(
  fields: readonly ContactTextField[],
  field: ContactTextField,
): readonly ContactTextField[] {
  return fields.filter((kept) => kept !== field);
}

function chooseChannel(
  state: ContactFormState,
  channel: ContactChannel,
): ContactFormState {
  const errors =
    channel === "email" ? state.errors : withoutError(state.errors, "email");
  return { ...state, values: { ...state.values, channel }, errors };
}

function afterLeaving(
  state: ContactFormState,
  field: ContactFormField,
): ContactFormState {
  const code = judgeFormField(state.values, field);
  const errors =
    code === undefined
      ? withoutError(state.errors, field)
      : { ...state.errors, [field]: code };
  return {
    ...state,
    errors,
    touchedFields: isContactTextField(field)
      ? withField(state.touchedFields, field)
      : state.touchedFields,
  };
}

function afterSubmitPressed(state: ContactFormState): ContactFormState {
  const judged = judgeFormFields(state.values);
  const first = firstFieldOf(judged);
  if (first === undefined) return state;
  const shown: ContactFormErrors = {
    ...state.errors,
    ...errorsOf(judged, [first, "consent"]),
  };
  return { ...state, errors: shown };
}

function judgeFormFields(values: ContactFormValues): ContactFormErrors {
  const validation = validateContactFields(contactFieldsOf(values));
  if (validation.ok) return {};
  return validation.issues.reduce<ContactFormErrors>(
    (errors, { field, code }) =>
      isContactFormField(field) ? { ...errors, [field]: code } : errors,
    {},
  );
}

function firstFieldOf(errors: ContactFormErrors): ContactFormField | undefined {
  return CONTACT_FORM_FIELDS.find((field) => errors[field] !== undefined);
}

function errorsOf(
  errors: ContactFormErrors,
  fields: readonly ContactFormField[],
): ContactFormErrors {
  return fields.reduce<ContactFormErrors>((picked, field) => {
    const code = errors[field];
    return code === undefined ? picked : { ...picked, [field]: code };
  }, {});
}

function withoutError(
  errors: ContactFormErrors,
  field: ContactFormField,
): ContactFormErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([name]) => name !== field),
  );
}

/** The contact part of the body, as typed: the server trims and judges it again. */
export interface ContactBodyFields extends ContactFieldsInput {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly channel: ContactChannel;
  /** Present exactly when the channel is e-mail: an address the customer did not choose to be written to is not sent. */
  readonly email?: string;
  readonly consent: boolean;
  readonly consentTextVersion: ConsentTextVersion;
}

function contactFieldsOf(values: ContactFormValues): ContactBodyFields {
  const fields = {
    name: values.name,
    phone: values.phone,
    locality: values.locality,
    channel: values.channel,
    consent: values.consent,
    consentTextVersion: SHOWN_CONSENT_TEXT_VERSION,
  };
  return values.channel === "email"
    ? { ...fields, email: values.email }
    : fields;
}

/** The request body as the route reads it: a design reference or an intent, never both, and no price. */
export interface ContactSubmissionBody {
  readonly contact: ContactBodyFields;
  readonly design?: DesignReference;
  readonly intent?: ContactIntent;
  readonly clientRequestId: string;
  readonly locale: AppLocale;
  readonly honeypot: string;
  readonly elapsedMs: number;
  /** Present exactly when the form showed the profile line: the account the details would be saved to. */
  readonly profileAccountEmail?: string;
}

export interface SubmissionInput {
  readonly values: ContactFormValues;
  readonly target: SubmissionTarget;
  readonly locale: AppLocale;
  readonly clientRequestId: string;
  readonly elapsedMs: number;
  readonly profileAccountEmail?: string | undefined;
}

/** The body to send with the request the domain read from it, or the issues that refused it and nothing to send. */
export type PreparedSubmission =
  | {
      readonly ok: true;
      readonly body: ContactSubmissionBody;
      readonly request: ContactSubmissionRequest;
    }
  | { readonly ok: false; readonly issues: readonly SubmissionIssue[] };

export function prepareSubmission(input: SubmissionInput): PreparedSubmission {
  const body: ContactSubmissionBody = {
    contact: contactFieldsOf(input.values),
    ...targetPartOf(input.target),
    clientRequestId: input.clientRequestId,
    locale: input.locale,
    honeypot: input.values.honeypot,
    elapsedMs: input.elapsedMs,
    ...(input.profileAccountEmail === undefined
      ? {}
      : { profileAccountEmail: input.profileAccountEmail }),
  };
  const judgement = validateContactSubmission(body, routing.locales);
  return judgement.ok
    ? { ok: true, body, request: judgement.request }
    : { ok: false, issues: judgement.issues };
}

function targetPartOf(
  target: SubmissionTarget,
): Pick<ContactSubmissionBody, "design" | "intent"> {
  return target.kind === "design"
    ? { design: { id: target.design.id, revision: target.design.revision } }
    : { intent: target.intent };
}

/** Milliseconds from a clock that never goes back, such as `performance.now`. */
export type MonotonicClock = () => number;

/** Whole milliseconds since the form's first render, read again for every send. */
export function measureElapsedMs(
  startedAtMs: number,
  clock: MonotonicClock,
): number {
  const elapsedMs = Math.floor(clock() - startedAtMs);
  if (!Number.isFinite(elapsedMs)) {
    throw new RangeError("measureElapsedMs: the clock did not read a number");
  }
  return Math.max(0, elapsedMs);
}
