"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import {
  resolveAccountCheckInboxCopy,
  resolveAccountForgotCopy,
  resolveAccountKitCopy,
  resolveAccountLoginCopy,
  resolveAccountNotFoundCopy,
  resolveAccountRegisterCopy,
  resolveAccountShellCopy,
  resolveAccountVerifyCopy,
  resolveContent,
} from "./content";

export function useContent() {
  const translate = useTranslations();
  return useMemo(() => resolveContent(translate), [translate]);
}

export function useAccountKitCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountKitCopy(translate), [translate]);
}

export function useAccountShellCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountShellCopy(translate), [translate]);
}

export function useAccountForgotCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountForgotCopy(translate), [translate]);
}

export function useAccountRegisterCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountRegisterCopy(translate), [translate]);
}

export function useAccountLoginCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountLoginCopy(translate), [translate]);
}

export function useAccountNotFoundCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountNotFoundCopy(translate), [translate]);
}

export function useAccountCheckInboxCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountCheckInboxCopy(translate), [translate]);
}

export function useAccountVerifyCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveAccountVerifyCopy(translate), [translate]);
}
