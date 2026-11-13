// Vite imports: `?raw` gives a sample file's text, bundled with the demo.
declare module '*?raw' {
  const text: string;
  export default text;
}
declare module '*.css';
