"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  resolveAccountCheckInboxCopy,
  resolveAccountForbiddenCopy,
  resolveAccountForgotCopy,
  resolveAccountKitCopy,
  resolveAccountLoginCopy,
  resolveAccountNotFoundCopy,
  resolveAccountRegisterCopy,
  resolveAccountResetCopy,
  resolveAccountShellCopy,
  resolveAccountVerifyCopy,
  resolveContent,
  type ContentTranslator,
} from "./content";

/** A resolver's copy for the current locale, resolved once per locale rather than once per render. */
function useResolved<Copy>(
  resolve: (translate: ContentTranslator) => Copy,
): Copy {
  const translate = useTranslations();
  return useMemo(() => resolve(translate), [resolve, translate]);
}

export function useContent() {
  return useResolved(resolveContent);
}

export function useAccountKitCopy() {
  return useResolved(resolveAccountKitCopy);
}

export function useAccountShellCopy() {
  return useResolved(resolveAccountShellCopy);
}

export function useAccountForgotCopy() {
  return useResolved(resolveAccountForgotCopy);
}

export function useAccountRegisterCopy() {
  return useResolved(resolveAccountRegisterCopy);
}

export function useAccountLoginCopy() {
  return useResolved(resolveAccountLoginCopy);
}

export function useAccountNotFoundCopy() {
  return useResolved(resolveAccountNotFoundCopy);
}

export function useAccountForbiddenCopy() {
  return useResolved(resolveAccountForbiddenCopy);
}

export function useAccountCheckInboxCopy() {
  return useResolved(resolveAccountCheckInboxCopy);
}

export function useAccountVerifyCopy() {
  return useResolved(resolveAccountVerifyCopy);
}

export function useAccountResetCopy() {
  return useResolved(resolveAccountResetCopy);
}
