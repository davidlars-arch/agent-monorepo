import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

const allowedDevOrigins = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((entry) => entry.family === "IPv4" && !entry.internal)
  .map((entry) => entry.address);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0"
          }
        ]
      }
    ];
  },
  transpilePackages: ["@agent/repo-graph", "@agent/ui"]
};

export default nextConfig;
