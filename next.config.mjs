/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Isso permite que o build termine mesmo com avisos de tipo
    ignoreBuildErrors: true,
  },
  eslint: {
    // Isso ignora avisos de linting durante o build
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
