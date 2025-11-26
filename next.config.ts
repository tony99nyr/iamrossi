import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'myhockeyrankings.com',
      },
      {
        protocol: 'https',
        hostname: 'ranktech-cdn.s3.us-east-2.amazonaws.com',
      },
    ],
  },
};

export default nextConfig;
