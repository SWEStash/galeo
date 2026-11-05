/**
 * galeo's own icons (docs/design/visual-refresh.md §5): 16 × 16, 1.5 px strokes in `currentColor`,
 * decorative only (`aria-hidden`), since the control that holds one carries the name. React code uses
 * `<Icon>`; imperative code (diagrams, images) uses `iconElement`, which builds the same SVG through
 * `createElementNS`, so nothing passes through HTML parsing (Trusted Types, ADR-010).
 */
type Shape = readonly [tag: 'path' | 'circle' | 'rect', attributes: Readonly<Record<string, string>>];

const dot = (cx: string, cy: string, r = '0.9'): Shape => ['circle', { cx, cy, r, fill: 'currentColor', stroke: 'none' }];

const ICONS = {
  plus: [['path', { d: 'M8 3v10M3 8h10' }]],
  grid: [
    ['rect', { x: '2.5', y: '2.5', width: '4.5', height: '4.5', rx: '1' }],
    ['rect', { x: '9', y: '2.5', width: '4.5', height: '4.5', rx: '1' }],
    ['rect', { x: '2.5', y: '9', width: '4.5', height: '4.5', rx: '1' }],
    ['rect', { x: '9', y: '9', width: '4.5', height: '4.5', rx: '1' }],
  ],
  search: [['circle', { cx: '7', cy: '7', r: '4.25' }], ['path', { d: 'M10.25 10.25 13.5 13.5' }]],
  more: [dot('3.5', '8'), dot('8', '8'), dot('12.5', '8')],
  panel: [['rect', { x: '2', y: '2.5', width: '12', height: '11', rx: '2' }], ['path', { d: 'M6 2.5v11' }]],
  'chevron-left': [['path', { d: 'M10 4 6 8l4 4' }]],
  'chevron-right': [['path', { d: 'M6 4l4 4-4 4' }]],
  'chevron-down': [['path', { d: 'M4 6l4 4 4-4' }]],
  close: [['path', { d: 'M4 4l8 8M12 4l-8 8' }]],
  dot: [dot('8', '8', '3')],
  pin: [['path', { d: 'M9.5 2.5 13.5 6.5 11 7.5 8.5 10 8 13 3 8 6 7.5 8.5 5Z' }], ['path', { d: 'M5.5 10.5 2.5 13.5' }]],
  copy: [
    ['rect', { x: '5.5', y: '5.5', width: '8', height: '8', rx: '1.5' }],
    ['path', { d: 'M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2' }],
  ],
  check: [['path', { d: 'M3 8.5 6.5 12 13 4.5' }]],
  download: [['path', { d: 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10' }]],
  expand: [['path', { d: 'M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9' }]],
  follow: [['path', { d: 'M8 2.5v9M4.5 8 8 11.5 11.5 8M3 13.5h10' }]],
  'zoom-in': [['circle', { cx: '7', cy: '7', r: '4.25' }], ['path', { d: 'M10.25 10.25 13.5 13.5M5 7h4M7 5v4' }]],
  'zoom-out': [['circle', { cx: '7', cy: '7', r: '4.25' }], ['path', { d: 'M10.25 10.25 13.5 13.5M5 7h4' }]],
  fit: [['path', { d: 'M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10' }]],
  reload: [['path', { d: 'M13 8a5 5 0 1 1-1.5-3.55M13 2.5v3h-3' }]],
  file: [['path', { d: 'M9 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.5Z' }], ['path', { d: 'M9 2v3.5h3.5' }]],
  window: [['rect', { x: '2', y: '3', width: '12', height: '10', rx: '2' }], ['path', { d: 'M2 6h12' }]],
  settings: [
    ['path', { d: 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6' }],
    ['circle', { cx: '10', cy: '4.5', r: '1.5' }],
    ['circle', { cx: '6', cy: '11.5', r: '1.5' }],
  ],
  edit: [['path', { d: 'M10.5 3 13 5.5 6 12.5H3.5V10Z' }]],
  warning: [['path', { d: 'M8 2.5 14 13H2Z' }], ['path', { d: 'M8 6.5v3' }], dot('8', '11.25', '0.75')],
} satisfies Record<string, readonly Shape[]>;

type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAME = {
  viewBox: '0 0 16 16',
  width: '16',
  height: '16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.5',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
} as const;

/** React's names for the SVG attributes above. */
const reactName = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const reactProps = (attributes: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(attributes).map(([name, value]) => [name.startsWith('aria-') ? name : reactName(name), value]));

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg {...reactProps(FRAME)} className={className ? `icon ${className}` : 'icon'}>
      {ICONS[name].map(([tag, attributes], index) => {
        const Tag = tag;
        return <Tag key={index} {...reactProps(attributes)} />;
      })}
    </svg>
  );
}

/** The same icon as a DOM element, for code that builds its controls without React. */
export function iconElement(name: IconName, document: Document = globalThis.document): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [attribute, value] of Object.entries(FRAME)) svg.setAttribute(attribute, value);
  svg.setAttribute('class', 'icon');
  for (const [tag, attributes] of ICONS[name]) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [attribute, value] of Object.entries(attributes)) shape.setAttribute(attribute, value);
    svg.append(shape);
  }
  return svg;
}
