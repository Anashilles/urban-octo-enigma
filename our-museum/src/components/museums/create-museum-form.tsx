"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { GalleryIllustration } from "@/components/landing/gallery-illustration";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { TEMPLATE_PALETTES } from "@/features/museums/template-palettes";
import { TEMPLATE_IDS, type TemplateId } from "@/features/museums/templates";
import { useT } from "@/i18n/client";
import { api, errorKey } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().trim().min(1, "museumNew.nameRequired").max(80),
  description: z.string().trim().max(500),
  templateId: z.enum(TEMPLATE_IDS),
});

export function CreateMuseumForm() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", templateId: "warm-romantic" as TemplateId },
  });
  const selected = useWatch({ control: form.control, name: "templateId" });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/museums", { method: "POST", body: values });
      router.push(`/editor/${id}?tab=photos&created=1`);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-10" noValidate data-testid="create-museum-form">
      <div className="grid gap-5 sm:max-w-xl">
        <Field id="name" label={t("museumNew.name")} error={form.formState.errors.name && t("museumNew.nameRequired")}>
          <Input placeholder={t("museumNew.namePlaceholder")} maxLength={80} {...form.register("name")} />
        </Field>
        <Field id="description" label={<>{t("museumNew.description")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span></>}>
          <Textarea rows={2} maxLength={500} placeholder={t("museumNew.descriptionPlaceholder")} {...form.register("description")} />
        </Field>
      </div>

      <fieldset>
        <legend className="font-display text-2xl">{t("museumNew.style")}</legend>
        <div role="radiogroup" className="mt-4 grid gap-5 md:grid-cols-2">
          {TEMPLATE_IDS.map((id) => {
            const active = selected === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => form.setValue("templateId", id)}
                className={cn(
                  "group overflow-hidden rounded-2xl border bg-card text-start transition focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active ? "border-gold shadow-[0_0_0_3px_color-mix(in_oklab,var(--gold)_35%,transparent)]" : "border-border hover:border-gold/50",
                )}
                data-testid={`template-${id}`}
              >
                <div className="relative aspect-[16/9] overflow-hidden">
                  <GalleryIllustration className="size-full" animated={false} palette={TEMPLATE_PALETTES[id]} idPrefix={`tpl-${id}`} figures={false} />
                  {active && (
                    <span className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-gold text-ink shadow">
                      <CheckIcon className="size-4" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="grid gap-1 p-5">
                  <span className="font-display text-2xl">{t(`templates.${id}.name`)}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{t(`templates.${id}.description`)}</span>
                  <span className="mt-1 text-xs tracking-wide text-gold-deep uppercase">{t("museumNew.rooms")}</span>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting} data-testid="create-museum-submit">
          {form.formState.isSubmitting && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          {form.formState.isSubmitting ? t("museumNew.creating") : t("museumNew.create")}
        </Button>
      </div>
    </form>
  );
}
