import { defineConfig } from "unocss";
import { colors } from "./theme-colors";

export default defineConfig({
  theme: {
    colors,
    fontSize: {
      "slide-xs": ["0.75rem", "1.2"],
      "slide-sm": ["0.875rem", "1.4"],
      "slide-base": ["1rem", "1.6"],
      "slide-lg": ["1.25rem", "1.5"],
      "slide-xl": ["1.5rem", "1.4"],
      "slide-2xl": ["2rem", "1.3"],
      "slide-3xl": ["2.5rem", "1.2"],
      "slide-4xl": ["3rem", "1.1"],
    },
  },
  preflights: [
    {
      getCSS: ({ theme }) => `
        :root {
          --slidev-theme-primary: ${theme.colors.text.light};
        }
        html.dark {
          --slidev-theme-primary: ${theme.colors.text.dark};
        }
        .slidev-layout.cover h1 {
          font-size: ${theme.fontSize["slide-3xl"][0]}; 
        }
        .slidev-layout h1 + p {
          opacity: 1;
        }
        .slidev-layout tr {
          border-bottom: none;
        }
      `,
    },
  ],
  shortcuts: {
    "bg-main": "bg-bg-light text-text-light dark:(bg-bg-dark text-text-dark)",
    "token-heading": "text-slide-3xl font-bold",
    "token-subheading": "text-slide-xl font-semibold",
    "token-body": "text-slide-lg leading-relaxed",
    "token-statement": "text-slide-2xl font-semibold leading-snug",
    "token-caption": "text-slide-sm",
    "token-badge": "inline-block px-3 py-1 rounded-full text-slide-sm font-medium",
    "token-badge-accent": "token-badge bg-accent/15 text-accent dark:text-accent-light",
    "token-card":
      "rounded-xl p-6 bg-white/80 dark:bg-white/5 backdrop-blur-sm border border-black/10 dark:border-white/10 shadow-sm",
  },
});
