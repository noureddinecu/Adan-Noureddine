/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B0720', 2: '#130C2E', 3: '#1C1340' },
        brand: { violet: '#7C3AED', pink: '#EC4899', amber: '#F59E0B', cyan: '#22D3EE' },
        gold: '#FBBF24', silver: '#CBD5E1', bronze: '#F97316', fourth: '#60A5FA',
        ok: '#34D399', bad: '#FB7185',
      },
      fontFamily: {
        display: ['"Baloo Bhaijaan 2"', 'Cairo', 'system-ui', 'sans-serif'],
        body: ['Cairo', 'system-ui', 'sans-serif'],
      },
      boxShadow: { glow: '0 0 0 1px rgba(255,255,255,.08), 0 10px 40px -10px rgba(124,58,237,.55)' },
      keyframes: {
        pop: { '0%': { transform: 'scale(.6)', opacity: 0 }, '70%': { transform: 'scale(1.06)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
        rise: { from: { transform: 'translateY(14px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        float: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(4%,-6%) scale(1.08)' } },
        shine: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(251,191,36,.7)' }, '100%': { boxShadow: '0 0 0 18px rgba(251,191,36,0)' } },
        wiggle: { '0%,100%': { transform: 'rotate(-8deg)' }, '50%': { transform: 'rotate(8deg)' } },
      },
      animation: {
        pop: 'pop .55s cubic-bezier(.2,1.4,.4,1) both', rise: 'rise .35s ease-out both', float: 'float 14s ease-in-out infinite',
        shine: 'shine 3s linear infinite', pulseRing: 'pulseRing 1.2s ease-out infinite', wiggle: 'wiggle 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
