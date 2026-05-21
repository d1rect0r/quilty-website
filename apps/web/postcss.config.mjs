/**
 * PostCSS config — Tailwind v4 via `@tailwindcss/postcss`.
 *
 * Tailwind v4 dropped the `tailwindcss` PostCSS plugin path; the new
 * canonical plugin is `@tailwindcss/postcss` (D17 revised). With
 * Tailwind v4's CSS-first @theme block in `app/globals.css`, this PostCSS
 * config is the only piece of build wiring needed — content sources are
 * auto-detected.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
