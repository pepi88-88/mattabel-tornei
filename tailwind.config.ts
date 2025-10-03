// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: 'rgb(240,125,0)',
          blue:   'rgb(5,43,88)',
        },
      },
      boxShadow: {
        'brand': '0 8px 30px rgba(5,43,88,.35)', // ombra fredda blu
      }
    },
  },
  plugins: [],
}
export default config;
