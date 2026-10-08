export {
  CONSENT_TEXT_VERSIONS,
  CONTACT_CHANNELS,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LOCALITY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  validateContactFields,
  type ConsentTextVersion,
  type ContactChannel,
  type ContactField,
  type ContactFieldCode,
  type ContactFields,
  type ContactFieldsInput,
  type ContactFieldsValidation,
  type ContactIssue,
} from "./contact-fields.js";
export {
  normalisePhoneNumber,
  type PhoneNumberResult,
  type PhoneRefusalCode,
} from "./phone-number.js";
export {
  CONTACT_INTENTS,
  validateContactSubmission,
  type ContactIntent,
  type ContactSubmissionRequest,
  type ContactSubmissionValidation,
  type DesignReference,
  type SubmissionCode,
  type SubmissionField,
  type SubmissionIssue,
  type SubmissionTarget,
} from "./contact-submission.js";
export {
  holdsNothingLemnariaSupplies,
  judgeSubmissionEligibility,
  SubmissionFactsContradictionError,
  type SubmissionEligibility,
  type SubmissionFacts,
  type SubmissionRefusal,
} from "./submission-eligibility.js";
export {
  snapshotSubmission,
  SubmissionDesignInvalidError,
  type SubmissionSnapshot,
  type SubmissionSnapshotRequest,
  type SubmissionSnapshotResult,
} from "./submission-snapshot.js";
