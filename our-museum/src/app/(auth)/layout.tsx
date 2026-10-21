import Link from "next/link";
import { GalleryIllustration } from "@/components/landing/gallery-illustration";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { getT } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="rounded-md" aria-label={t("common.appName")}>
            <Logo label={t("common.appName")} />
          </Link>
          <LanguageSwitcher />
        </header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          {children}
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-wall lg:block" aria-hidden="true">
        <GalleryIllustration className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent p-10 pt-32">
          <p className="max-w-md font-display text-3xl leading-snug text-ivory">{t("common.tagline")}</p>
        </div>
      </div>
    </div>
  );
}
