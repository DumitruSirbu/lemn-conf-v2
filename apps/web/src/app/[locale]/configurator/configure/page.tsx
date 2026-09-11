import { getTranslations } from "next-intl/server";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";

export default async function ConfigurePage() {
  const translate = await getTranslations("webglUnavailable");

  return (
    <ConfigureScreen webglUnavailableTitleMobile={translate("titleMobile")} />
  );
}
