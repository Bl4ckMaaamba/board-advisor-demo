"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  targetOpacity: number;
  fadeSpeed: number;
}

interface ParticlesBgProps {
  className?: string;
  particleCount?: number;
  speed?: number;
  connectionDistance?: number;
  particleColor?: string;
  particleColorDark?: string;
  lineColor?: string;
  lineColorDark?: string;
  maxRadius?: number;
  minRadius?: number;
}

export function ParticlesBg({
  className,
  particleCount = 60,
  speed = 0.3,
  connectionDistance = 150,
  particleColor = "100, 116, 139",
  particleColorDark = "212, 175, 96",
  lineColor = "100, 116, 139",
  lineColorDark = "212, 175, 96",
  maxRadius = 2.5,
  minRadius = 0.8,
}: ParticlesBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const [isDark, setIsDark] = useState(false);

  // Watch for theme changes
  useEffect(() => {
    const check = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const initParticles = useCallback(
    (width: number, height: number) => {
      const particles: Particle[] = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          radius: minRadius + Math.random() * (maxRadius - minRadius),
          opacity: Math.random() * 0.5 + 0.1,
          targetOpacity: Math.random() * 0.6 + 0.2,
          fadeSpeed: 0.002 + Math.random() * 0.005,
        });
      }
      return particles;
    },
    [particleCount, speed, maxRadius, minRadius]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (particlesRef.current.length === 0) {
        particlesRef.current = initParticles(canvas.width, canvas.height);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);

    const pColor = isDark ? particleColorDark : particleColor;
    const lColor = isDark ? lineColorDark : lineColor;
    // Light mode needs higher opacity to stand out on pastel bg
    const opacityBoost = isDark ? 1 : 1.6;
    const lineOpacityBoost = isDark ? 0.4 : 0.7;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Pulse opacity
        if (Math.abs(p.opacity - p.targetOpacity) < 0.01) {
          p.targetOpacity = Math.random() * 0.6 + 0.15;
        }
        p.opacity += (p.targetOpacity - p.opacity) * p.fadeSpeed;

        // Mouse repulsion
        const dx = p.x - mouseRef.current.x;
        const dy = p.y - mouseRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120;
          p.vx += (dx / dist) * force * 0.15;
          p.vy += (dy / dist) * force * 0.15;
        }

        // Dampen velocity
        p.vx *= 0.999;
        p.vy *= 0.999;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pColor}, ${Math.min(p.opacity * opacityBoost, 1)})`;
        ctx.fill();

        // Draw connections
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const ddx = p.x - p2.x;
          const ddy = p.y - p2.y;
          const distance = Math.sqrt(ddx * ddx + ddy * ddy);

          if (distance < connectionDistance) {
            const lineOpacity =
              (1 - distance / connectionDistance) *
              Math.min(p.opacity, p2.opacity) *
              lineOpacityBoost;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${lColor}, ${lineOpacity})`;
            ctx.lineWidth = isDark ? 0.5 : 0.7;
            ctx.stroke();
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [
    isDark,
    initParticles,
    connectionDistance,
    particleColor,
    particleColorDark,
    lineColor,
    lineColorDark,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none fixed inset-0", className)}
      style={{ zIndex: 0 }}
    />
  );
}
