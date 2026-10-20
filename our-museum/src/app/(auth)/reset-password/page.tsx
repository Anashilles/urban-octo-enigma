import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/authentication/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("auth.resetTitle") };
}

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const [{ t }, sp] = await Promise.all([getT(), props.searchParams]);
  const token = typeof sp.token === "string" && sp.token.length > 0 && !sp.error ? sp.token : null;
  return (
    <div className="grid gap-8">
      <h1 className="font-display text-4xl font-medium">{t("auth.resetTitle")}</h1>
      <ResetPasswordForm token={token} />
    </div>
  );
}
