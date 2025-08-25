/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Playwright実行前などのビルド時間短縮のため
  },
  // Electron configuration
  trailingSlash: true,
  images: {
    unoptimized: true, // Required for static export
  },
  // Enable static export for Electron
  output:
    process.env.NODE_ENV === 'production' && process.env.ELECTRON_BUILD
      ? 'export'
      : undefined,
  // Configure asset prefix for Electron
  assetPrefix:
    process.env.NODE_ENV === 'production' && process.env.ELECTRON_BUILD
      ? './'
      : undefined,
}

export default nextConfig
