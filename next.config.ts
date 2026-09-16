import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: "/ui-lab/:path*",
      has: [{ type: "host", value: "fixplan-ui-lab-public-20260909.vercel.app" }],
      destination: "https://fixplan-iota.vercel.app/ui-lab/:path*",
      permanent: true,
    }];
  },
};

export default nextConfig;
