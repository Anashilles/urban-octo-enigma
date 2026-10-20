import type { Metadata } from "next";
import { MailIcon } from "lucide-react";
import { ResendVerificationButton } from "@/features/authentication/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.verifyTitle") };
}

export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const [{ t }, sp] = await Promise.all([getT(), props.searchParams]);
  const email = typeof sp.email === "string" ? sp.email : "";
  return (
    <div className="grid gap-6">
      <span className="grid size-12 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold-deep">
        <MailIcon className="size-5" aria-hidden="true" />
      </span>
      <h1 className="font-display text-4xl font-medium">{t("auth.verifyTitle")}</h1>
      <p className="text-muted-foreground">{t("auth.verifyBody", { email: email || "…" })}</p>
      <ResendVerificationButton email={email} />
    </div>
  );
}
