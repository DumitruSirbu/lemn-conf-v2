import type { Metadata } from "next";

import { parseSceneShotRequest } from "./shot-request";
import { SceneShot } from "./scene-shot";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SceneShotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
