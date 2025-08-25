/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Playwright実行前などのビルド時間短縮のため
  },
}

export default nextConfig
