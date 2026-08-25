/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      // Base gutter only. The step-ups live in `globals.css`, because Tailwind v4 reads a
      // single value here and silently ignores the per-breakpoint object the v3 config
      // accepted (measured: `"3rem"` applies, `{ DEFAULT, sm, lg }` leaves it at the default).
      padding: "1rem",
      screens: {
        "2xl": "1440px"
      }
    },
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif"
        ],
        display: [
          "var(--font-display)",
          "Iowan Old Style",
          "Georgia",
          "serif"
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "JetBrains Mono",
          "SF Mono",
          "monospace"
        ]
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        panel: "0 20px 55px -28px hsl(173 70% 18% / 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
