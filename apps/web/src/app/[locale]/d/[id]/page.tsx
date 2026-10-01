import { InvalidDesignError } from "@lemnaria/configurator-domain";
import { cookies } from "next/headers";

import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { getRepository } from "@/lib/server/repository";
import { readVisitorHash } from "@/lib/server/visitor";

/**
 * The load-by-link route (M2 "Persistence" acceptance criteria), gated to the owning browser alone
 * since M7 wave 7E3b (ADR 0114 decision 5, Amendment H2). A missing or malformed visitor cookie, a
 * foreign one and an unknown id are one outcome — the same `"unavailable"` page — so nothing here
 * can tell a caller which of the three it hit; the no-cookie and malformed cases never reach the
 * repository at all. `getRepository().loadOwned` already performs parse → validate → migrate as one
 * step for a matched row, so a `"found"` result here is a fully-formed `Design` ready to replace the
 * store — there is no partial-success case to handle.
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
  const visitorHash = readVisitorHash(await cookies());
  if (visitorHash === undefined)
    return <DesignLoadError reason="unavailable" />;

  try {
    const outcome = await getRepository().loadOwned({ id, visitorHash });
    if (outcome.kind === "none")
      return <DesignLoadError reason="unavailable" />;
    return (
      <HydrateAndConfigure
        design={outcome.design}
        designId={id}
        revision={outcome.revision}
      />
    );
  } catch (error) {
    if (error instanceof InvalidDesignError)
      return <DesignLoadError reason="invalid" />;
    throw error;
  }
}
