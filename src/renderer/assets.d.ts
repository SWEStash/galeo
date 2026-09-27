// Vite imports: `?inline` gives a stylesheet's processed text; plain `.css` is injected globally.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
declare module '*.css';
