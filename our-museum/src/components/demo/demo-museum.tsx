"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { SparklesIcon } from "lucide-react";
import { MuseumExperience } from "@/components/museum/MuseumExperience";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildDemoScene } from "@/features/museums/demo-scene";
import { isTemplateId, TEMPLATE_IDS, type TemplateId } from "@/features/museums/templates";
import { useT } from "@/i18n/client";
import { useMuseumStore } from "@/store/museum-store";

export default function DemoMuseum({ createHref }: { createHref: string }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("template");
  const templateId: TemplateId = isTemplateId(raw) ? raw : "minimal-white";
  const scene = useMemo(() => buildDemoScene(templateId, t), [templateId, t]);
  useEffect(() => {
    useMuseumStore.getState().setScene(scene);
  }, [scene]);

  return (
    <MuseumExperience
      exitHref="/"
      badge={<Badge variant="glass" data-testid="demo-badge">{t("demo.badge")}</Badge>}
      toolbar={
        <>
          <Select value={templateId} onValueChange={(v) => router.replace(`/demo?template=${v}`)}>
            <SelectTrigger className="glass-dark h-10 w-auto min-w-44 rounded-full border-white/10 text-ivory" aria-label={t("demo.chooseTemplate")} data-testid="template-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t(`templates.${id}.name`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="gold" size="sm" className="h-10">
            <Link href={createHref}>
              <SparklesIcon aria-hidden="true" />
              <span className="hidden sm:inline">{t("demo.createOwn")}</span>
            </Link>
          </Button>
        </>
      }
    />
  );
}
