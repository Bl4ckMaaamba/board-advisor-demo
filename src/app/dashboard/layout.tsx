"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FloatingNavbar } from "@/components/ui/floating-navbar";
import { ParticlesBg } from "@/components/ui/particles-bg";
import { BoardProvider } from "@/lib/board-context";
import { BoardSelector } from "@/components/ui/board-selector";
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  ClipboardList,
  MessageSquare,
  Sun,
  Moon,
  User,
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const navItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      name: "Boards",
      href: "/dashboard/boards",
      icon: <Users className="w-4 h-4" />,
      children: [
        {
          name: "Mes Boards",
          href: "/dashboard/boards",
          description: "Tous vos conseils d'administration",
        },
        {
          name: "Créer un Board",
          href: "/dashboard/boards/new",
          description: "Nouveau conseil d'administration",
        },
      ],
    },
    {
      name: "Réunions",
      href: "/dashboard/meetings",
      icon: <Calendar className="w-4 h-4" />,
    },
    {
      name: "Documents",
      href: "/dashboard/documents",
      icon: <FileText className="w-4 h-4" />,
    },
    {
      name: "Comptes Rendus",
      href: "/dashboard/reports",
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      name: "Assistant",
      href: "/dashboard/chat",
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ];

  return (
    <BoardProvider>
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Fixed opaque band behind the floating navbar — prevents any content from showing through */}
      <div className="fixed top-0 inset-x-0 h-20 z-40 bg-background/90 backdrop-blur-sm pointer-events-none" />
      {/* Animated particles background */}
      <ParticlesBg
        particleCount={55}
        speed={0.3}
        connectionDistance={150}
        particleColor="140, 100, 50"
        particleColorDark="212, 175, 96"
        lineColor="130, 95, 45"
        lineColorDark="212, 175, 96"
        maxRadius={2.8}
      />

      <FloatingNavbar
        items={navItems}
        logo={null}
        rightContent={
          <>
            <BoardSelector />
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label="Changer le thème"
            >
              {isDark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <Link
              href="/dashboard/account"
              className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
              aria-label="Mon compte"
            >
              <User className="w-4 h-4" />
            </Link>
          </>
        }
      />

      {/* Page content with top padding for the navbar */}
      <main className="relative z-10 pt-24 px-6 pb-12 max-w-7xl mx-auto">{children}</main>
    </div>
    </BoardProvider>
  );
}
