import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlertIcon } from "lucide-react";
import { InvitationActions } from "@/components/invitations/invitation-actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getT } from "@/i18n/server";
import { previewInvitation } from "@/services/invitation-service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  // The token lives in the URL: never leak it through the Referer header or search engines.
  return { title: t("invite.title"), referrer: "no-referrer", robots: { index: false, follow: false } };
}

export default async function InvitationPage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const [{ t, locale }, user, preview] = await Promise.all([getT(), getCurrentUser(), previewInvitation(token)]);

  if (!preview || preview.status !== "active") {
    const key = preview ? preview.status : "invalid";
    return (
      <div className="grid gap-6" data-testid="invitation-unavailable" data-status={key}>
        <CircleAlertIcon className="size-8 text-gold-deep" aria-hidden="true" />
        <h1 className="font-display text-4xl font-medium">{t(`invite.status.${key as "invalid"}`)}</h1>
        <p className="text-muted-foreground">{t("invite.statusHelp")}</p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link href={user ? "/dashboard" : "/"}>{user ? t("common.dashboard") : t("common.appName")}</Link>
        </Button>
      </div>
    );
  }

  const membership = user
    ? await prisma.museumMembership.findUnique({ where: { museumId_userId: { museumId: preview.museumId, userId: user.id } }, select: { role: true } })
    : null;
  const expires = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(preview.expiresAt));

  return (
    <div className="grid gap-8" data-testid="invitation-page">
      <div className="grid gap-3">
        <p className="text-eyebrow text-gold-deep">{t("invite.title")}</p>
        <h1 className="font-display text-4xl leading-tight font-medium">{preview.museumName}</h1>
        <p className="text-lg text-muted-foreground">{t("invite.body", { inviter: preview.inviterName, museum: preview.museumName })}</p>
      </div>
      <div className="grid gap-1 rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="font-medium">{t("invite.roleLine", { role: t(`common.roles.${preview.role}`) })}</p>
        <p className="text-muted-foreground">{t(`invite.roleHelp.${preview.role}`)}</p>
        <p className="mt-2 text-muted-foreground">{t("invite.expires", { time: expires })}</p>
      </div>
      <InvitationActions
        token={token}
        museumId={preview.museumId}
        museumName={preview.museumName}
        guestsAllowed={preview.guestsAllowed}
        emailLocked={preview.emailLocked}
        user={user ? { displayName: user.displayName, isAnonymous: user.isAnonymous } : null}
        alreadyMember={Boolean(membership && !(membership.role === "VISITOR" && preview.role === "EDITOR"))}
      />
    </div>
  );
}
