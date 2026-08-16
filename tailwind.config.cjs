/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#05060a',
        panel: '#0a0d16',
        neon: '#00f0ff',
        virus: '#ff2ea6',
        arc: '#7c3aed',
        lime: '#b6ff2e',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'glitch-skip': 'glitch 3s infinite',
        float: 'float 7s ease-in-out infinite',
        scan: 'scan 8s linear infinite',
        pulseglow: 'pulseglow 2.4s ease-in-out infinite',
      },
      keyframes: {
        glitch: {
          '0%,92%,100%': { transform: 'translate(0)' },
          '93%': { transform: 'translate(-3px,2px)' },
          '95%': { transform: 'translate(3px,-2px)' },
          '97%': { transform: 'translate(-2px,-1px)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-18px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        pulseglow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(0,240,255,.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(0,240,255,0)' },
        },
      },
    },
  },
  plugins: [],
};
