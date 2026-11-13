import type { ReactNode } from "react";

import type { AppLocale } from "@/i18n/routing";
import {
  PublishScreen,
  PublishUnavailableScreen,
} from "@/price-dashboard/publish-page";
import type { PublishPageRead } from "@/price-dashboard/publish-source";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";
import type { PublishView } from "@/price-dashboard/use-publish-desk";
import type { StaffShellContext } from "@/staff/staff-shell";

/** The screen of what the publish pages' read answered, for the pending tab and the history tab alike. */
export function publishScreenOf({
  read,
  locale,
  shell,
  initialView,
}: {
  readonly read: PublishPageRead;
  readonly locale: AppLocale;
  readonly shell: StaffShellContext;
  readonly initialView: PublishView;
}): ReactNode {
  switch (read.kind) {
    case "ready":
      return (
        <PublishScreen
          locale={locale}
          context={shell}
          input={read.input}
          initialView={initialView}
        />
      );
    case "draft-unreadable":
      return (
        <PublishDraftUnreadableScreen
          locale={locale}
          context={shell}
          draftRevision={read.draftRevision}
        />
      );
    case "unavailable":
      return <PublishUnavailableScreen locale={locale} context={shell} />;
  }
}
