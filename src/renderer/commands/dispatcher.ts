import { commandFor, tabNumberFor, type Command, type Platform } from '../../shared/keymap';

export interface CommandContext {
  /** The key was pressed in a text field (End and Alt+arrows edit the text there). */
  typing: boolean;
  /** The tab a "go to tab" key names, 1 to 8. */
  tabNumber: number | null;
}

/** Runs a command; `false` declines it (not applicable now), so the key stays with the page. */
export type CommandHandler = (context: CommandContext) => boolean | void;

const NO_CONTEXT: CommandContext = { typing: false, tabNumber: null };

/**
 * The window's one way to run a command, by key or from the palette: parts of the page register
 * what they do for a command while they can do it.
 */
export class CommandDispatcher {
  private readonly handlers = new Map<Command, CommandHandler[]>();

  constructor(private readonly platform: Platform) {}

  register(command: Command, handler: CommandHandler): () => void {
    const list = this.handlers.get(command) ?? [];
    this.handlers.set(command, [...list, handler]);
    return () => this.handlers.set(command, (this.handlers.get(command) ?? []).filter((each) => each !== handler));
  }

  /** Whether a handler took the command; the latest registered is asked first. */
  run(command: Command, context: CommandContext = NO_CONTEXT): boolean {
    for (const handler of (this.handlers.get(command) ?? []).toReversed()) {
      if (handler(context) !== false) return true;
    }
    return false;
  }

  /** The window's keydown listener (capture phase, so an editor never sees these keys first). */
  readonly onKey = (event: KeyboardEvent): void => {
    const command = commandFor(event, this.platform);
    if (!command) return;
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (this.run(command, { typing, tabNumber: tabNumberFor(event, this.platform) })) event.preventDefault();
  };
}
