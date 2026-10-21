import type { StartInfo } from './contracts';

const SWITCH = '--galeo-start-info=';

/** The renderer switch that carries a window's start info, so its page paints without a round trip to main. */
export function startInfoArg(info: StartInfo): string {
  return `${SWITCH}${JSON.stringify(info)}`;
}

/** The start info main put on this renderer's command line; null when there is none or it doesn't parse. */
export function startInfoFrom(argv: readonly string[]): StartInfo | null {
  const arg = argv.find((each) => each.startsWith(SWITCH));
  if (!arg) return null;
  try {
    return JSON.parse(arg.slice(SWITCH.length)) as StartInfo;
  } catch {
    return null;
  }
}
