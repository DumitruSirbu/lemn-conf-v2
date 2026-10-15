import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { isContactSendable } from "@/lib/server/contact/contact-availability";
import {
  CONTACT_PAGE_READ_DEADLINE_MS,
  readSentReference,
} from "@/lib/server/contact/sent-reference";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";

/** The contact page of a stored design, opened only in the browser that owns it: every refusal is `loadOwnedDesign`'s
 *  (ADR 0114 decision 5), and a refused request reads nothing of the contact store. Rendered per request (the owned
 *  load reads a cookie), so the CSP nonce reaches its scripts. Only whether the server can take a request and the sent
 *  reference's answer are handed on, never a row. */
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
