/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "ws", "bufferutil", "utf-8-validate"],
  },
};

export default nextConfig;
