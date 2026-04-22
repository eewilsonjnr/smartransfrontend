import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/smartransbackend.vercel.app/api/:path*",
        destination: "https://smartransbackend.vercel.app/api/:path*",
      },
    ];
  },
};

export default nextConfig;
