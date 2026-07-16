import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages serves static files directly. Exporting the current UI
  // produces an index.html for the project root instead of requiring a Worker
  // runtime just to render the landing page.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
