import type { Metadata } from "next";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("legal.termsTitle") };
}

export default async function TermsPage() {
  const { t } = await getT();
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-5xl font-medium">{t("legal.termsTitle")}</h1>
      <ul className="mt-8 grid gap-4">
        {[t("legal.terms1"), t("legal.terms2"), t("legal.terms3")].map((i) => (
          <li key={i} className="flex gap-3 text-lg leading-relaxed">
            <span className="mt-3 size-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
            {i}
          </li>
        ))}
      </ul>
    </article>
  );
}
