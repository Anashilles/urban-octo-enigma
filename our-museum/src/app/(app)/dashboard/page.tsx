import { AcceptInvitationButton } from "@/components/invitations/accept-invitation-button";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2Icon, MailIcon, PlusIcon, UserRoundIcon } from "lucide-react";
import { MuseumCard } from "@/components/dashboard/museum-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResendVerificationButton } from "@/features/authentication/auth-forms";
import { requirePageUser } from "@/lib/auth/session";
import { prisma } from "@/lib/database/prisma";
import { getT } from "@/i18n/server";
import { getDashboard, getOnboardingState } from "@/services/museum-service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("dashboard.title") };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requirePageUser("/dashboard");
  const [{ t, locale }, data, steps, prefs, sp] = await Promise.all([
    getT(),
    getDashboard(user),
    getOnboardingState(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } }),
    props.searchParams,
  ]);
  const dismissed = Boolean((prefs?.preferences as { onboardingDismissed?: boolean } | null)?.onboardingDismissed);
  const showOnboarding = !user.isAnonymous && !dismissed && steps.some((s) => !s.done);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-eyebrow text-gold-deep">{t("dashboard.title")}</p>
          <h1 className="mt-3 font-display text-4xl font-medium sm:text-5xl" data-testid="dashboard-greeting">
            {t("dashboard.greeting", { name: user.displayName })}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/avatar">
              <UserRoundIcon aria-hidden="true" />
              {t("nav.avatar")}
            </Link>
          </Button>
          {!user.isAnonymous && (
            <Button asChild>
              <Link href="/museums/new" data-testid="create-museum">
                <PlusIcon aria-hidden="true" />
                {t("dashboard.create")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {sp.verified && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-sage/40 bg-sage/10 p-4 text-sm">
          <CheckCircle2Icon className="size-4 text-sage" aria-hidden="true" />
          {t("auth.emailVerified")}
        </div>
      )}
      {user.isAnonymous && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">
          <p>{t("dashboard.guestNotice")}</p>
          <Button asChild size="sm">
            <Link href="/signup">{t("dashboard.guestCta")}</Link>
          </Button>
        </div>
      )}
      {!user.isAnonymous && !user.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="flex items-center gap-2">
            <MailIcon className="size-4 text-gold-deep" aria-hidden="true" />
            {t("auth.verifyBanner")}
          </p>
          <ResendVerificationButton email={user.email} />
        </div>
      )}

      {showOnboarding && <OnboardingChecklist steps={steps} />}

      {data.pendingInvitations.length > 0 && (
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="font-display text-3xl">
            {t("dashboard.pending")}
          </h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {data.pendingInvitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="font-display text-xl">{i.museumName}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.invitedBy", { name: i.ownerName })} · <Badge variant="outline">{t(`common.roles.${i.role}`)}</Badge> ·{" "}
                    {t("dashboard.expires", { time: dateFmt.format(new Date(i.expiresAt)) })}
                  </p>
                </div>
                <AcceptInvitationButton invitationId={i.id} museumId={i.museumId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.recent.length > 0 && data.owned.length + data.shared.length > 2 && (
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="font-display text-3xl">
            {t("dashboard.recent")}
          </h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.recent.slice(0, 3).map((m) => (
              <MuseumCard key={m.id} museum={m} />
            ))}
          </div>
        </section>
      )}

      {!user.isAnonymous && (
        <section aria-labelledby="mine-title">
          <h2 id="mine-title" className="font-display text-3xl">
            {t("dashboard.myMuseums")}
          </h2>
          {data.owned.length === 0 ? (
            <div className="mt-5 grid justify-items-start gap-3 rounded-2xl border border-dashed border-input p-10" data-testid="empty-museums">
              <h3 className="font-display text-2xl">{t("dashboard.emptyMineTitle")}</h3>
              <p className="max-w-lg text-muted-foreground">{t("dashboard.emptyMineBody")}</p>
              <Button asChild className="mt-2">
                <Link href="/museums/new">
                  <PlusIcon aria-hidden="true" />
                  {t("dashboard.create")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.owned.map((m) => (
                <MuseumCard key={m.id} museum={m} />
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="shared-title">
        <h2 id="shared-title" className="font-display text-3xl">
          {t("dashboard.shared")}
        </h2>
        {data.shared.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{t("dashboard.emptyShared")}</p>
        ) : (
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.shared.map((m) => (
              <MuseumCard key={m.id} museum={m} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
