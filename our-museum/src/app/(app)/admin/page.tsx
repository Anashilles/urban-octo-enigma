import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { requirePageUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { getDiagnostics } from "@/services/admin-service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("admin.title"), robots: { index: false, follow: false } };
}

export default async function AdminPage() {
  const user = await requirePageUser("/admin");
  if (!user.isAdmin) notFound();
  const diagnostics = await getDiagnostics();
  return <AdminDashboard initial={diagnostics} />;
}
