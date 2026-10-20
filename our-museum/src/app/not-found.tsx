import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="grid max-w-md justify-items-center gap-4 text-center">
        <LogoMark className="size-12 text-gold-deep" />
        <h1 className="font-display text-4xl">{t("errors.notFoundTitle")}</h1>
        <p className="text-muted-foreground">{t("errors.notFoundBody")}</p>
        <Button asChild>
          <Link href="/">{t("errors.goHome")}</Link>
        </Button>
      </div>
    </main>
  );
}
