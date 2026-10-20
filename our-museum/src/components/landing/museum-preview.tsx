"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { BoxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { usePreferences } from "@/store/preferences";
import { GalleryIllustration } from "./gallery-illustration";

// The 3D preview is only downloaded when the visitor asks for it.
const PreviewCanvas = dynamic(() => import("@/three/scenes/preview-canvas"), {
  ssr: false,
  loading: () => null,
});

export function MuseumPreview() {
  const t = useT();
  const reducedMotion = usePreferences((s) => s.reducedMotion);
  const [show3d, setShow3d] = useState(false);

  return (
    <figure className="animate-fade-up [animation-delay:120ms]">
      <div className="relative aspect-[1200/760] overflow-hidden rounded-[1.75rem] border border-border bg-wall shadow-[0_30px_80px_-40px_rgba(36,35,33,0.45)]">
        {show3d ? (
          <PreviewCanvas />
        ) : (
          <>
            <GalleryIllustration className="absolute inset-0 size-full" animated={!reducedMotion} />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-t from-ink/55 to-transparent p-4 pt-16 sm:p-5 sm:pt-20">
              <p className="max-w-xs text-xs text-ivory/85">{t("landing.previewHint")}</p>
              <Button variant="glass" size="sm" onClick={() => setShow3d(true)} data-testid="load-preview">
                <BoxIcon aria-hidden="true" />
                {t("landing.previewLoad")}
              </Button>
            </div>
          </>
        )}
      </div>
      {show3d && <figcaption className="mt-3 text-sm text-muted-foreground">{t("landing.previewCaption")}</figcaption>}
    </figure>
  );
}
