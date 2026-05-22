import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        gold: {
          50: "#fdf9ef",
          100: "#f9f0d4",
          200: "#f2dfa8",
          300: "#eaca72",
          400: "#e3b44a",
          500: "#d49a2e",
          600: "#b87a24",
          700: "#995b20",
          800: "#7d4921",
          900: "#673d1e",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        shine: "shine var(--duration, 14s) infinite linear",
        "fade-in": "fadeIn 0.7s ease-out forwards",
        "slide-up": "slideUp 0.5s ease-out forwards",
        "orb-1": "orb1 25s ease-in-out infinite",
        "orb-2": "orb2 30s ease-in-out infinite",
        "orb-3": "orb3 22s ease-in-out infinite",
        "orb-4": "orb4 28s ease-in-out infinite",
        "orb-5": "orb5 35s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        orb1: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(60px, 40px) scale(1.1)" },
          "66%": { transform: "translate(-30px, 70px) scale(0.95)" },
        },
        orb2: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(-50px, 30px) scale(1.05)" },
          "50%": { transform: "translate(-80px, -20px) scale(1.1)" },
          "75%": { transform: "translate(-20px, -50px) scale(0.95)" },
        },
        orb3: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "40%": { transform: "translate(70px, -30px) scale(1.08)" },
          "70%": { transform: "translate(-40px, -20px) scale(0.97)" },
        },
        orb4: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "30%": { transform: "translate(-40px, 50px) scale(1.12)" },
          "60%": { transform: "translate(30px, 20px) scale(0.9)" },
        },
        orb5: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(50px, -40px) scale(1.06)" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
