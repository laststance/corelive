// This file has been automatically migrated to valid ESM format by Storybook.
import path from 'path'
import { fileURLToPath } from 'url'

import type { StorybookConfig } from '@storybook/nextjs-vite'
import tailwindcss from '@tailwindcss/postcss'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
    {
      name: '@storybook/addon-mcp',
      options: {
        toolsets: { dev: true, docs: true },
        experimentalFormat: 'markdown',
      },
    },
  ],
  features: {
    experimentalComponentsManifest: true,
  },
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  viteFinal: (config) => {
    // "use client"ディレクティブを適切に処理するための設定
    config.define = {
      ...config.define,
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development',
      ),
    }

    // Reactの"use client"ディレクティブを処理するための設定
    config.optimizeDeps = {
      ...config.optimizeDeps,
      include: [
        ...(config.optimizeDeps?.include || []),
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
    }

    // Tailwind CSS v4 PostCSS configuration
    // Explicitly configure PostCSS to use @tailwindcss/postcss
    config.css = {
      ...config.css,
      postcss: {
        plugins: [
          tailwindcss({
            // Use project root as base for source detection
            base: path.resolve(__dirname, '..'),
          }),
        ],
      },
    }

    return config
  },
}

export default config
