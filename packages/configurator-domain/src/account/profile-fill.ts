import type { ContactFields } from "../contact/contact-fields.js";

import type { RegisteredPhone } from "./account-fields.js";

/**
 * What a judged contact request offers an account's empty profile fields (ADR 0179 d2). `address` is the request's
 * locality and is absent when the customer left it empty: an empty locality never clears or writes the profile.
 */
export interface ProfileFill {
  readonly name: string;
  readonly address: string | undefined;
  /** Entered and normal form travel together, as the profile's two phone columns do. */
  readonly phone: RegisteredPhone;
}

/** Reads the fill from the fields `validateContactFields` accepted, never from the raw request. */
export function profileFillOf(contact: ContactFields): ProfileFill {
  return {
    name: contact.name,
    address: contact.locality === "" ? undefined : contact.locality,
    phone: { entered: contact.phone, normalForm: contact.phoneNormalForm },
  };
}
