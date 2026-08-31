import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSceneShotRouteEnabled } from "./route-availability";
import { parseSceneShotRequest } from "./shot-request";
import { SceneShot } from "./scene-shot";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The availability flag is read from the environment of the *running* server, so this route must
 * not be prerendered: a static prerender evaluates the gate at build time, bakes the 404 into the
 * output, and no runtime value can ever open it again — which is exactly what the capture harness
 * needs it to do.
 */
export const dynamic = "force-dynamic";

export default async function SceneShotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSceneShotRouteEnabled(process.env)) notFound();

  const request = parseSceneShotRequest(await searchParams);
  return (
    <SceneShot
      width={request.width}
      height={request.height}
      position={request.position}
      target={request.target}
      finish={request.finish}
    />
  );
}
