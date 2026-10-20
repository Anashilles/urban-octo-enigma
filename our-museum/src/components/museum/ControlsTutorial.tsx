"use client";

import { FootprintsIcon, HandIcon, ImageIcon, MousePointer2Icon, UsersRoundIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";

export function ControlsTutorial({
  open,
  onClose,
  coarse,
  showInvite,
}: {
  open: boolean;
  onClose: () => void;
  coarse: boolean;
  showInvite: boolean;
}) {
  const t = useT();
  const steps = coarse
    ? [
        { icon: FootprintsIcon, text: t("museum.tutorial.mobileMove") },
        { icon: HandIcon, text: t("museum.tutorial.mobileLook") },
        { icon: ImageIcon, text: t("museum.tutorial.mobileTap") },
      ]
    : [
        { icon: FootprintsIcon, text: t("museum.tutorial.move") },
        { icon: MousePointer2Icon, text: t("museum.tutorial.look") },
        { icon: ImageIcon, text: t("museum.tutorial.approach") },
        { icon: HandIcon, text: t("museum.tutorial.interact") },
        { icon: ZapIcon, text: t("museum.tutorial.run") },
      ];
  if (showInvite) steps.push({ icon: UsersRoundIcon, text: t("museum.tutorial.invite") });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={t("common.close")} data-testid="tutorial">
        <DialogHeader>
          <DialogTitle>{t("museum.tutorial.title")}</DialogTitle>
          <DialogDescription>{t("museum.tutorial.reopen")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {steps.map((s) => (
            <li key={s.text} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold-deep">
                <s.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-[15px] leading-snug">{s.text}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose} size="lg" data-testid="tutorial-start" autoFocus>
            {t("museum.tutorial.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
