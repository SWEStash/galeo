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

// The third-party notices, gathered at build time (build/licences.ts).
declare module 'virtual:licences' {
  const notices: {
    packages: { packages: { name: string; version: string; license: string }[]; texts: string[] }[];
    fonts: { name: string; text: string }[];
    electron: string;
  };
  export default notices;
}
