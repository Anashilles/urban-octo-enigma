import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateMuseumForm } from "@/components/museums/create-museum-form";
import { requirePageUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("museumNew.title") };
}

export default async function NewMuseumPage() {
  const user = await requirePageUser("/museums/new");
  if (user.isAnonymous) redirect("/signup?next=/museums/new");
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-4xl font-medium sm:text-5xl">{t("museumNew.title")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("museumNew.subtitle")}</p>
      <div className="mt-10">
        <CreateMuseumForm />
      </div>
    </div>
  );
}
