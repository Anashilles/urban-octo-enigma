"use client";

import { useMemo } from "react";
import { EyeIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneData, ScenePhoto } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { photoImageUrl } from "./photo-urls";

function Thumb({ photo }: { photo: ScenePhoto }) {
  const url = photoImageUrl(photo, "thumb");
  return (
    <div className="aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg sm:w-32" style={{ background: photo.dominantColor }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
      {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
    </div>
  );
}

/**
 * Accessible, non-3D way to browse a museum: photographs grouped by room in
 * walking order. Used as the WebGL fallback and from Settings.
 */
export function PhotoList({
  scene,
  onView,
  onGoTo,
  tone = "light",
}: {
  scene: SceneData;
  onView: (photoId: string, sequence: string[]) => void;
  onGoTo?: (frameId: string) => void;
  tone?: "light" | "dark";
}) {
  const { t, formatDate } = useI18n();
  const photos = useMemo(() => new Map(scene.photos.map((p) => [p.id, p])), [scene.photos]);
  const groups = useMemo(() => {
    const byRoom = [...scene.rooms]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((room) => ({
        id: room.id,
        name: room.name,
        frames: scene.frames.filter((f) => f.roomId === room.id).sort((a, b) => a.wallKey.localeCompare(b.wallKey) || a.u - b.u),
      }))
      .filter((g) => g.frames.length);
    const hung = new Set(scene.frames.map((f) => f.photoId));
    const unhung = scene.photos.filter((p) => !hung.has(p.id));
    return { byRoom, unhung };
  }, [scene]);
  const sequence = useMemo(
    () => [...groups.byRoom.flatMap((g) => g.frames.map((f) => f.photoId)), ...groups.unhung.map((p) => p.id)].filter((id, i, a) => a.indexOf(id) === i),
    [groups],
  );
  const muted = tone === "dark" ? "text-ivory/65" : "text-muted-foreground";

  if (!sequence.length) return <p className={muted}>{t("museum.list.empty")}</p>;

  return (
    <div className="grid gap-8" data-testid="photo-list">
      {groups.byRoom.map((g) => (
        <section key={g.id} aria-labelledby={`room-${g.id}`}>
          <h3 id={`room-${g.id}`} className="font-display text-xl">
            {g.name}
          </h3>
          <ul className="mt-3 grid gap-3">
            {g.frames.map((f) => {
              const photo = photos.get(f.photoId);
              if (!photo) return null;
              return (
                <li key={f.id} className="flex items-center gap-4">
                  <Thumb photo={photo} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{photo.title || t("common.untitled")}</p>
                    {photo.takenAt && <p className={`text-sm ${muted}`}>{formatDate(photo.takenAt)}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant={tone === "dark" ? "glass" : "outline"} onClick={() => onView(photo.id, sequence)}>
                        <EyeIcon aria-hidden="true" /> {t("museum.photos.view")}
                      </Button>
                      {onGoTo && (
                        <Button size="sm" variant={tone === "dark" ? "glass" : "outline"} onClick={() => onGoTo(f.id)}>
                          <MapPinIcon aria-hidden="true" /> {t("museum.photos.goTo")}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {groups.unhung.length > 0 && (
        <section aria-labelledby="room-unhung">
          <h3 id="room-unhung" className="font-display text-xl">
            {t("museum.list.notHung")}
          </h3>
          <ul className="mt-3 grid gap-3">
            {groups.unhung.map((photo) => (
              <li key={photo.id} className="flex items-center gap-4">
                <Thumb photo={photo} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{photo.title || t("common.untitled")}</p>
                  <Button className="mt-2" size="sm" variant={tone === "dark" ? "glass" : "outline"} onClick={() => onView(photo.id, sequence)}>
                    <EyeIcon aria-hidden="true" /> {t("museum.photos.view")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
