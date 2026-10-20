import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/features/authentication/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("common.signUp") };
}

export default async function SignUpPage() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  if (user && !user.isAnonymous) redirect("/dashboard");
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-medium">{t("auth.signUpTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.signUpSubtitle")}</p>
      </div>
      <Suspense>
        <SignUpForm requireVerification={env().AUTH_REQUIRE_EMAIL_VERIFICATION} />
      </Suspense>
    </div>
  );
}
