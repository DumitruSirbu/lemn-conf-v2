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
