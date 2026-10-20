"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, FootprintsIcon, HandIcon, Loader2Icon, PersonStandingIcon, RotateCcwIcon, ShuffleIcon } from "lucide-react";
import { useUnsavedGuard } from "@/components/editor/save-status";
import { Button } from "@/components/ui/button";
import { Slider, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import {
  ACCENT_COLORS,
  ACCESSORIES,
  BODY_TYPES,
  BOTTOMS,
  CLOTHING_COLORS,
  EYE_COLORS,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLORS,
  HAIR_STYLES,
  HEADWEAR,
  SKIN_TONES,
  TOPS,
  randomAvatar,
  sameAvatar,
  type AvatarConfig,
} from "@/features/avatars/config";
import { useI18n } from "@/i18n/client";
import { api, errorKey } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { detectWebGL } from "@/three/scenes/MuseumCanvas";
import type { StageMode } from "@/three/scenes/AvatarStage";

const AvatarStage = dynamic(() => import("@/three/scenes/AvatarStage"), {
  ssr: false,
  loading: () => (
    <div className="grid size-full place-items-center text-muted-foreground">
      <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
    </div>
  ),
});

type OptionField = "bodyType" | "hairStyle" | "headwear" | "facialHair" | "glasses" | "top" | "bottom" | "accessory";
type ColorField = "skinTone" | "hairColor" | "eyeColor" | "headwearColor" | "topColor" | "bottomColor" | "shoeColor" | "accessoryColor" | "accent";
type Section = "body" | "hair" | "face" | "clothing" | "extras" | "presence";

const OPTIONS: Record<OptionField, readonly string[]> = {
  bodyType: BODY_TYPES,
  hairStyle: HAIR_STYLES,
  headwear: HEADWEAR,
  facialHair: FACIAL_HAIR,
  glasses: GLASSES,
  top: TOPS,
  bottom: BOTTOMS,
  accessory: ACCESSORIES,
};

const SWATCHES: Record<ColorField, readonly string[]> = {
  skinTone: SKIN_TONES,
  hairColor: HAIR_COLORS,
  eyeColor: EYE_COLORS,
  headwearColor: CLOTHING_COLORS,
  topColor: CLOTHING_COLORS,
  bottomColor: CLOTHING_COLORS,
  shoeColor: ["#2b2c30", "#f4f1ea", "#5c4030", "#8a5a36", "#1f3554", "#8f2f35"],
  accessoryColor: CLOTHING_COLORS,
  accent: ACCENT_COLORS,
};

const SECTIONS: Array<{ key: Section; fields: Array<OptionField | ColorField | "height"> }> = [
  { key: "body", fields: ["bodyType", "height", "skinTone"] },
  { key: "hair", fields: ["hairStyle", "hairColor", "headwear", "headwearColor"] },
  { key: "face", fields: ["eyeColor", "facialHair", "glasses"] },
  { key: "clothing", fields: ["top", "topColor", "bottom", "bottomColor", "shoeColor"] },
  { key: "extras", fields: ["accessory", "accessoryColor"] },
  { key: "presence", fields: ["accent"] },
];

function isOptionField(f: string): f is OptionField {
  return f in OPTIONS;
}

/** Fields that have no visible effect with the current choices are hidden. */
function fieldVisible(field: string, c: AvatarConfig) {
  if (field === "headwearColor") return c.headwear !== "none";
  if (field === "accessoryColor") return c.accessory !== "none" && c.accessory !== "necklace";
  if (field === "bottom" || field === "bottomColor") return c.top !== "dress";
  return true;
}

export function AvatarEditor({ initial, saved: initiallySaved, returnTo }: { initial: AvatarConfig; saved: boolean; returnTo: string | null }) {
  const { t } = useI18n();
  const [base, setBase] = useState(initial);
  const [config, setConfig] = useState(initial);
  const [saved, setSaved] = useState(initiallySaved);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<StageMode>("idle");
  const [waveKey, setWaveKey] = useState(0);
  const [webgl] = useState(() => detectWebGL());
  const dirty = useMemo(() => !sameAvatar(config, base), [config, base]);
  useUnsavedGuard(dirty, t("avatar.unsaved"));

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => setConfig((c) => ({ ...c, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ config: AvatarConfig }>("/api/me/avatar", { method: "PUT", body: { config } });
      setBase(res.config);
      setConfig(res.config);
      setSaved(true);
      toast.success(t("avatar.saved"));
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  const label = (field: OptionField | ColorField | "height") => t(`avatar.fields.${field}`);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        {returnTo && (
          <Button asChild variant="ghost" size="sm" className="mb-3 -ms-2">
            <Link href={returnTo}>
              <ArrowLeftIcon className="rtl:rotate-180" aria-hidden="true" />
              {t("avatar.backToMuseum")}
            </Link>
          </Button>
        )}
        <p className="text-eyebrow text-gold-deep">{t("nav.avatar")}</p>
        <h1 className="mt-1 font-display text-4xl font-medium sm:text-5xl">{t("avatar.title")}</h1>
        <p className="mt-2 max-w-md text-muted-foreground">{t("avatar.subtitle")}</p>

        <div className="relative mt-6 aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-[#ebe5da] shadow-sm sm:aspect-[5/5]">
          {webgl ? (
            <AvatarStage config={config} mode={mode} waveKey={waveKey} label={t("avatar.previewLabel")} />
          ) : (
            <div className="grid size-full place-items-center p-8 text-center text-sm text-muted-foreground">{t("avatar.noWebgl")}</div>
          )}
          {webgl && <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-charcoal/60">{t("avatar.actions.rotateHint")}</p>}
        </div>
        {webgl && (
          <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label={t("avatar.previewLabel")}>
            <Button size="sm" variant={mode === "idle" ? "default" : "outline"} aria-pressed={mode === "idle"} onClick={() => setMode("idle")}>
              <PersonStandingIcon aria-hidden="true" />
              {t("avatar.actions.idle")}
            </Button>
            <Button size="sm" variant={mode === "walk" ? "default" : "outline"} aria-pressed={mode === "walk"} onClick={() => setMode("walk")} data-testid="avatar-walk">
              <FootprintsIcon aria-hidden="true" />
              {t("avatar.actions.walk")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWaveKey((k) => k + 1)} data-testid="avatar-wave">
              <HandIcon aria-hidden="true" />
              {t("avatar.actions.wave")}
            </Button>
          </div>
        )}
      </div>

      <div className="min-w-0">
        {!saved && <p className="mb-5 rounded-xl border border-gold/30 bg-gold/10 p-4 text-sm">{t("avatar.defaultNote")}</p>}
        <Tabs defaultValue="body">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl sm:w-fit">
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="h-9 flex-none" data-testid={`avatar-tab-${s.key}`}>
                {t(`avatar.sections.${s.key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {SECTIONS.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-2 space-y-7">
              {s.fields
                .filter((f) => fieldVisible(f, config))
                .map((field) =>
                  field === "height" ? (
                    <fieldset key={field}>
                      <legend className="mb-3 text-sm font-medium">{label(field)}</legend>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{t("avatar.heightShort")}</span>
                        <Slider
                          min={0.92}
                          max={1.08}
                          step={0.01}
                          value={[config.height]}
                          onValueChange={([v]) => v !== undefined && set("height", Math.round(v * 100) / 100)}
                          aria-label={label(field)}
                          className="max-w-sm"
                        />
                        <span className="text-xs text-muted-foreground">{t("avatar.heightTall")}</span>
                      </div>
                    </fieldset>
                  ) : isOptionField(field) ? (
                    <OptionPicker key={field} field={field} label={label(field)} value={config[field]} onChange={(v) => set(field, v as never)} />
                  ) : (
                    <ColorPicker
                      key={field}
                      field={field}
                      label={label(field)}
                      value={config[field]}
                      swatches={SWATCHES[field]}
                      customLabel={t("avatar.fields.customColor")}
                      hint={field === "accent" ? t("avatar.accentHint") : undefined}
                      onChange={(v) => set(field, v)}
                    />
                  ),
                )}
            </TabsContent>
          ))}
        </Tabs>

        <div className="sticky bottom-0 z-10 -mx-5 mt-10 flex flex-wrap items-center gap-2 border-t border-border bg-background/95 px-5 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
          <Button variant="outline" onClick={() => setConfig(randomAvatar())} data-testid="avatar-randomize">
            <ShuffleIcon aria-hidden="true" />
            {t("avatar.actions.randomize")}
          </Button>
          <Button variant="ghost" onClick={() => setConfig(base)} disabled={!dirty}>
            <RotateCcwIcon aria-hidden="true" />
            {t("avatar.actions.reset")}
          </Button>
          <Button className="ms-auto" variant="gold" onClick={() => void save()} disabled={(!dirty && saved) || saving} data-testid="avatar-save">
            {saving && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            {saving ? t("avatar.actions.saving") : t("avatar.actions.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OptionPicker({ field, label, value, onChange }: { field: OptionField; label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {OPTIONS[field].map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt)}
              data-testid={`avatar-${field}-${opt}`}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active ? "border-charcoal bg-charcoal text-ivory" : "border-border bg-card hover:border-foreground/30",
              )}
            >
              {t(`avatar.options.${field}.${opt}` as "avatar.options.bodyType.slim")}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColorPicker({
  field,
  label,
  value,
  swatches,
  customLabel,
  hint,
  onChange,
}: {
  field: ColorField;
  label: string;
  value: string;
  swatches: readonly string[];
  customLabel: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const custom = !swatches.includes(value);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label={label}>
        {swatches.map((c, i) => {
          const active = c === value;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label} ${i + 1}`}
              title={c}
              onClick={() => onChange(c)}
              data-testid={`avatar-${field}-${i}`}
              className={cn(
                "size-9 rounded-full border border-black/10 shadow-inner transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active && "ring-2 ring-charcoal ring-offset-2 ring-offset-background",
              )}
              style={{ background: c }}
            />
          );
        })}
        <label
          className={cn(
            "relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-foreground/30 text-[10px] text-muted-foreground",
            custom && "ring-2 ring-charcoal ring-offset-2 ring-offset-background",
          )}
          style={custom ? { background: value } : undefined}
          title={customLabel}
        >
          {!custom && "+"}
          <span className="sr-only">{customLabel}</span>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </fieldset>
  );
}
