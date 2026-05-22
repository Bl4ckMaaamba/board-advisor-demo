"use client";

import { cn } from "@/lib/utils";

interface FloatingOrbsProps {
  className?: string;
}

export function FloatingOrbs({ className }: FloatingOrbsProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 overflow-hidden",
        className
      )}
    >
      {/* Orb 1 — top left, large, slow drift */}
      <div
        className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full animate-orb-1
          bg-primary/[0.04] dark:bg-primary/[0.03] blur-[100px]"
      />

      {/* Orb 2 — center right, medium */}
      <div
        className="absolute top-1/3 -right-20 w-[400px] h-[400px] rounded-full animate-orb-2
          bg-primary/[0.03] dark:bg-primary/[0.025] blur-[90px]"
      />

      {/* Orb 3 — bottom center, wide and flat */}
      <div
        className="absolute -bottom-20 left-1/3 w-[600px] h-[300px] rounded-full animate-orb-3
          bg-primary/[0.035] dark:bg-primary/[0.02] blur-[120px]"
      />

      {/* Orb 4 — small accent, top right */}
      <div
        className="absolute top-20 right-1/4 w-[250px] h-[250px] rounded-full animate-orb-4
          bg-primary/[0.025] dark:bg-primary/[0.02] blur-[80px]"
      />

      {/* Orb 5 — very subtle, bottom left */}
      <div
        className="absolute bottom-1/4 -left-10 w-[350px] h-[350px] rounded-full animate-orb-5
          bg-primary/[0.02] dark:bg-primary/[0.015] blur-[100px]"
      />

      {/* Fine grain texture overlay for depth */}
      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
