import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
  },
  // This project is deployed as a static Cloudflare Pages export. Adding the
  // Cloudflare Worker Vite plugin here generates a second Wrangler config with
  // `main` and `assets`, which Pages correctly rejects.
  plugins: [vinext()],
});
