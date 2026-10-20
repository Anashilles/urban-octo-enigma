import type { Metadata } from "next";
import { AccountSettings } from "@/components/settings/account-settings";
import { requirePageUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("account.title") };
}

export default async function SettingsPage() {
  const user = await requirePageUser("/settings");
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="mb-8 font-display text-4xl font-medium sm:text-5xl">{t("account.title")}</h1>
      <AccountSettings
        user={{ displayName: user.displayName, email: user.email, emailVerified: user.emailVerified, isAnonymous: user.isAnonymous, locale: user.locale }}
      />
    </div>
  );
}
