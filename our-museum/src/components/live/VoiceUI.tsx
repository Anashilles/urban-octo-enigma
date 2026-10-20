"use client";

import { Loader2Icon, MicIcon, MicOffIcon, PhoneOffIcon, HeadphonesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useRealtimeStore } from "@/store/realtime-store";
import { useVoiceStore } from "@/store/voice-store";
import { HudIconButton } from "@/components/museum/Hud";
import { useMuseumStore } from "@/store/museum-store";
import type { VoiceActions } from "./use-voice";

/** Toolbar microphone: joins voice, then toggles mute. */
export function VoiceButton({ voice }: { voice: VoiceActions }) {
  const t = useT();
  const status = useVoiceStore((s) => s.status);
  const muted = useVoiceStore((s) => s.muted);
  const listenOnly = useVoiceStore((s) => s.listenOnly);
  const speaking = useVoiceStore((s) => s.speaking);
  const online = useRealtimeStore((s) => s.status === "online");
  if (!online && status === "off") return null;
  if (status === "starting")
    return (
      <HudIconButton label={t("museum.voice.starting")} onClick={() => undefined} testId="voice-button">
        <Loader2Icon className="animate-spin" />
      </HudIconButton>
    );
  if (status === "off")
    return (
      <HudIconButton label={t("museum.voice.join")} onClick={voice.join} testId="voice-button">
        <MicOffIcon />
      </HudIconButton>
    );
  if (listenOnly)
    return (
      <HudIconButton label={t("museum.voice.listenOnly")} onClick={() => useMuseumStore.getState().setPanel("people")} active testId="voice-button">
        <HeadphonesIcon />
      </HudIconButton>
    );
  return (
    <span className={cn("rounded-full transition-shadow", speaking && !muted && "shadow-[0_0_0_3px_rgba(201,164,92,0.6)]")}>
      <HudIconButton label={muted ? t("museum.voice.unmute") : t("museum.voice.mute")} onClick={voice.toggleMute} active={!muted} testId="voice-button">
        {muted ? <MicOffIcon /> : <MicIcon />}
      </HudIconButton>
    </span>
  );
}

/** Voice controls inside the People panel. */
export function VoiceSection({ voice, enabled }: { voice: VoiceActions; enabled: boolean }) {
  const t = useT();
  const v = useVoiceStore();
  const online = useRealtimeStore((s) => s.status === "online");
  const connectedCount = Object.values(v.connected).filter((c) => c === "connected").length;
  return (
    <section className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4" aria-labelledby="voice-title" data-testid="voice-section">
      <div className="flex items-center gap-2">
        <h3 id="voice-title" className="text-eyebrow text-gold">
          {t("museum.voice.title")}
        </h3>
        {v.status === "on" && (
          <span className="ms-auto text-xs text-ivory/60" role="status">
            {t("museum.voice.connectedWith", { count: connectedCount })}
          </span>
        )}
      </div>
      {!enabled ? (
        <p className="text-sm text-ivory/60">{t("museum.voice.disabled")}</p>
      ) : v.status === "off" ? (
        <>
          <Button variant="gold" onClick={voice.join} disabled={!online} data-testid="voice-join">
            <MicIcon aria-hidden="true" />
            {t("museum.voice.join")}
          </Button>
          <p className="text-xs leading-relaxed text-ivory/55">{t("museum.voice.privacy")}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-ivory/85">{v.listenOnly ? t("museum.voice.listenOnly") : v.muted ? t("museum.voice.muted") : t("museum.voice.on")}</p>
          <div className="flex flex-wrap gap-2">
            {!v.listenOnly && (
              <Button variant="glass" onClick={voice.toggleMute} disabled={v.status !== "on"} data-testid="voice-mute">
                {v.muted ? <MicIcon aria-hidden="true" /> : <MicOffIcon aria-hidden="true" />}
                {v.muted ? t("museum.voice.unmute") : t("museum.voice.mute")}
              </Button>
            )}
            <Button variant="glass" onClick={voice.leave} data-testid="voice-leave">
              <PhoneOffIcon aria-hidden="true" />
              {t("museum.voice.leave")}
            </Button>
          </div>
          {!v.listenOnly && v.devices.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="voice-device" className="text-ivory/80">
                {t("museum.voice.device")}
              </Label>
              <Select value={v.deviceId ?? undefined} onValueChange={voice.switchDevice}>
                <SelectTrigger id="voice-device" className="border-white/15 bg-white/5 text-ivory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {v.devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <p className="text-xs text-ivory/55">{t("museum.voice.spatialHint")}</p>
        </>
      )}
      {v.error && (
        <p className="text-sm text-[#f2a1a1]" role="alert" data-testid="voice-error">
          {t(`museum.voice.errors.${v.error}`)}
        </p>
      )}
    </section>
  );
}
