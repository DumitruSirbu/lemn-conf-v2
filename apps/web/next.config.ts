import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lemnaria/three-adapter"],
};

export default nextConfig;
