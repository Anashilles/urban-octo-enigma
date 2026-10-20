"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActivityIcon, LayoutGridIcon, LogOutIcon, SettingsIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/i18n/client";
import { authClient } from "@/lib/auth/client";

export interface MenuUser {
  displayName: string;
  email: string;
  isAnonymous: boolean;
  isAdmin: boolean;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "·";
}

export function UserMenu({ user, tone = "light" }: { user: MenuUser; tone?: "light" | "dark" }) {
  const t = useT();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={tone === "dark" ? "glass" : "outline"}
          size="icon"
          aria-label={t("nav.account")}
          data-testid="user-menu"
          className="font-display text-base"
        >
          {initials(user.displayName)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="text-sm font-medium text-foreground">{user.displayName}</span>
          {!user.isAnonymous && <span className="truncate">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutGridIcon /> {t("common.dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/avatar">
            <UserRoundIcon /> {t("nav.avatar")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon /> {t("common.settings")}
          </Link>
        </DropdownMenuItem>
        {user.isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ActivityIcon /> {t("nav.admin")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} data-testid="sign-out">
          <LogOutIcon /> {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
