/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors are caught locally via `npx tsc --noEmit`. Keep build strict.
    ignoreBuildErrors: false,
  },
  eslint: {
    // ESLint isn't configured for this project yet, so don't fail the build on it.
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
