import { NextResponse, type NextRequest } from "next/server";

import { runDesignsBackup } from "@/lib/server/backup-designs";
import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";

// Talks to Postgres and Blob with Node's `crypto`; must not run on the Edge runtime.
export const runtime = "nodejs";
// Reads `request.headers` on every call and must never serve a cached/stale response.
export const dynamic = "force-dynamic";

/** Daily `designs`-table backup to Vercel Blob, triggered by the cron declared in `vercel.json`.
 *  Always answers 200 once authorized — even when the backup itself failed — so a backup problem
 *  never trips deploy/alerting plumbing keyed on this endpoint's status code; the failure is
 *  logged (see `backup-designs.ts`) and reported in the response body instead. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDesignsBackup();
  return NextResponse.json(result, { status: 200 });
}
