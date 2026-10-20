"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { MuseumLoading } from "@/components/museum/MuseumLoading";

const DemoMuseum = dynamic(() => import("./demo-museum"), { ssr: false, loading: () => <MuseumLoading /> });

export function DemoLoader({ createHref }: { createHref: string }) {
  return (
    <Suspense fallback={<MuseumLoading />}>
      <DemoMuseum createHref={createHref} />
    </Suspense>
  );
}
