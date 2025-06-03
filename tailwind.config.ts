import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      xs: { min: '0px', max: '639px' },
      sm: '640px', // 	@media (min-width: 640px) { ... }
      md: '768px', // 	@media (min-width: 768px) { ... }
      lg: '1024px', // 	@media (min-width: 1024px) { ... }
      xl: '1280px', // 	@media (min-width: 1280px) { ... }
      '2xl': '1536px', // 	@media (min-width: 1536px) { ... }
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
}
export default config
