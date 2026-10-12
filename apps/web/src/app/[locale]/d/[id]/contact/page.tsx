import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndContact } from "@/app/d/[id]/contact/hydrate-and-contact";
import { isContactSendable } from "@/lib/server/contact/contact-availability";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";

/** The contact page of a stored design. Opens only in the browser that owns the design: every refusal is
 *  `loadOwnedDesign`'s, the function the editor and the review answer through (ADR 0114 decision 5, ADR 0148 A1).
 *  Rendered per request, which the owned load's cookie read makes it, so the CSP's nonce reaches its scripts and the
 *  server's environment is read when the page is asked for and not when it was built. Only whether the server can take
 *  a request is handed on, as a boolean. */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const load = await loadOwnedDesign(id);
  if (load.kind === "refused") return <DesignLoadError reason={load.reason} />;
  return (
    <HydrateAndContact
      design={load.design}
      designId={id}
      revision={load.revision}
      isSendable={isContactSendable(process.env)}
    />
  );
}
