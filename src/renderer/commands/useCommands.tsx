import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Command, Platform } from '../../shared/keymap';
import { CommandDispatcher, type CommandHandler } from './dispatcher';

const DispatcherContext = createContext<CommandDispatcher | null>(null);

/** The window's command dispatcher, listening to the keyboard wherever the focus is. */
export function CommandsProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  const [dispatcher] = useState(() => new CommandDispatcher(platform));
  useEffect(() => {
    window.addEventListener('keydown', dispatcher.onKey, true);
    return () => window.removeEventListener('keydown', dispatcher.onKey, true);
  }, [dispatcher]);
  return <DispatcherContext value={dispatcher}>{children}</DispatcherContext>;
}

export function useDispatcher(): CommandDispatcher {
  const dispatcher = useContext(DispatcherContext);
  if (!dispatcher) throw new Error('useDispatcher needs a CommandsProvider');
  return dispatcher;
}

/**
 * Runs these commands while `enabled`. The handlers may change on every render; each run calls
 * the latest ones.
 */
export function useCommands(handlers: Partial<Record<Command, CommandHandler>>, enabled = true): void {
  const dispatcher = useDispatcher();
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  const commands = Object.keys(handlers).join(' ');
  useEffect(() => {
    if (!enabled) return;
    const stops = (commands.split(' ') as Command[]).map((command) =>
      dispatcher.register(command, (context) => {
        const handler = latest.current[command];
        return handler ? handler(context) : false;
      }),
    );
    return () => stops.forEach((stop) => stop());
  }, [dispatcher, enabled, commands]);
}
