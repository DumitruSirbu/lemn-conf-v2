import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSceneShotRouteEnabled } from "../scene-shot/route-availability";
import { MirrorShot } from "./mirror-shot";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Same reason as `/internal/scene-shot`: the availability flag is read from the environment of the
 * *running* server, so a static prerender would bake a 404 in and no runtime value could reopen it.
 */
export const dynamic = "force-dynamic";

export default function MirrorShotPage() {
  if (!isSceneShotRouteEnabled(process.env)) notFound();
  return <MirrorShot />;
}
