import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext checks multipart bodies before dispatching App Router POST routes.
  // Match the existing 4 MB OACIQ dossier limit, with room for multipart headers.
  // The API still enforces its own stricter file/content-length limits.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
