"use client";

import { cn } from "@/lib/utils";

interface MeshGradientBgProps {
  className?: string;
}

export function MeshGradientBg({ className }: MeshGradientBgProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 overflow-hidden",
        className
      )}
    >
      {/* ── Light mode: deep blue / slate / cool tones ── */}
      <div className="absolute inset-0 dark:hidden">
        {/* Main large blob — top left */}
        <div
          className="absolute -top-[200px] -left-[100px] w-[700px] h-[700px] rounded-full animate-orb-1 opacity-[0.12]"
          style={{
            background:
              "radial-gradient(circle, #94a3b8 0%, #64748b 40%, transparent 70%)",
          }}
        />
        {/* Warm accent — center right */}
        <div
          className="absolute top-[20%] -right-[50px] w-[500px] h-[500px] rounded-full animate-orb-2 opacity-[0.10]"
          style={{
            background:
              "radial-gradient(circle, #d4a574 0%, #c8956e 40%, transparent 70%)",
          }}
        />
        {/* Cool blue — bottom left */}
        <div
          className="absolute bottom-[-100px] left-[10%] w-[600px] h-[400px] rounded-full animate-orb-3 opacity-[0.09]"
          style={{
            background:
              "radial-gradient(circle, #7c9cc5 0%, #6987b0 40%, transparent 70%)",
          }}
        />
        {/* Small accent — top right */}
        <div
          className="absolute top-[100px] right-[20%] w-[300px] h-[300px] rounded-full animate-orb-4 opacity-[0.08]"
          style={{
            background:
              "radial-gradient(circle, #b8c5d4 0%, #94a3b8 40%, transparent 70%)",
          }}
        />
        {/* Bottom right warm */}
        <div
          className="absolute bottom-[10%] right-[5%] w-[450px] h-[450px] rounded-full animate-orb-5 opacity-[0.07]"
          style={{
            background:
              "radial-gradient(circle, #c8a882 0%, #b8956e 40%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Dark mode: amber / gold / warm tones ── */}
      <div className="absolute inset-0 hidden dark:block">
        {/* Main large blob — top left, golden */}
        <div
          className="absolute -top-[200px] -left-[100px] w-[700px] h-[700px] rounded-full animate-orb-1 opacity-[0.10]"
          style={{
            background:
              "radial-gradient(circle, #e3b44a 0%, #d49a2e 40%, transparent 70%)",
          }}
        />
        {/* Warm amber — center right */}
        <div
          className="absolute top-[20%] -right-[50px] w-[500px] h-[500px] rounded-full animate-orb-2 opacity-[0.08]"
          style={{
            background:
              "radial-gradient(circle, #c8874a 0%, #b87a24 40%, transparent 70%)",
          }}
        />
        {/* Deep gold — bottom left */}
        <div
          className="absolute bottom-[-100px] left-[10%] w-[600px] h-[400px] rounded-full animate-orb-3 opacity-[0.07]"
          style={{
            background:
              "radial-gradient(circle, #d4a054 0%, #b8874a 40%, transparent 70%)",
          }}
        />
        {/* Subtle warm — top right */}
        <div
          className="absolute top-[100px] right-[20%] w-[300px] h-[300px] rounded-full animate-orb-4 opacity-[0.06]"
          style={{
            background:
              "radial-gradient(circle, #eaca72 0%, #d4a054 40%, transparent 70%)",
          }}
        />
        {/* Bottom right bronze */}
        <div
          className="absolute bottom-[10%] right-[5%] w-[450px] h-[450px] rounded-full animate-orb-5 opacity-[0.05]"
          style={{
            background:
              "radial-gradient(circle, #c89050 0%, #995b20 40%, transparent 70%)",
          }}
        />
      </div>

      {/* Grain texture — both modes */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
