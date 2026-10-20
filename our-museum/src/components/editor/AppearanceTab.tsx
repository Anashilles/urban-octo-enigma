"use client";

import { toast } from "sonner";
import { GalleryIllustration } from "@/components/landing/gallery-illustration";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FRAME_STYLES } from "@/features/photo-placement/placement";
import { TEMPLATE_PALETTES } from "@/features/museums/template-palettes";
import { isTemplateId } from "@/features/museums/templates";
import { FLOOR_MATERIALS, LIGHTING_PRESETS } from "@/features/rooms/geometry";
import { useI18n } from "@/i18n/client";
import { useEditor } from "./editor-context";
import { WALL_SWATCHES } from "./RoomsTab";

export function AppearanceTab() {
  const { t } = useI18n();
  const { scene, museumId, mutate, errorText } = useEditor();
  const theme = scene.theme;
  const overrides = scene.museum.themeOverrides;
  const canEdit = scene.viewer.permissions["museum.editAppearance"];
  const set = (patch: Record<string, unknown>) =>
    mutate(`/api/museums/${museumId}`, { method: "PATCH", body: { theme: { ...overrides, ...patch } } }).catch((e) => toast.error(errorText(e)));
  const templateId = isTemplateId(scene.museum.templateId) ? scene.museum.templateId : "minimal-white";

  return (
    <div className="grid max-w-4xl gap-8">
      <div>
        <h2 className="font-display text-3xl">{t("editor.tabs.appearance")}</h2>
        <p className="mt-1 text-muted-foreground">{t("editor.appearance.body")}</p>
      </div>
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-6">
          <fieldset className="grid gap-2" disabled={!canEdit}>
            <legend className="mb-1 text-sm font-medium">{t("editor.appearance.wallColor")}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {WALL_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={theme.wallColor === c}
                  onClick={() => void set({ wallColor: c })}
                  className="size-9 rounded-full border aria-pressed:ring-2 aria-pressed:ring-gold aria-pressed:ring-offset-2"
                  style={{ background: c }}
                />
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={theme.wallColor}
                  onChange={(e) => void set({ wallColor: e.target.value })}
                  className="size-9 cursor-pointer rounded-full border-0 bg-transparent"
                  aria-label={t("editor.appearance.custom")}
                />
                {t("editor.appearance.custom")}
              </label>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>{t("editor.appearance.floor")}</Label>
              <Select value={theme.floorMaterial} onValueChange={(v) => void set({ floorMaterial: v })} disabled={!canEdit}>
                <SelectTrigger aria-label={t("editor.appearance.floor")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLOOR_MATERIALS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(`editor.floors.${f}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("editor.appearance.lighting")}</Label>
              <Select value={theme.lightingPreset} onValueChange={(v) => void set({ lightingPreset: v })} disabled={!canEdit}>
                <SelectTrigger aria-label={t("editor.appearance.lighting")} data-testid="appearance-lighting">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIGHTING_PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`editor.lighting.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("editor.appearance.frameStyle")}</Label>
              <Select value={theme.defaultFrameStyle} onValueChange={(v) => void set({ defaultFrameStyle: v })} disabled={!canEdit}>
                <SelectTrigger aria-label={t("editor.appearance.frameStyle")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`editor.walls.styles.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {canEdit && Object.keys(overrides).length > 0 && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                void mutate(`/api/museums/${museumId}`, {
                  method: "PATCH",
                  body: { theme: {} },
                }).catch((e) => toast.error(errorText(e)))
              }
            >
              {t("editor.appearance.reset")}
            </Button>
          )}
        </div>
        <figure className="overflow-hidden rounded-2xl border border-border">
          <GalleryIllustration className="aspect-[16/10] w-full" animated={false} palette={TEMPLATE_PALETTES[templateId]} idPrefix="appearance" />
          <figcaption className="p-3 text-sm">
            <span className="text-muted-foreground">{t("editor.appearance.template")}:</span> {t(`templates.${templateId}.name`)}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
