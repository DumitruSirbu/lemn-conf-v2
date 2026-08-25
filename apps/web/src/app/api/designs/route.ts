import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NextResponse } from "next/server";

import { getRepository } from "@/lib/server/repository";

/** Mints the first design row. M2 has no Step 1 yet, so the seeded L-kitchen fixture is the only
 *  creation trigger; M7 replaces it with preset application without changing this route's
 *  contract — the repository itself has no opinion on how a `Design` came to exist
 *  (`docs/milestones/M2-void-engine.md`, "Something has to create the first design"). */
export async function POST(): Promise<NextResponse> {
  const id = await getRepository().save(null, KITCHEN_L_DESIGN);
  return NextResponse.json({ id }, { status: 201 });
}
