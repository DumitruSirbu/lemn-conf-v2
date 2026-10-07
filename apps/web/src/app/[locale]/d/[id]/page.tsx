import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";

/**
 * The load-by-link route, gated to the owning browser alone (ADR 0114 decision 5, Amendment H2). Every refusal comes
 * from `loadOwnedDesign`, the one function the review route answers through as well, so the two cannot differ.
 *
 *  Write access is deliberately **not** answered here. The write-token cookie is scoped
 *  `Path=/api/designs/{id}` (`write-token.ts`), so a browser does not send it to
 *  `/[locale]/d/{id}` at all —
 *  a `cookies()` read on this request would answer "no credential" for every visitor including the
 *  design's own author. `HydrateAndConfigure` asks the one route the cookie does reach. */
export default async function DesignPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const load = await loadOwnedDesign(id);
  if (load.kind === "refused") return <DesignLoadError reason={load.reason} />;
  return (
    <HydrateAndConfigure
      design={load.design}
      designId={id}
      revision={load.revision}
    />
  );
}
