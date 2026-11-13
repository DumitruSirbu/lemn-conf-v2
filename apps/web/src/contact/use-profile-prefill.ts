import { useEffect, useState } from "react";

import type { ProfileAccount, ProfileOffer } from "./contact-form-model";
import {
  blanksOf,
  offerOf,
  readAccountProfile,
  readPrefillSession,
} from "./read-account-for-prefill";
import type { ContactSubmission } from "./use-contact-submission";

// Fills the contact form from a confirmed client's profile (ADR 0179 d1). The session is read first and the profile only
// for a session that may be filled, once per distinct confirmed account per mount. The values go to the form's memory
// and nowhere else; the form names the account in its line and in the request, and the server fills only that account.

/** What the hook needs of the form's memory: the three callbacks are stable for the life of the page. */
type PrefillTarget = Pick<
  ContactSubmission,
  "edit" | "resetRequestId" | "showProfileAccount" | "phase"
>;

/** Why the session is being looked at: a restore from the cache takes the profile's values back before it asks. */
type SessionLook = "mount" | "tab-shown" | "page-restored";

/** A profile read that was asked for and has not answered, or failed: it is not asked for again. */
const PROFILE_UNAVAILABLE = { kind: "unavailable" } as const;

interface ProfileRead {
  readonly kind: "read";
  readonly account: ProfileAccount;
  readonly offer: ProfileOffer;
}

type ProfileOutcome = typeof PROFILE_UNAVAILABLE | ProfileRead;

interface PrefillMemory {
  /** Newest session read wins; an older answer arriving late is dropped. */
  latestReadId: number;
  /** The account the last definite session answer named, `undefined` for anyone who is not a confirmed client. The
   *  whole value is `undefined` until a definite answer arrives. */
  seen: { readonly email: string | undefined } | undefined;
  /** Each confirmed account whose profile was asked for, and what came of it: never asked twice. */
  readonly profileOutcomes: Map<string, ProfileOutcome>;
  /** A restore has taken the values back and no definite answer has followed: an answer that says nothing keeps them
   *  withdrawn, whichever read it comes from. */
  isRestorePending: boolean;
}

/**
 * The account to name in the form's line, once its profile has been read. A session that changes while the page is open
 * (seen again when the tab is shown, or the page is restored from the cache) takes back what the profile filled and
 * forgets the last send's id. Once the request is sent the session is no longer followed.
 */
export function useProfilePrefill(
  target: PrefillTarget,
): ProfileAccount | undefined {
  const [account, setAccount] = useState<ProfileAccount | undefined>();
  const [memory] = useState(newPrefillMemory);
  const { edit, resetRequestId, showProfileAccount } = target;
  const isFollowing = target.phase.kind !== "sent";

  useEffect(() => {
    if (!isFollowing) return undefined;
    const publish = (shown: ProfileAccount | undefined) => {
      setAccount(shown);
      showProfileAccount(shown);
    };
    const look = (why: SessionLook) => {
      void followSession(why, { memory, edit, resetRequestId, publish });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) look("page-restored");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") look("tab-shown");
    };
    look("mount");
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      memory.latestReadId += 1;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [memory, edit, resetRequestId, showProfileAccount, isFollowing]);

  return account;
}

function newPrefillMemory(): PrefillMemory {
  return {
    latestReadId: 0,
    seen: undefined,
    profileOutcomes: new Map(),
    isRestorePending: false,
  };
}

interface Following extends Pick<PrefillTarget, "edit" | "resetRequestId"> {
  readonly memory: PrefillMemory;
  readonly publish: (account: ProfileAccount | undefined) => void;
}

async function followSession(
  why: SessionLook,
  following: Following,
): Promise<void> {
  const { memory } = following;
  memory.latestReadId += 1;
  const readId = memory.latestReadId;
  if (why === "page-restored") {
    memory.isRestorePending = true;
    withdrawProfile(following);
  }
  const session = await readPrefillSession();
  if (readId !== memory.latestReadId) return;
  if (session.kind === "unknown") {
    if (memory.isRestorePending) withdrawProfile(following);
    return;
  }
  memory.isRestorePending = false;
  const email = session.kind === "client" ? session.email : undefined;
  noteSessionOf(email, following);
  if (email !== undefined) await showAccountOf(email, following);
}

/** An answer that names another account ends the last send's hold on its id first, so what the profile filled is taken
 *  back and not kept, and what the customer typed is no longer claimed for any account until they edit a field. The
 *  first answer only takes the id, and only when it names a confirmed client: a send made before any answer cannot be
 *  shown to be that account's. A first answer of anyone else changes nothing, since a retry under a visitor's or a staff
 *  member's session fills no profile. The server fills from the cookie at submit time and only for the address the
 *  request names, which is what keeps a stale retry safe. */
function noteSessionOf(email: string | undefined, following: Following): void {
  const { memory, resetRequestId } = following;
  const previous = memory.seen;
  memory.seen = { email };
  if (previous === undefined) {
    if (email !== undefined) resetRequestId();
    return;
  }
  if (previous.email === email) return;
  resetRequestId();
  following.edit({ type: "account-changed" });
  following.publish(undefined);
}

function withdrawProfile({ edit, publish }: Following): void {
  edit({ type: "profile-withdrawn" });
  publish(undefined);
}

async function showAccountOf(
  email: string,
  following: Following,
): Promise<void> {
  const { memory } = following;
  const outcome = memory.profileOutcomes.get(email);
  if (outcome?.kind === "read") {
    applyRead(outcome, following);
    return;
  }
  if (outcome !== undefined) return;
  memory.profileOutcomes.set(email, PROFILE_UNAVAILABLE);
  const profile = await readAccountProfile();
  if (profile === undefined) return;
  const read: ProfileRead = {
    kind: "read",
    account: { email, blanks: blanksOf(profile) },
    offer: offerOf(profile),
  };
  memory.profileOutcomes.set(email, read);
  if (memory.seen?.email === email) applyRead(read, following);
}

function applyRead(
  { account, offer }: ProfileRead,
  { edit, publish }: Following,
): void {
  edit({ type: "profile-arrived", offer });
  publish(account);
}
