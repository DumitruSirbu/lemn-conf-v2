import {
  DesignNotFoundError,
  InvalidDesignError,
} from "@lemnaria/configurator-domain";

import { getRepository } from "@/lib/server/repository";

import { DesignLoadError } from "./design-load-error";
import { HydrateAndConfigure } from "./hydrate-and-configure";

/** The load-by-link route (M2 "Persistence" acceptance criteria). `getRepository().load` already
 *  performs parse → validate → migrate as one step, so a valid result here is a fully-formed
 *  `Design` ready to replace the store — there is no partial-success case to handle.
 *
 *  Write access is deliberately **not** answered here. The write-token cookie is scoped
 *  `Path=/api/designs/{id}` (`write-token.ts`), so a browser does not send it to `/d/{id}` at all —
 *  a `cookies()` read on this request would answer "no credential" for every visitor including the
 *  design's own author. `HydrateAndConfigure` asks the one route the cookie does reach. */
export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const { design, revision } = await getRepository().load(id);
    return (
      <HydrateAndConfigure design={design} designId={id} revision={revision} />
    );
  } catch (error) {
    if (error instanceof DesignNotFoundError)
      return <DesignLoadError reason="not-found" />;
    if (error instanceof InvalidDesignError)
      return <DesignLoadError reason="invalid" />;
    throw error;
  }
}
