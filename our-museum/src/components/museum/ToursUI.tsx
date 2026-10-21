"use client";

import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, FlagIcon, RouteIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { SceneData } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";
import { goToTourStop, tourStops } from "./tour";
import { photoImageUrl } from "./photo-urls";
import { usePanelExitFocus } from "./focus";

export interface TourHooks {
  /** Shown when the visitor may lead tours for everyone (live museums). */
  onLead?: (tourId: string) => void;
  /** Leader moved to another stop. */
  onStep?: (index: number) => void;
  /** Leader ended, or a follower left. */
  onEnd?: (mode: "solo" | "leading" | "following") => void;
  guideName?: string | null;
  canLead?: boolean;
}

/** List of guided tours with "take" and (live) "lead for everyone". */
export function ToursPanel({ scene, hooks }: { scene: SceneData; hooks: TourHooks }) {
  const { t } = useI18n();
  const panel = useMuseumStore((s) => s.panel);
  const setPanel = useMuseumStore((s) => s.setPanel);
  const exitFocus = usePanelExitFocus();
  const start = (tourId: string, lead: boolean) => {
    exitFocus.toScene();
    setPanel(null);
    if (lead && hooks.onLead) hooks.onLead(tourId);
    else goToTourStop(scene, { tourId, index: 0, mode: "solo" });
  };
  return (
    <Sheet open={panel === "tours"} onOpenChange={(o) => !o && setPanel(null)} modal={false}>
      <SheetContent
        side="start"
        tone="dark"
        modal={false}
        closeLabel={t("common.close")}
        className="overflow-y-auto"
        onCloseAutoFocus={exitFocus.onCloseAutoFocus}
        data-hud-panel
        data-testid="tours-panel"
      >
        <SheetHeader>
          <SheetTitle>{t("museum.tours.title")}</SheetTitle>
          <SheetDescription className="text-ivory/60">{t("museum.tours.description")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-5 pb-8">
          {scene.tours.length === 0 && <p className="text-sm text-ivory/60">{t("museum.tours.empty")}</p>}
          {scene.tours.map((tour) => {
            const stops = tourStops(scene, tour);
            const first = stops[0] ? scene.frames.find((f) => f.id === stops[0]!.frameId) : null;
            const photo = first ? scene.photos.find((p) => p.id === first.photoId) : null;
            const thumb = photo ? photoImageUrl(photo, "thumb") : null;
            return (
              <article key={tour.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4" data-testid="tour-item">
                <div className="flex gap-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg" style={{ background: photo?.dominantColor ?? "#333" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                    {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-xl leading-tight">{tour.name}</h3>
                    <p className="text-xs text-ivory/55">{t("museum.tours.stops", { count: stops.length })}</p>
                    {tour.description && <p className="mt-1 line-clamp-2 text-sm text-ivory/70">{tour.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="gold" onClick={() => start(tour.id, false)} disabled={!stops.length} data-testid="tour-start">
                    <RouteIcon aria-hidden="true" />
                    {t("museum.tours.start")}
                  </Button>
                  {hooks.onLead && hooks.canLead && (
                    <Button size="sm" variant="glass" onClick={() => start(tour.id, true)} disabled={!stops.length} title={t("museum.tours.leadHint")} data-testid="tour-lead">
                      <UsersRoundIcon aria-hidden="true" />
                      {t("museum.tours.lead")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The current stop: note, navigation (solo/leader) or "following" (follower). */
export function TourCard({ scene, hooks, onView }: { scene: SceneData; hooks: TourHooks; onView: (frameId: string) => void }) {
  const { t, dir } = useI18n();
  const active = useMuseumStore((s) => s.tour);
  const viewerOpen = useMuseumStore((s) => Boolean(s.viewer));
  const setTour = useMuseumStore((s) => s.setTour);
  if (!active || viewerOpen) return null;
  const tour = scene.tours.find((x) => x.id === active.tourId);
  if (!tour) return null;
  const stops = tourStops(scene, tour);
  const index = Math.min(active.index, stops.length - 1);
  const stop = stops[index];
  if (!stop) return null;
  const frame = scene.frames.find((f) => f.id === stop.frameId);
  const photo = frame ? scene.photos.find((p) => p.id === frame.photoId) : null;
  const last = index === stops.length - 1;
  const following = active.mode === "following";
  const go = (i: number) => {
    goToTourStop(scene, { ...active, index: i });
    if (active.mode === "leading") hooks.onStep?.(i);
  };
  const end = () => {
    setTour(null);
    hooks.onEnd?.(active.mode);
  };
  const finish = () => {
    end();
    toast.success(t("museum.tours.finished"));
  };
  const Prev = dir === "rtl" ? ChevronRightIcon : ChevronLeftIcon;
  const Next = dir === "rtl" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    // Phones: under the top bar; larger screens: bottom corner, clear of the photo in front.
    <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-3 sm:top-auto sm:bottom-4 sm:justify-start sm:px-4">
      <section
        className="glass-dark pointer-events-auto grid w-full max-w-md gap-3 rounded-2xl border border-gold/30 p-4 text-ivory shadow-xl sm:max-w-sm"
        aria-label={tour.name}
        aria-live="polite"
        data-testid="tour-card"
        data-index={index}
        data-mode={active.mode}
      >
        <header className="flex items-center gap-2 text-xs">
          <RouteIcon className="size-4 text-gold" aria-hidden="true" />
          <span className="truncate font-medium">{tour.name}</span>
          <span className="text-ivory/55">· {t("museum.tours.stopOf", { current: index + 1, total: stops.length })}</span>
          <button type="button" onClick={end} className="ms-auto grid size-7 place-items-center rounded-full hover:bg-white/10" aria-label={following ? t("museum.tours.leave") : t("museum.tours.end")} data-testid="tour-end">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </header>
        {(following || active.mode === "leading") && (
          <p className="flex items-center gap-1.5 text-xs text-gold">
            <UsersRoundIcon className="size-3.5" aria-hidden="true" />
            {following ? t("museum.tours.following", { name: hooks.guideName ?? "" }) : t("museum.tours.leading")}
          </p>
        )}
        <div>
          <h3 className="font-display text-2xl leading-tight">{photo?.title || t("museum.prompt.untitled")}</h3>
          {stop.note && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ivory/80">{stop.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="glass" onClick={() => frame && onView(frame.id)} data-testid="tour-view">
            <EyeIcon aria-hidden="true" />
            {t("museum.tours.view")}
          </Button>
          {!following && (
            <div className="ms-auto flex gap-2">
              <Button size="sm" variant="glass" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("museum.tours.previous")} data-testid="tour-prev">
                <Prev aria-hidden="true" />
              </Button>
              {last ? (
                <Button size="sm" variant="gold" onClick={finish} data-testid="tour-finish">
                  <FlagIcon aria-hidden="true" />
                  {t("museum.tours.finish")}
                </Button>
              ) : (
                <Button size="sm" variant="gold" onClick={() => go(index + 1)} data-testid="tour-next">
                  {t("museum.tours.next")}
                  <Next aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
          {following && (
            <Button size="sm" variant="glass" className="ms-auto" onClick={end} data-testid="tour-leave">
              {t("museum.tours.leave")}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
