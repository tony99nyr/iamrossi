import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
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
  serverExternalPackages: ['@sparticuz/chromium'],
};

export default withBundleAnalyzer(nextConfig);
