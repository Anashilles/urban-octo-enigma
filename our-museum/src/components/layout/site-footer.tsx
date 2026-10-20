import Link from "next/link";
import { getT } from "@/i18n/server";
import { Logo } from "./logo";

export async function SiteFooter() {
  const { t } = await getT();
  const contact = process.env.CONTACT_EMAIL;
  return (
    <footer className="border-t border-border/70 bg-wall/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-3">
          <Logo label={t("common.appName")} />
          <p className="max-w-sm text-sm text-muted-foreground">{t("common.tagline")}</p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" href="/privacy">
            {t("landing.footerPrivacy")}
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            {t("landing.footerTerms")}
          </Link>
          {contact ? (
            <a className="hover:text-foreground" href={`mailto:${contact}`}>
              {t("landing.footerContact")}
            </a>
          ) : (
            <Link className="hover:text-foreground" href="/privacy#contact">
              {t("landing.footerContact")}
            </Link>
          )}
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-5 pb-10 text-xs text-muted-foreground sm:px-8">
        © {new Date().getFullYear()} · {t("landing.footerRights")}
      </div>
    </footer>
  );
}
