import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EditorLoader } from "@/components/editor/editor-loader";
import { requirePageUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { isAppError } from "@/lib/errors";
import { getT } from "@/i18n/server";
import { getScene } from "@/services/scene-service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("editor.title"), robots: { index: false, follow: false } };
}

export default async function EditorPage(props: PageProps<"/editor/[museumId]">) {
  const { museumId } = await props.params;
  const user = await requirePageUser(`/editor/${museumId}`);
  let scene;
  try {
    scene = await getScene(user, museumId);
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  // Visitors have nothing to edit: send them into the museum instead.
  if (scene.viewer.role === "VISITOR") redirect(`/museum/${museumId}`);
  return <EditorLoader initialScene={scene} maxUploadBytes={env().UPLOAD_MAX_BYTES} />;
}
