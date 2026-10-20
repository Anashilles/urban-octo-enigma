import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveMuseumLoader } from "@/components/live/live-museum-loader";
import { requirePageUser } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { getScene } from "@/services/scene-service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MuseumPage(props: PageProps<"/museum/[museumId]">) {
  const { museumId } = await props.params;
  const user = await requirePageUser(`/museum/${museumId}`);
  let scene;
  try {
    scene = await getScene(user, museumId, { recordVisit: true });
  } catch (e) {
    if (isAppError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  return (
    <main id="main">
      <title>{scene.museum.name}</title>
      <LiveMuseumLoader initialScene={scene} />
    </main>
  );
}
