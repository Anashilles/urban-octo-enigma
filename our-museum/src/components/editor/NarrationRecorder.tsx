"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckIcon, Loader2Icon, MicIcon, RotateCcwIcon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/components/museum/StopNarration";
import type { SceneNarration } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { MAX_NARRATION_MS } from "@/lib/validation/narration";
import { useEditor } from "./editor-context";

/** Container formats the server accepts, in order of preference. */
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
const MIN_NARRATION_MS = 500;

function recordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

type State =
  | { phase: "idle" }
  | { phase: "recording"; startedAt: number; elapsed: number }
  | { phase: "preview"; blob: Blob; url: string; durationMs: number }
  | { phase: "saving"; blob: Blob; url: string; durationMs: number };

/**
 * Records, previews and saves the voice narration for one stop of a saved tour.
 * Recording stops on its own at the length limit.
 */
export function NarrationRecorder({ tourId, frameId, narration }: { tourId: string; frameId: string; narration: SceneNarration | null }) {
  const { t } = useI18n();
  const { museumId, mutate, errorText } = useEditor();
  const [state, setState] = useState<State>({ phase: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<{ tick?: number; limit?: number }>({});
  const previewUrl = state.phase === "preview" || state.phase === "saving" ? state.url : null;

  const clearTimers = () => {
    window.clearInterval(timers.current.tick);
    window.clearTimeout(timers.current.limit);
  };

  // Release the microphone and timers if the stop is removed mid-recording.
  useEffect(
    () => () => {
      clearTimers();
      const r = recorder.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
      r?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => (previewUrl ? () => URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);

  const start = async () => {
    const type = recordingType();
    if (!type || !navigator.mediaDevices?.getUserMedia) {
      toast.error(t("editor.tours.narration.unsupported"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error(t("editor.tours.narration.micDenied"));
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64_000 });
    const startedAt = performance.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      const durationMs = Math.min(MAX_NARRATION_MS, Math.round(performance.now() - startedAt));
      if (durationMs < MIN_NARRATION_MS || !chunks.length) {
        toast.error(t("editor.tours.narration.tooShort"));
        setState({ phase: "idle" });
        return;
      }
      const blob = new Blob(chunks, { type: type.split(";")[0] });
      setState({ phase: "preview", blob, url: URL.createObjectURL(blob), durationMs });
    };
    recorder.current = rec;
    rec.start(1000);
    setState({ phase: "recording", startedAt, elapsed: 0 });
    timers.current.tick = window.setInterval(() => setState((s) => (s.phase === "recording" ? { ...s, elapsed: performance.now() - s.startedAt } : s)), 250);
    // Stop slightly early so container overhead never pushes the duration past the limit.
    timers.current.limit = window.setTimeout(() => recorder.current?.stop(), MAX_NARRATION_MS - 250);
  };

  const stop = () => recorder.current?.stop();

  const save = async () => {
    if (state.phase !== "preview") return;
    setState({ ...state, phase: "saving" });
    try {
      await mutate(`/api/museums/${museumId}/tours/${tourId}/narrations/${frameId}`, {
        method: "PUT",
        body: state.blob,
        headers: { "x-duration-ms": String(state.durationMs) },
      });
      toast.success(t("editor.tours.narration.saved"));
      setState({ phase: "idle" });
    } catch (e) {
      toast.error(errorText(e));
      setState({ ...state, phase: "preview" });
    }
  };

  const remove = async () => {
    try {
      await mutate(`/api/museums/${museumId}/tours/${tourId}/narrations/${frameId}`, { method: "DELETE" });
      toast.success(t("editor.tours.narration.deleted"));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <div className="grid gap-2 rounded-lg bg-muted/50 p-2.5" data-testid="narration" data-phase={state.phase} data-has-narration={narration ? "true" : "false"}>
      {state.phase === "idle" && narration && (
        <>
          <p className="text-xs font-medium text-muted-foreground">{t("editor.tours.narration.current", { duration: formatClock(narration.durationMs) })}</p>
          {/* Native controls: keyboard and screen reader accessible. */}
          <audio controls preload="none" src={narration.url} className="h-9 w-full" aria-label={t("editor.tours.narration.title")} data-testid="narration-current" />
        </>
      )}
      {state.phase === "recording" && (
        <p className="flex items-center gap-2 text-sm font-medium text-destructive" role="status" data-testid="narration-recording">
          <span className="size-2.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" aria-hidden="true" />
          {t("editor.tours.narration.recording", { time: `${formatClock(state.elapsed)} / ${formatClock(MAX_NARRATION_MS)}` })}
        </p>
      )}
      {(state.phase === "preview" || state.phase === "saving") && (
        <>
          <p className="text-xs text-muted-foreground">{t("editor.tours.narration.preview")}</p>
          <audio controls src={state.url} className="h-9 w-full" aria-label={t("editor.tours.narration.preview")} data-testid="narration-preview" />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {state.phase === "idle" && (
          <>
            <Button size="sm" variant="outline" onClick={() => void start()} data-testid="narration-record">
              {narration ? <RotateCcwIcon aria-hidden="true" /> : <MicIcon aria-hidden="true" />}
              {narration ? t("editor.tours.narration.replace") : t("editor.tours.narration.record")}
            </Button>
            {narration && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void remove()} data-testid="narration-delete">
                <Trash2Icon aria-hidden="true" />
                {t("editor.tours.narration.delete")}
              </Button>
            )}
            {!narration && <span className="text-xs text-muted-foreground">{t("editor.tours.narration.hint", { minutes: MAX_NARRATION_MS / 60_000 })}</span>}
          </>
        )}
        {state.phase === "recording" && (
          <Button size="sm" variant="destructive" onClick={stop} data-testid="narration-stop">
            <SquareIcon aria-hidden="true" />
            {t("editor.tours.narration.stop")}
          </Button>
        )}
        {(state.phase === "preview" || state.phase === "saving") && (
          <>
            <Button size="sm" variant="gold" onClick={() => void save()} disabled={state.phase === "saving"} data-testid="narration-save">
              {state.phase === "saving" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
              {t("editor.tours.narration.use")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState({ phase: "idle" })} disabled={state.phase === "saving"} data-testid="narration-discard">
              <XIcon aria-hidden="true" />
              {t("editor.tours.narration.discard")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
