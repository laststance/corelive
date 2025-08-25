/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Playwright実行前などのビルド時間短縮のため
  },
  // Electron configuration - keep images unoptimized for better compatibility
  images: {
    unoptimized: true,
  },
  // Configure webpack for Electron environment
  webpack: (config, { isServer }) => {
    // Handle Electron environment
    if (process.env.ELECTRON_BUILD) {
      // Handle Node.js modules in Electron renderer
      config.externals = config.externals || []
      if (!isServer) {
        config.externals.push({
          electron: 'require("electron")',
        })
      }
    }

    return config
  },
}

export default nextConfig
