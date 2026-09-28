import type { ReactNode } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { CHOSEN_ENCODINGS, type ChosenEncoding } from '../../shared/contracts';
import { ENCODING_NAMES } from './encodings';

/** "Reopen with encoding…" (UX §4): the offered encodings, or back to detecting it. */
export function EncodingMenu({
  children,
  className,
  onChoose,
}: {
  children: ReactNode;
  className?: string;
  onChoose: (encoding: ChosenEncoding | null) => void;
}) {
  return (
    <MenuTrigger>
      <Button {...(className ? { className } : {})}>{children}</Button>
      <Popover className="menu-popover">
        <Menu
          className="menu"
          aria-label="Reopen with encoding"
          onAction={(key) => onChoose(key === 'detect' ? null : (key as ChosenEncoding))}
        >
          {CHOSEN_ENCODINGS.map((encoding) => (
            <MenuItem key={encoding} id={encoding} className="menu-item">
              {ENCODING_NAMES[encoding]}
            </MenuItem>
          ))}
          <MenuItem id="detect" className="menu-item">
            Detect automatically
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
