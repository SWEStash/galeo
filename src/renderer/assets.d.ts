// Vite imports: `?inline` gives a stylesheet's processed text; plain `.css` is injected globally.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
declare module '*.css';

// `?worker&url`: the URL of a module bundled as a worker, for `new Worker` under Trusted Types.
declare module '*?worker&url' {
  const url: string;
  export default url;
}
