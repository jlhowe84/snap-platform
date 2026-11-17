import type { NextConfig } from "next";

// cacheComponents stays off for Phase 0: every screen reads the signed-in
// person's data through RLS, so pages render per request. Revisit when the
// public portal pages arrive.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
