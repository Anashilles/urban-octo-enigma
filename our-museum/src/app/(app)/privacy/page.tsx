import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("legal.privacyTitle") };
}

export default async function PrivacyPage() {
  const { t } = await getT();
  const contact = process.env.CONTACT_EMAIL ?? "the operator of this site";
  const sections = [
    { title: t("legal.whatWeStoreTitle"), items: [t("legal.whatWeStore1"), t("legal.whatWeStore2"), t("legal.whatWeStore3"), t("legal.whatWeStore4")] },
    { title: t("legal.whoTitle"), items: [t("legal.who1"), t("legal.who2"), t("legal.who3")] },
    { title: t("legal.deleteTitle"), items: [t("legal.delete1"), t("legal.delete2"), t("legal.delete3")] },
    { title: t("legal.encryptionTitle"), items: [t("legal.encryptionBody")] },
  ];
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-5xl font-medium">{t("legal.privacyTitle")}</h1>
      <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("legal.privacyIntro")}</p>
      {sections.map((s) => (
        <section key={s.title} className="mt-10">
          <h2 className="font-display text-3xl">{s.title}</h2>
          <ul className="mt-4 grid gap-3">
            {s.items.map((i) => (
              <li key={i} className="flex gap-3 leading-relaxed">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                {i}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section id="contact" className="mt-10 scroll-mt-24">
        <h2 className="font-display text-3xl">{t("legal.contactTitle")}</h2>
        <p className="mt-4 leading-relaxed">{t("legal.contactBody", { email: contact })}</p>
      </section>
    </article>
  );
}
