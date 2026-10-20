import { cn } from "@/lib/utils";

/** Our Museum mark: a gallery archway framing a picture. Original artwork. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)} fill="none">
      <path
        d="M6 29V14.5C6 8.7 10.5 4 16 4s10 4.7 10 10.5V29"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M3.5 29h25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="11" y="13" width="10" height="8" rx="0.6" stroke="var(--gold)" strokeWidth="1.6" />
      <path d="M12.6 19.4l2.6-2.8 2 2 1.2-1.1 1.4 1.9" stroke="var(--gold)" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[1.45rem] leading-none font-medium tracking-[0.01em]">{label}</span>
    </span>
  );
}
