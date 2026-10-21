"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, Loader2Icon, PencilIcon, PlusIcon, RouteIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { photoImageUrl } from "@/components/museum/photo-urls";
import type { SceneTour } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { MAX_TOUR_STOPS } from "@/lib/validation/tours";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

interface Draft {
  id: string | null;
  name: string;
  description: string;
  stops: Array<{ frameId: string; note: string }>;
}

export function ToursTab() {
  const { t } = useI18n();
  const { scene, museumId, mutate, errorText } = useEditor();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const photos = new Map(scene.photos.map((p) => [p.id, p]));
  const frameLabel = (frameId: string) => {
    const f = scene.frames.find((x) => x.id === frameId);
    const p = f ? photos.get(f.photoId) : undefined;
    return { frame: f, photo: p, title: p?.title || t("common.untitled") };
  };

  const edit = (tour: SceneTour) => setDraft({ id: tour.id, name: tour.name, description: tour.description, stops: tour.stops.map((s) => ({ frameId: s.frameId, note: s.note })) });

  const save = async () => {
    if (!draft) return;
    if (!draft.stops.length) {
      toast.error(t("editor.tours.needsStops"));
      return;
    }
    setSaving(true);
    try {
      const body = { name: draft.name.trim() || t("editor.tours.namePlaceholder"), description: draft.description, stops: draft.stops };
      if (draft.id) await mutate(`/api/museums/${museumId}/tours/${draft.id}`, { method: "PUT", body });
      else await mutate(`/api/museums/${museumId}/tours`, { method: "POST", body });
      toast.success(t("editor.tours.saved"));
      setDraft(null);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await mutate(`/api/museums/${museumId}/tours/${id}`, { method: "DELETE" });
      toast.success(t("editor.tours.deleted"));
      if (draft?.id === id) setDraft(null);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const move = (i: number, d: -1 | 1) =>
    setDraft((cur) => {
      if (!cur) return cur;
      const stops = [...cur.stops];
      const j = i + d;
      if (j < 0 || j >= stops.length) return cur;
      [stops[i], stops[j]] = [stops[j]!, stops[i]!];
      return { ...cur, stops };
    });

  return (
    <div className="grid max-w-5xl gap-6" data-testid="tours-tab">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl">{t("editor.tours.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("editor.tours.body")}</p>
        </div>
        {!draft && (
          <Button variant="gold" onClick={() => setDraft({ id: null, name: "", description: "", stops: [] })} disabled={!scene.frames.length} data-testid="tour-new">
            <PlusIcon aria-hidden="true" />
            {t("editor.tours.new")}
          </Button>
        )}
      </div>

      {!scene.frames.length && <p className="rounded-xl border border-dashed border-input p-5 text-sm text-muted-foreground">{t("editor.tours.noFrames")}</p>}

      {!draft && (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="tour-list">
          {scene.tours.length === 0 && scene.frames.length > 0 && <li className="text-sm text-muted-foreground">{t("editor.tours.empty")}</li>}
          {scene.tours.map((tour) => (
            <li key={tour.id}>
              <Card>
                <CardHeader>
                  <CardTitle level={3} className="flex items-center gap-2">
                    <RouteIcon className="size-4 text-gold-deep" aria-hidden="true" />
                    {tour.name}
                  </CardTitle>
                  <CardDescription>
                    {t("museum.tours.stops", { count: tour.stops.length })}
                    {tour.description && ` · ${tour.description}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(tour)} data-testid="tour-edit">
                    <PencilIcon aria-hidden="true" />
                    {t("editor.tours.edit")}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2Icon aria-hidden="true" />
                        {t("editor.tours.delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("editor.tours.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("editor.tours.deleteBody")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void remove(tour.id)}>{t("editor.tours.delete")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Card>
            <CardContent className="grid gap-5 pt-6">
              <div className="grid gap-2">
                <Label htmlFor="tour-name">{t("editor.tours.name")}</Label>
                <Input id="tour-name" value={draft.name} maxLength={80} placeholder={t("editor.tours.namePlaceholder")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="tour-name" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tour-description">{t("editor.tours.description")}</Label>
                <Textarea id="tour-description" value={draft.description} maxLength={400} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid gap-3">
                <h3 className="text-sm font-medium">
                  {t("editor.tours.stops")} <span className="text-muted-foreground">({draft.stops.length})</span>
                </h3>
                {draft.stops.length === 0 && <p className="text-sm text-muted-foreground">{t("editor.tours.needsStops")}</p>}
                <ol className="grid gap-3" data-testid="tour-stops">
                  {draft.stops.map((stop, i) => {
                    const { photo, title } = frameLabel(stop.frameId);
                    const thumb = photo ? photoImageUrl(photo, "thumb") : null;
                    return (
                      <li key={`${stop.frameId}-${i}`} className="grid gap-2 rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-charcoal text-xs text-ivory">{i + 1}</span>
                          <div className="size-10 shrink-0 overflow-hidden rounded-md" style={{ background: photo?.dominantColor }}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                            {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                          <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("editor.tours.moveUp")}>
                            <ArrowUpIcon />
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === draft.stops.length - 1} aria-label={t("editor.tours.moveDown")}>
                            <ArrowDownIcon />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setDraft({ ...draft, stops: draft.stops.filter((_, j) => j !== i) })}
                            aria-label={t("editor.tours.remove")}
                          >
                            <XIcon />
                          </Button>
                        </div>
                        <Textarea
                          value={stop.note}
                          maxLength={500}
                          rows={2}
                          placeholder={t("editor.tours.notePlaceholder")}
                          aria-label={`${t("editor.tours.note")} ${i + 1}`}
                          onChange={(e) => setDraft({ ...draft, stops: draft.stops.map((s, j) => (j === i ? { ...s, note: e.target.value } : s)) })}
                        />
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="gold" onClick={() => void save()} disabled={saving} data-testid="tour-save">
                  {saving ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
                  {t("editor.tours.save")}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-24 lg:self-start">
            <CardHeader>
              <CardTitle level={3}>{t("editor.tours.addStops")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="tour-frame-picker">
                {scene.frames.map((f) => {
                  const p = photos.get(f.photoId);
                  const thumb = p ? photoImageUrl(p, "thumb") : null;
                  const inTour = draft.stops.some((s) => s.frameId === f.id);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => draft.stops.length < MAX_TOUR_STOPS && setDraft({ ...draft, stops: [...draft.stops, { frameId: f.id, note: "" }] })}
                        className={cn(
                          "relative aspect-square w-full overflow-hidden rounded-lg border-2 transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                          inTour ? "border-gold" : "border-transparent hover:border-foreground/30",
                        )}
                        style={{ background: p?.dominantColor }}
                        aria-label={`${t("editor.tours.addStops")}: ${p?.title || t("common.untitled")}`}
                        data-testid="tour-add-frame"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                        {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
                        {inTour && (
                          <span className="absolute inset-x-0 bottom-0 bg-gold/90 py-0.5 text-center text-[10px] font-medium text-ink">{t("editor.tours.inTour")}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
