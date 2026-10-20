import type { Metadata } from "next";
import { AvatarEditorLoader } from "@/components/avatar/avatar-editor-loader";
import { safeNext } from "@/features/authentication/schemas";
import { requirePageUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { getAvatar } from "@/services/avatar-service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("avatar.title"), robots: { index: false, follow: false } };
}

export default async function AvatarPage(props: PageProps<"/avatar">) {
  const search = await props.searchParams;
  const raw = typeof search.returnTo === "string" ? search.returnTo : null;
  const returnTo = raw ? safeNext(raw, "") || null : null;
  const user = await requirePageUser(returnTo ? `/avatar?returnTo=${encodeURIComponent(returnTo)}` : "/avatar");
  const avatar = await getAvatar(user.id);
  return <AvatarEditorLoader initial={avatar.config} saved={avatar.saved} returnTo={returnTo} />;
}
