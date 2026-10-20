import type { Metadata } from "next";
import { DemoLoader } from "@/components/demo/demo-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("demo.badge") };
}

export default async function DemoPage() {
  const user = await getCurrentUser();
  const createHref = user && !user.isAnonymous ? "/museums/new" : "/signup?next=/museums/new";
  return (
    <main id="main">
      <DemoLoader createHref={createHref} />
    </main>
  );
}
