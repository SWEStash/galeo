import { Button, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator as MenuSeparator } from 'react-aria-components';
import type { Separator, SeparatorChoice } from '../../shared/csv';
import type { Command } from '../../shared/keymap';

const NAMES: Record<Separator, string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };
/** What a separator looks like in "Auto (;)": a tab has no glyph of its own. */
const GLYPHS: Record<Separator, string> = { ',': ',', ';': ';', '\t': 'tab', '|': '|' };

const COMMANDS: Record<SeparatorChoice, Command> = {
  auto: 'tableSeparatorAuto',
  ',': 'tableSeparatorComma',
  ';': 'tableSeparatorSemicolon',
  '\t': 'tableSeparatorTab',
  '|': 'tableSeparatorPipe',
};

export interface TableOptions {
  separator: SeparatorChoice;
  /** The separator the table was read with: Auto's pick. */
  found: Separator | null;
  header: boolean;
}

/**
 * The status bar's Table options (ADR-021): the separator and the header row of the shown table.
 * Each choice runs its page command, the same the palette runs.
 */
export function TableOptionsMenu({ options, onCommand, className }: { options: TableOptions; onCommand: (command: Command) => void; className?: string }) {
  const separator = options.separator === 'auto' ? `Auto${options.found ? ` (${GLYPHS[options.found]})` : ''}` : NAMES[options.separator];
  const header = options.header ? 'Header' : 'No header';
  return (
    <MenuTrigger>
      <Button {...(className ? { className } : {})} aria-label={`Table options: ${separator}, ${header.toLowerCase()}`}>
        {`${separator} · ${header}`}
      </Button>
      <Popover className="menu-popover">
        <Menu className="menu" aria-label="Table options" onAction={(key) => onCommand(key as Command)}>
          <MenuSection selectionMode="single" selectedKeys={[COMMANDS[options.separator]]} aria-label="Separator">
            <MenuItem id={COMMANDS.auto} className="menu-item">
              {`Detect automatically${options.found ? ` (${GLYPHS[options.found]})` : ''}`}
            </MenuItem>
            {(Object.keys(NAMES) as Separator[]).map((each) => (
              <MenuItem key={each} id={COMMANDS[each]} className="menu-item">
                {NAMES[each]}
              </MenuItem>
            ))}
          </MenuSection>
          <MenuSeparator />
          <MenuSection selectionMode="multiple" selectedKeys={options.header ? ['toggleTableHeader'] : []} aria-label="Header">
            <MenuItem id="toggleTableHeader" className="menu-item">
              First row is a header
            </MenuItem>
          </MenuSection>
          <MenuSeparator />
          <MenuItem id="resetTableOptions" className="menu-item">
            Reset to defaults
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
