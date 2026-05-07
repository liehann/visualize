/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    // Allow the workspace package to be transpiled by Next.
  },
  transpilePackages: ['@visualize/core'],
};

export default nextConfig;
