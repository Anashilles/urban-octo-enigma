import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-5 rounded-xl border border-border bg-card py-6 text-card-foreground shadow-[0_1px_2px_rgba(36,35,33,0.04),0_8px_24px_-12px_rgba(36,35,33,0.12)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid gap-1.5 px-6", className)} {...props} />;
}

/** Cards usually sit directly under a page's h1, so titles default to h2; pass level={3} inside a titled section. */
function CardTitle({ className, level = 2, ...props }: React.ComponentProps<"h2"> & { level?: 2 | 3 }) {
  const Heading = level === 3 ? "h3" : "h2";
  return <Heading data-slot="card-title" className={cn("font-display text-xl leading-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2 px-6", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
