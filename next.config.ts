import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@babel/core", "@babel/parser", "@babel/traverse", "esbuild", "openai"],
};

export default nextConfig;
