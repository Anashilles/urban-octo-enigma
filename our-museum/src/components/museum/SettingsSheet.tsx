"use client";

import type { ReactNode } from "react";
import { ListIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem, Separator, Slider, Switch } from "@/components/ui/controls";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/i18n/client";
import { usePreferences, type GraphicsQuality } from "@/store/preferences";

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="text-ivory/90">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  onShowList,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  onShowList: () => void;
  extra?: ReactNode;
}) {
  const t = useT();
  const p = usePreferences();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <SheetContent side="end" tone="dark" modal={false} closeLabel={t("common.close")} className="overflow-y-auto" data-hud-panel data-testid="settings-sheet">
        <SheetHeader>
          <SheetTitle>{t("museum.settings.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("museum.settings.title")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-5 pb-8">
          <section className="grid gap-4">
            <h3 className="text-eyebrow text-gold">{t("museum.settings.controls")}</h3>
            <div className="grid gap-2">
              <Label htmlFor="sens" className="text-ivory/90">
                {t("museum.settings.sensitivity")}
              </Label>
              <Slider id="sens" min={0.2} max={2} step={0.05} value={[p.mouseSensitivity]} onValueChange={([v]) => p.set({ mouseSensitivity: v! })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="speed" className="text-ivory/90">
                {t("museum.settings.speed")}
              </Label>
              <Slider id="speed" min={0.5} max={1.6} step={0.05} value={[p.moveSpeed]} onValueChange={([v]) => p.set({ moveSpeed: v! })} />
            </div>
            <Row id="invert" label={t("museum.settings.invertY")}>
              <Switch id="invert" checked={p.invertY} onCheckedChange={(v) => p.set({ invertY: v })} />
            </Row>
          </section>
          <Separator className="bg-white/10" />
          <section className="grid gap-3">
            <h3 className="text-eyebrow text-gold">{t("museum.settings.camera")}</h3>
            <RadioGroup value={p.cameraMode} onValueChange={(v) => p.set({ cameraMode: v as "first" | "third" })}>
              {(["first", "third"] as const).map((m) => (
                <div key={m} className="flex items-center gap-3">
                  <RadioGroupItem value={m} id={`cam-${m}`} className="border-white/40 data-[state=checked]:border-gold [&_svg]:fill-gold [&_svg]:text-gold" />
                  <Label htmlFor={`cam-${m}`} className="text-ivory/90">
                    {m === "first" ? t("museum.hud.cameraFirst") : t("museum.hud.cameraThird")}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </section>
          <Separator className="bg-white/10" />
          <section className="grid gap-4">
            <h3 className="text-eyebrow text-gold">{t("museum.settings.accessibility")}</h3>
            <Row id="rm" label={t("museum.settings.reducedMotion")}>
              <Switch id="rm" checked={p.reducedMotion} onCheckedChange={(v) => p.set({ reducedMotion: v })} />
            </Row>
            <Row id="hc" label={t("museum.settings.highContrast")}>
              <Switch id="hc" checked={p.highContrast} onCheckedChange={(v) => p.set({ highContrast: v })} />
            </Row>
            <Row id="ol" label={t("museum.settings.outlines")}>
              <Switch id="ol" checked={p.interactionOutlines} onCheckedChange={(v) => p.set({ interactionOutlines: v })} />
            </Row>
            <Button variant="glass" onClick={onShowList} data-testid="open-photo-list">
              <ListIcon aria-hidden="true" />
              {t("museum.settings.photoList")}
            </Button>
          </section>
          <Separator className="bg-white/10" />
          <section className="grid gap-4">
            <h3 className="text-eyebrow text-gold">{t("museum.settings.audio")}</h3>
            <Row id="ambient" label={t("museum.settings.audioOn")}>
              <Switch id="ambient" checked={p.ambientAudio} onCheckedChange={(v) => p.set({ ambientAudio: v })} data-testid="ambient-toggle" />
            </Row>
            <div className="grid gap-2">
              <Label htmlFor="volume" className="text-ivory/90">
                {t("museum.settings.volume")}
              </Label>
              <Slider id="volume" min={0} max={1} step={0.05} value={[p.ambientVolume]} onValueChange={([v]) => p.set({ ambientVolume: v! })} disabled={!p.ambientAudio} />
            </div>
          </section>
          <Separator className="bg-white/10" />
          <section className="grid gap-3">
            <h3 className="text-eyebrow text-gold">{t("museum.settings.graphics")}</h3>
            <div className="grid gap-2">
              <Label htmlFor="quality" className="text-ivory/90">
                {t("museum.settings.quality")}
              </Label>
              <Select value={p.graphicsQuality} onValueChange={(v) => p.set({ graphicsQuality: v as GraphicsQuality })}>
                <SelectTrigger id="quality" className="border-white/15 bg-white/5 text-ivory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("museum.settings.qualityAuto")}</SelectItem>
                  <SelectItem value="low">{t("museum.settings.qualityLow")}</SelectItem>
                  <SelectItem value="medium">{t("museum.settings.qualityMedium")}</SelectItem>
                  <SelectItem value="high">{t("museum.settings.qualityHigh")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
          {extra}
          <Button variant="link" className="justify-self-start px-0 text-ivory/70" onClick={() => p.reset()}>
            {t("museum.settings.reset")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
