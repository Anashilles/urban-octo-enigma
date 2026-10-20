import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/authentication/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.forgotTitle") };
}

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-medium">{t("auth.forgotTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.forgotSubtitle")}</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        {t("common.back")}
      </Link>
    </div>
  );
}
