"use client";

import Link from "next/link";
import { LockKeyholeIcon, PencilIcon } from "lucide-react";
import { GalleryIllustration } from "@/components/landing/gallery-illustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEMPLATE_PALETTES } from "@/features/museums/template-palettes";
import { isTemplateId } from "@/features/museums/templates";
import { useI18n } from "@/i18n/client";
import type { MuseumCard as MuseumCardData } from "@/services/museum-service";

export function MuseumCard({ museum }: { museum: MuseumCardData }) {
  const { t, formatRelative } = useI18n();
  const palette = TEMPLATE_PALETTES[isTemplateId(museum.templateId) ? museum.templateId : "minimal-white"];
  const canEdit = museum.role !== "VISITOR";
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(36,35,33,0.04),0_12px_30px_-18px_rgba(36,35,33,0.25)] transition-shadow hover:shadow-[0_1px_2px_rgba(36,35,33,0.05),0_18px_40px_-18px_rgba(36,35,33,0.35)]" data-testid="museum-card">
      <Link href={`/museum/${museum.id}`} className="relative block aspect-[16/10] overflow-hidden" style={{ background: museum.coverColor ?? palette.back[1] }} tabIndex={-1} aria-hidden="true">
        {museum.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed short-lived URL
          <img src={museum.coverUrl} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <GalleryIllustration className="size-full" animated={false} palette={palette} idPrefix={`card-${museum.id}`} figures={false} />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-2xl leading-tight">
            <Link href={`/museum/${museum.id}`} className="hover:underline" data-testid="museum-card-link">
              {museum.name}
            </Link>
          </h3>
          <Badge variant="secondary" className="shrink-0">
            <LockKeyholeIcon aria-hidden="true" />
            {t("common.private")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {museum.role === "OWNER" ? t("common.roles.OWNER") : t("dashboard.ownedBy", { name: museum.ownerName })}
          {" · "}
          {t("dashboard.photos", { count: museum.photoCount })}
          {" · "}
          {/* Relative times differ between server render and hydration by a few seconds. */}
          <span suppressHydrationWarning>
            {museum.lastVisitedAt ? t("dashboard.lastVisited", { time: formatRelative(museum.lastVisitedAt) }) : t("dashboard.neverVisited")}
          </span>
        </p>
        <div className="mt-auto flex gap-2 pt-1">
          <Button asChild size="sm">
            <Link href={`/museum/${museum.id}`}>{t("dashboard.enter")}</Link>
          </Button>
          {canEdit && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/editor/${museum.id}`} data-testid="museum-card-edit">
                <PencilIcon aria-hidden="true" />
                {t("dashboard.edit")}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
