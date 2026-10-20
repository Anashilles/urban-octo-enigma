"use client";

import { useMemo, useState } from "react";
import { CompassIcon, EyeIcon, FrameIcon, HeartIcon, MapPinIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SceneData } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { photoImageUrl } from "./photo-urls";

interface Props {
  scene: SceneData;
  open: boolean;
  onClose: () => void;
  onView: (photoId: string, sequence: string[]) => void;
  onLocate: (frameId: string) => void;
  onGoTo: (frameId: string) => void;
  onPlace?: (photoId: string) => void;
  onToggleFavorite?: (photoId: string, favorite: boolean) => void;
}

/** When a photo was taken, or added if the date is unknown (ISO strings sort by time). */
function photoDate(p: { takenAt: string | null; createdAt: string }) {
  return p.takenAt ?? p.createdAt;
}

/** In-museum collection browser: search, filter by collection, view, locate, go to or place a photo. */
export function PhotosPanel({ scene, open, onClose, onView, onLocate, onGoTo, onPlace, onToggleFavorite }: Props) {
  const { t, formatDate } = useI18n();
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<string>("all");
  const framesByPhoto = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of scene.frames) if (!m.has(f.photoId)) m.set(f.photoId, f.id);
    return m;
  }, [scene.frames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    let list = scene.photos;
    if (collection === "favorites") list = list.filter((p) => p.favorite);
    else if (collection === "timeline") list = [...list].sort((a, b) => photoDate(a).localeCompare(photoDate(b)));
    else if (collection !== "all") {
      const col = scene.collections.find((c) => c.id === collection);
      const order = new Map((col?.photoIds ?? []).map((id, i) => [id, i]));
      list = list.filter((p) => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    if (q) list = list.filter((p) => `${p.title} ${p.caption}`.toLocaleLowerCase().includes(q));
    return list;
  }, [scene.photos, scene.collections, collection, query]);
  const sequence = filtered.map((p) => p.id);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="start" tone="dark" modal={false} closeLabel={t("common.close")} className="flex flex-col" data-hud-panel data-testid="photos-panel">
        <SheetHeader>
          <SheetTitle>{t("museum.photos.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("museum.photos.search")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ivory/50" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("museum.photos.search")}
              aria-label={t("museum.photos.search")}
              className="border-white/15 bg-white/5 ps-9 text-ivory placeholder:text-ivory/45"
              data-testid="photos-search"
            />
          </div>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger className="border-white/15 bg-white/5 text-ivory" aria-label={t("museum.photos.all")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("museum.photos.all")}</SelectItem>
              <SelectItem value="timeline">{t("museum.photos.timeline")}</SelectItem>
              {!scene.isDemo && <SelectItem value="favorites">{t("museum.photos.favorites")}</SelectItem>}
              {scene.collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-ivory/60">{scene.photos.length ? t("museum.photos.noResults") : t("museum.photos.empty")}</p>
          ) : (
            <ul className="grid gap-3">
              {filtered.map((photo, i) => {
                const frameId = framesByPhoto.get(photo.id);
                const url = photoImageUrl(photo, "thumb");
                // Timeline: a heading whenever the month changes.
                const month = collection === "timeline" ? formatDate(photoDate(photo), { year: "numeric", month: "long" }) : null;
                const prev = i > 0 && collection === "timeline" ? formatDate(photoDate(filtered[i - 1]!), { year: "numeric", month: "long" }) : null;
                return (
                  <li key={photo.id} className="grid gap-2">
                    {month && month !== prev && <h3 className="pt-2 text-eyebrow text-gold">{month}</h3>}
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="aspect-square w-20 shrink-0 overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-gold"
                          style={{ background: photo.dominantColor }}
                          onClick={() => onView(photo.id, sequence)}
                          aria-label={`${t("museum.photos.view")} ${photo.title}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                          {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className="line-clamp-2 flex-1 text-sm font-medium">{photo.title || t("common.untitled")}</p>
                            {onToggleFavorite && (
                              <button
                                type="button"
                                onClick={() => onToggleFavorite(photo.id, !photo.favorite)}
                                aria-pressed={photo.favorite}
                                aria-label={photo.favorite ? t("museum.photos.unfavorite") : t("museum.photos.favorite")}
                                className="rounded-full p-1 text-ivory/70 hover:text-gold"
                              >
                                <HeartIcon className={cn("size-4", photo.favorite && "fill-gold text-gold")} />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-ivory/55">
                            {photo.takenAt ? formatDate(photo.takenAt) : ""}
                            {!frameId && ` ${t("museum.list.notHung")}`}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Button size="sm" variant="glass" onClick={() => onView(photo.id, sequence)}>
                              <EyeIcon aria-hidden="true" />
                              {t("museum.photos.view")}
                            </Button>
                            {frameId && (
                              <>
                                <Button size="sm" variant="glass" onClick={() => onLocate(frameId)} data-testid="photo-locate">
                                  <CompassIcon aria-hidden="true" />
                                  {t("museum.photos.locate")}
                                </Button>
                                <Button size="sm" variant="glass" onClick={() => onGoTo(frameId)} data-testid="photo-goto">
                                  <MapPinIcon aria-hidden="true" />
                                  {t("museum.photos.goTo")}
                                </Button>
                              </>
                            )}
                            {onPlace && (
                              <Button size="sm" variant="glass" onClick={() => onPlace(photo.id)} data-testid="photo-place">
                                <FrameIcon aria-hidden="true" />
                                {t("museum.photos.place")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
