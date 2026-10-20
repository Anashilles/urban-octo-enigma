import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/authentication/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { safeNext } from "@/features/authentication/schemas";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("common.signIn") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  const next = (await props.searchParams).next;
  if (user && !user.isAnonymous) redirect(safeNext(typeof next === "string" ? next : null));
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-4xl font-medium">{t("auth.signInTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.signInSubtitle")}</p>
      </div>
      <Suspense>
        <SignInForm />
      </Suspense>
    </div>
  );
}
