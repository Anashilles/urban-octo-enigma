import type { Metadata } from "next";
import { EnterInvitationForm } from "@/components/invitations/enter-invitation-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("invite.enterTitle") };
}

export default async function EnterInvitationPage() {
  const { t } = await getT();
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-medium">{t("invite.enterTitle")}</h1>
        <p className="text-muted-foreground">{t("invite.enterBody")}</p>
      </div>
      <EnterInvitationForm />
    </div>
  );
}
