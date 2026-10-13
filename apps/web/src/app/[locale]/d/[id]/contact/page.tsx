import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { isContactSendable } from "@/lib/server/contact/contact-availability";
import {
  CONTACT_PAGE_READ_DEADLINE_MS,
  readSentReference,
} from "@/lib/server/contact/sent-reference";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";

/** The contact page of a stored design. Opens only in the browser that owns the design: every refusal is
 *  `loadOwnedDesign`'s, the function the editor and the review answer through (ADR 0114 decision 5, ADR 0148 A1), and a
 *  refused request reads nothing of the contact store. Rendered per request, which the owned load's cookie read makes
 *  it, so the CSP's nonce reaches its scripts and the server's environment and the store are asked when the page is.
 *  Only whether the server can take a request and the sent reference's own answer are handed on, never a row. */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const load = await loadOwnedDesign(id);
  if (load.kind === "refused") return <DesignLoadError reason={load.reason} />;
  const sentReference = await readSentReference(
    { designId: id, revision: load.revision },
    { deadlineMs: CONTACT_PAGE_READ_DEADLINE_MS },
  );
  return (
    <HydrateAndContact
      design={load.design}
      designId={id}
      revision={load.revision}
      isSendable={isContactSendable(process.env)}
      sentReference={sentReference}
    />
  );
}
