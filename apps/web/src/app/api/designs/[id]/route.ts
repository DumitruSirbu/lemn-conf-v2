import { DesignSchema } from "@lemnaria/configurator-domain";
import { NextResponse, type NextRequest } from "next/server";

import {
  designErrorResponse,
  invalidBodyResponse,
} from "@/lib/server/design-errors";
import { getRepository } from "@/lib/server/repository";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const design = await getRepository().load(id);
    return NextResponse.json({ id, design });
  } catch (error) {
    return designErrorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  return saveDesign(request, await params);
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  return saveDesign(request, await params);
}

/** Shared by `PUT` and `PATCH`: this route treats a save as a full replacement either way, so both
 *  verbs validate and persist identically. The identifier travels only in the URL segment — the
 *  request body is the `Design` document itself, nothing else. */
async function saveDesign(
  request: NextRequest,
  { id }: { id: string },
): Promise<NextResponse> {
  const body: unknown = await request.json();
  const result = DesignSchema.safeParse(body);
  if (!result.success) return invalidBodyResponse(result.error.message);

  try {
    const savedId = await getRepository().save(id, result.data);
    return NextResponse.json({ id: savedId });
  } catch (error) {
    return designErrorResponse(error);
  }
}
