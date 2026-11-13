import type { NextRequest } from "next/server";

import { POST as ACKNOWLEDGE } from "@/app/api/designs/[id]/price-notice/acknowledge/route";
import { GET as NOTICE } from "@/app/api/designs/[id]/price-notice/route";

import { accountRequest, type AccountRequestInit } from "./account-world";
import { NOTICE_DESIGN_ID } from "./price-notice-stubs";

// The two price-notice requests as a browser sends them, answered by the real routes. A test that uses it mocks the modules
// `price-notice-stubs.ts` offers.

export interface NoticeRequestInit extends Omit<AccountRequestInit, "method"> {
  readonly id?: string;
}

export function cookieOf(...pairs: readonly (string | undefined)[]): string {
  return pairs.filter((pair) => pair !== undefined).join("; ");
}

/** The network block a request comes from, so the limiters have a source to count under once a test names one. */
const SOME_NETWORK = { "x-forwarded-for": "192.0.2.10" };

export function noticeRequest({
  id = NOTICE_DESIGN_ID,
  ...init
}: NoticeRequestInit = {}): NextRequest {
  return accountRequest(`/api/designs/${id}/price-notice`, {
    ...init,
    headers: { ...SOME_NETWORK, ...init.headers },
    method: "GET",
  });
}

export function acknowledgeRequest({
  id = NOTICE_DESIGN_ID,
  ...init
}: NoticeRequestInit = {}): NextRequest {
  return accountRequest(`/api/designs/${id}/price-notice/acknowledge`, {
    ...init,
    headers: { ...SOME_NETWORK, ...init.headers },
    method: "POST",
  });
}

export function readNotice(init: NoticeRequestInit = {}): Promise<Response> {
  return NOTICE(noticeRequest(init), {
    params: Promise.resolve({ id: init.id ?? NOTICE_DESIGN_ID }),
  });
}

export function acknowledge(init: NoticeRequestInit = {}): Promise<Response> {
  return ACKNOWLEDGE(acknowledgeRequest(init), {
    params: Promise.resolve({ id: init.id ?? NOTICE_DESIGN_ID }),
  });
}
