/** Tailwind: dùng cho bố cục và tiện ích; màu lấy từ biến CSS của giao diện hiện có. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false }, // giữ reset/base của style.css
  theme: {
    extend: {
      colors: {
        teal: 'var(--teal)', sky: 'var(--sky)', muted: 'var(--muted)', line: 'var(--line)',
        good: 'var(--green)', bad: 'var(--red)', warn: 'var(--amber)',
      },
      fontFamily: { display: ['Unbounded', 'Lexend', 'sans-serif'], body: ['Lexend', 'Be Vietnam Pro', 'sans-serif'] },
    },
  },
};
