import type { ProfileBody } from "../send-account-request";

// The three optional details a person keeps on their account, as the profile form holds them: text throughout, empty
// for one never given.

export const PROFILE_FIELDS = ["name", "address", "phone"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export type ProfileValues = Readonly<Record<ProfileField, string>>;

/** The values as the server keeps them: it trims, so a value that differs only by edge spaces is no change, and a
 *  field holding only spaces is an emptied one. */
export function trimmedValuesOf(values: ProfileValues): ProfileValues {
  return {
    name: values.name.trim(),
    address: values.address.trim(),
    phone: values.phone.trim(),
  };
}

/**
 * What a save sends: the fields that differ from what is stored. A member that is left out is left as it is, so a stored
 * value the validators would no longer accept (a phone saved under an older rule) never blocks the save of another field,
 * and an emptied field is sent as `""`, which clears it.
 */
export function changesBetween(
  stored: ProfileValues,
  edited: ProfileValues,
): ProfileBody {
  const changes: { -readonly [Field in keyof ProfileBody]: string } = {};
  for (const field of PROFILE_FIELDS) {
    if (edited[field] !== stored[field]) changes[field] = edited[field];
  }
  return changes;
}
