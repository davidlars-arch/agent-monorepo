import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent/repo-graph", "@agent/ui"]
};

export default nextConfig;
