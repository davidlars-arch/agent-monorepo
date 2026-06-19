import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
