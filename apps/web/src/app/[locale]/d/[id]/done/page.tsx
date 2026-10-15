import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndDone } from "@/app/d/[id]/done/hydrate-and-done";
import { readSentReference } from "@/lib/server/contact/sent-reference";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";

/** The confirmation of a design's sent request. Opens only in the browser that owns the design: every refusal is
 *  `loadOwnedDesign`'s, the function the editor, the review and the contact page answer through (ADR 0114 decision 5,
 *  ADR 0148 A1), and a refused request reads nothing of the contact store. Rendered per request, which the owned load's
 *  cookie read makes it, so the CSP's nonce reaches its scripts and the store is asked when the page is. Only the
 *  reference string or a kind is handed on, never a row. */
export default async function DonePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const load = await loadOwnedDesign(id);
  if (load.kind === "refused") return <DesignLoadError reason={load.reason} />;
  const sentReference = await readSentReference({
    designId: id,
    revision: load.revision,
  });
  return (
    <HydrateAndDone
      design={load.design}
      designId={id}
      revision={load.revision}
      sentReference={sentReference}
    />
  );
}
