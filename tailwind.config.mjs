import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        serif: [
          'Gowun Batang',
          'Nanum Myeongjo',
          'Batang',
          'serif',
        ],
        caption: [
          'Nanum Myeongjo',
          'Gowun Batang',
          'serif',
        ],
      },
      colors: {
        paper: {
          50: '#FBF9F6',
          100: '#F7F4EF',
          200: '#EFEAE1',
          300: '#E4DDD1',
          400: '#D5CBBF',
        },
        ink: {
          900: '#23201D',
          800: '#34302C',
          700: '#4A453F',
          600: '#68625B',
          500: '#8A837A',
          400: '#B0A99F',
        },
        terracotta: {
          50: '#FDF6F4',
          100: '#F9EAE5',
          500: '#A3482C',
          600: '#8E3D23',
          700: '#75311B',
        },
        forest: {
          50: '#F3F7F4',
          100: '#E3ECE5',
          500: '#3D5E48',
          600: '#314D3A',
          700: '#253C2D',
        },
        wood: {
          950: '#1d120a',
          900: '#2b1b0f',
          800: '#3e2717',
          700: '#543621',
          600: '#6f472c',
          500: '#8c5b39',
          400: '#ab754f',
          300: '#ca9771',
          200: '#e3be9f',
          100: '#f4dfcf',
        },
        night: {
          950: '#141312',
          900: '#1B1A18',
          800: '#252421',
          700: '#33312D',
          600: '#474540',
        },
      },
    },
  },
  plugins: [typography],
};
