import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#3b5bdb',
        brand2: '#7048e8',
        accent: '#0ca678'
      }
    }
  },
  plugins: []
};

export default config;
