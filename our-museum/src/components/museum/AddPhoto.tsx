"use client";

import { useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ScenePhoto } from "@/features/museums/scene-types";
import { useI18n } from "@/i18n/client";
import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES } from "@/services/image-processing-types";
import { cn } from "@/lib/utils";
import { photoImageUrl } from "./photo-urls";

const ACCEPT = [...ACCEPTED_MIME_TYPES, ...ACCEPTED_EXTENSIONS].join(",");

/**
 * Adds one photo from the visitor's device. The caller does the upload (to the
 * server in a real museum, kept in the browser in the preview) and reports
 * progress; it resolves to the new photo's id, or null when it failed (the
 * caller has already explained why).
 */
export type UploadPhoto = (file: File, onProgress: (fraction: number) => void) => Promise<string | null>;

export function DevicePhotoButton({
  onUpload,
  onAdded,
  label,
  className,
  variant = "gold",
}: {
  onUpload: UploadPhoto;
  onAdded: (photoId: string) => void;
  label?: string;
  className?: string;
  variant?: "gold" | "glass" | "outline";
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProgress(0);
    try {
      const photoId = await onUpload(file, setProgress);
      if (photoId) onAdded(photoId);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void pick(file);
        }}
        data-testid="device-photo-input"
      />
      <Button type="button" variant={variant} className={className} disabled={busy} onClick={() => input.current?.click()} data-testid="device-photo">
        {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : <ImageUpIcon aria-hidden="true" />}
        {busy ? (progress < 1 ? t("museum.addPhoto.uploading", { percent: Math.round(progress * 100) }) : t("museum.addPhoto.preparing")) : (label ?? t("museum.addPhoto.button"))}
      </Button>
      {busy && (
        <span className="sr-only" role="status">
          {progress < 1 ? t("museum.addPhoto.uploading", { percent: Math.round(progress * 100) }) : t("museum.addPhoto.preparing")}
        </span>
      )}
    </>
  );
}

/**
 * "Change picture" in the photo viewer: hang another photo from the library,
 * or a new one from the device, in the frame being viewed.
 */
export function ChangePictureButton({
  frameId,
  currentPhotoId,
  photos,
  onChange,
  onUpload,
}: {
  frameId: string;
  currentPhotoId: string;
  photos: ScenePhoto[];
  onChange: (frameId: string, photoId: string) => Promise<boolean>;
  onUpload?: UploadPhoto;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (photoId: string) => {
    if (photoId === currentPhotoId) return setOpen(false);
    setBusy(photoId);
    try {
      if (await onChange(frameId, photoId)) setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button size="sm" variant="glass" onClick={() => setOpen(true)} data-testid="change-picture">
        <RefreshCwIcon aria-hidden="true" />
        {t("museum.addPhoto.change")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent closeLabel={t("common.close")} className="max-h-[85dvh] max-w-xl overflow-y-auto" data-testid="change-picture-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{t("museum.addPhoto.changeTitle")}</DialogTitle>
            <DialogDescription>{t("museum.addPhoto.changeBody")}</DialogDescription>
          </DialogHeader>
          {onUpload && <DevicePhotoButton onUpload={onUpload} onAdded={(id) => void choose(id)} label={t("museum.addPhoto.fromDevice")} className="justify-self-start" />}
          {photos.length > 0 && (
            <section className="grid gap-2" aria-labelledby="change-picture-library">
              <h3 id="change-picture-library" className="text-sm font-medium">
                {t("museum.addPhoto.fromLibrary")}
              </h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {/* Newest first, so a photo just added is easy to find. */}
                {[...photos].reverse().map((p) => {
                  const url = photoImageUrl(p, "thumb");
                  const current = p.id === currentPhotoId;
                  const title = p.title || t("common.untitled");
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void choose(p.id)}
                        disabled={Boolean(busy)}
                        aria-current={current || undefined}
                        aria-label={current ? `${title}, ${t("museum.addPhoto.current")}` : title}
                        className={cn(
                          "relative aspect-square w-full overflow-hidden rounded-lg border-2 transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
                          current ? "border-gold" : "border-transparent hover:border-foreground/30",
                        )}
                        style={{ background: p.dominantColor }}
                        data-testid="change-picture-option"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL */}
                        {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
                        {busy === p.id && (
                          <span className="absolute inset-0 grid place-items-center bg-ink/50">
                            <Loader2Icon className="size-5 animate-spin text-ivory" aria-hidden="true" />
                          </span>
                        )}
                        {current && <span className="absolute inset-x-0 bottom-0 bg-gold/90 py-0.5 text-center text-[10px] font-medium text-ink">{t("museum.addPhoto.current")}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
