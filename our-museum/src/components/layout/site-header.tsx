import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

export async function SiteHeader({ variant = "default" }: { variant?: "default" | "landing" }) {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5 sm:px-8">
        <Link href={user ? "/dashboard" : "/"} className="rounded-md text-foreground" aria-label={t("common.appName")}>
          <Logo label={t("common.appName")} />
        </Link>
        {variant === "landing" && (
          <nav aria-label="Primary" className="ms-6 hidden items-center gap-1 text-sm text-muted-foreground md:flex">
            <a className="rounded-full px-3 py-2 hover:text-foreground" href="#how">
              {t("nav.howItWorks")}
            </a>
            <a className="rounded-full px-3 py-2 hover:text-foreground" href="#privacy">
              {t("nav.privacy")}
            </a>
            <a className="rounded-full px-3 py-2 hover:text-foreground" href="#faq">
              {t("nav.faq")}
            </a>
          </nav>
        )}
        <div className="ms-auto flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <UserMenu
              user={{
                displayName: user.displayName,
                email: user.email,
                isAnonymous: user.isAnonymous,
                isAdmin: user.isAdmin,
              }}
            />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">{t("common.signUp")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
