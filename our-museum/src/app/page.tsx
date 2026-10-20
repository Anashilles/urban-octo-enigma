import Link from "next/link";
import {
  ArrowRightIcon,
  BrushIcon,
  FootprintsIcon,
  ImagesIcon,
  LockKeyholeIcon,
  MicIcon,
  UserRoundIcon,
  UsersRoundIcon,
} from "lucide-react";
import { MuseumPreview } from "@/components/landing/museum-preview";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export default async function LandingPage() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  const createHref = user && !user.isAnonymous ? "/museums/new" : "/signup?next=/museums/new";

  const features = [
    { icon: FootprintsIcon, title: t("landing.features.walkTitle"), body: t("landing.features.walkBody") },
    { icon: ImagesIcon, title: t("landing.features.photosTitle"), body: t("landing.features.photosBody") },
    { icon: UsersRoundIcon, title: t("landing.features.togetherTitle"), body: t("landing.features.togetherBody") },
    { icon: UserRoundIcon, title: t("landing.features.avatarTitle"), body: t("landing.features.avatarBody") },
    { icon: BrushIcon, title: t("landing.features.designTitle"), body: t("landing.features.designBody") },
    { icon: MicIcon, title: t("landing.features.voiceTitle"), body: t("landing.features.voiceBody") },
  ];
  const steps = [
    { n: "I", title: t("landing.how.step1Title"), body: t("landing.how.step1Body") },
    { n: "II", title: t("landing.how.step2Title"), body: t("landing.how.step2Body") },
    { n: "III", title: t("landing.how.step3Title"), body: t("landing.how.step3Body") },
    { n: "IV", title: t("landing.how.step4Title"), body: t("landing.how.step4Body") },
  ];
  const faqs = [1, 2, 3, 4, 5].map((i) => ({
    q: t(`landing.faq.q${i}` as "landing.faq.q1"),
    a: t(`landing.faq.a${i}` as "landing.faq.a1"),
  }));

  return (
    <>
      <SiteHeader variant="landing" />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pt-20 lg:pb-28">
            <div className="animate-fade-up">
              <p className="text-eyebrow text-gold-deep">{t("landing.eyebrow")}</p>
              <h1 className="mt-5 font-display text-[2.9rem] leading-[1.02] font-medium sm:text-6xl lg:text-[4.4rem]">
                {t("landing.title")}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("landing.subtitle")}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" data-testid="cta-create">
                  <Link href={createHref}>
                    {t("landing.ctaCreate")}
                    <ArrowRightIcon className="rtl:rotate-180" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" data-testid="cta-invite">
                  <Link href="/invite">{t("landing.ctaInvite")}</Link>
                </Button>
              </div>
              <Link
                href="/demo"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline decoration-gold/60 underline-offset-4 hover:decoration-gold"
              >
                {t("landing.ctaDemo")}
              </Link>
            </div>
            <MuseumPreview />
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-border/60 bg-card/60" aria-labelledby="features-title">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <h2 id="features-title" className="font-display text-4xl font-medium sm:text-5xl">
              {t("landing.featuresTitle")}
            </h2>
            <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="grid content-start gap-3">
                  <span className="grid size-11 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold-deep">
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-display text-2xl">{f.title}</h3>
                  <p className="leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20" aria-labelledby="how-title">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
            <h2 id="how-title" className="font-display text-4xl font-medium sm:text-5xl">
              {t("landing.howTitle")}
            </h2>
            <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li key={s.n} className="relative rounded-2xl border border-border bg-card p-7">
                  <span className="font-display text-3xl text-gold-deep" aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-display text-2xl">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="scroll-mt-20 bg-ink text-ivory" aria-labelledby="privacy-title">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
            <div>
              <span className="grid size-12 place-items-center rounded-full border border-gold/40 text-gold">
                <LockKeyholeIcon className="size-5" aria-hidden="true" />
              </span>
              <h2 id="privacy-title" className="mt-6 font-display text-4xl font-medium sm:text-5xl">
                {t("landing.privacyTitle")}
              </h2>
              <p className="mt-6 max-w-xl leading-relaxed text-ivory/75">{t("landing.privacyBody")}</p>
              <Link href="/privacy" className="mt-6 inline-block text-sm text-gold underline underline-offset-4">
                {t("landing.privacyLink")}
              </Link>
            </div>
            <ul className="grid content-center gap-4">
              {(["p1", "p2", "p3", "p4"] as const).map((k) => (
                <li key={k} className="flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                  <span className="leading-relaxed text-ivory/85">{t(`landing.privacyPoints.${k}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20" aria-labelledby="faq-title">
          <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
            <h2 id="faq-title" className="font-display text-4xl font-medium sm:text-5xl">
              {t("landing.faqTitle")}
            </h2>
            <div className="mt-10 divide-y divide-border border-y border-border">
              {faqs.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md font-display text-xl [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-2xl text-gold-deep transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-14 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={createHref}>{t("landing.ctaCreate")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/invite">{t("landing.ctaInvite")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
