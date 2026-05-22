"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface NavItem {
  name: string;
  href: string;
  icon?: React.ReactNode;
  children?: {
    name: string;
    href: string;
    description?: string;
  }[];
}

export function FloatingNavbar({
  items,
  className,
  logo,
  rightContent,
}: {
  items: NavItem[];
  className?: string;
  logo?: React.ReactNode;
  rightContent?: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!active) return;
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [active]);

  return (
    <div className={cn("fixed top-6 inset-x-0 z-50 flex justify-center", className)}>
      <motion.nav
        ref={navRef}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative flex items-center gap-1 rounded-2xl border border-border bg-card/80 backdrop-blur-xl px-4 py-2.5 shadow-lg shadow-black/5 dark:shadow-black/20"
      >
        {/* Logo */}
        {logo && <div className="mr-4 pr-4 border-r border-border">{logo}</div>}

        {/* Nav items */}
        {items.map((item) => (
          <NavMenuItem
            key={item.name}
            item={item}
            active={active}
            setActive={setActive}
          />
        ))}

        {/* Right content (theme toggle, profile, etc.) */}
        {rightContent && (
          <div className="ml-4 pl-4 border-l border-border flex items-center gap-2">
            {rightContent}
          </div>
        )}
      </motion.nav>
    </div>
  );
}

function NavMenuItem({
  item,
  active,
  setActive,
}: {
  item: NavItem;
  active: string | null;
  setActive: (item: string | null) => void;
}) {
  const pathname = usePathname();
  const isDropdownOpen = active === item.name;

  // Check if this nav item matches the current page
  const isCurrentPage =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));

  const handleClick = (e: React.MouseEvent) => {
    if (item.children) {
      e.preventDefault();
      setActive(isDropdownOpen ? null : item.name);
    } else {
      setActive(null);
    }
  };

  return (
    <div className="relative">
      <Link
        href={item.href}
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors duration-200",
          isCurrentPage
            ? "text-primary bg-primary/10"
            : isDropdownOpen
            ? "text-foreground bg-secondary/80"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-current={isCurrentPage ? "page" : undefined}
      >
        {item.icon && <span className="w-4 h-4">{item.icon}</span>}
        {item.name}
      </Link>

      {/* Dropdown */}
      <AnimatePresence>
        {isDropdownOpen && item.children && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full left-0 mt-2 w-56 rounded-xl border border-border bg-card/95 backdrop-blur-xl p-2 shadow-xl shadow-black/10 dark:shadow-black/30"
          >
            {item.children.map((child) => (
              <Link
                key={child.name}
                href={child.href}
                onClick={() => setActive(null)}
                className="block px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <span className="font-medium text-foreground">{child.name}</span>
                {child.description && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {child.description}
                  </span>
                )}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
