"use client";

import dynamic from "next/dynamic";
import { MuseumLoading } from "@/components/museum/MuseumLoading";
import type { SceneData } from "@/features/museums/scene-types";

const LiveMuseum = dynamic(() => import("./live-museum"), { ssr: false, loading: () => <MuseumLoading /> });

export function LiveMuseumLoader({ initialScene }: { initialScene: SceneData }) {
  return <LiveMuseum initialScene={initialScene} />;
}
