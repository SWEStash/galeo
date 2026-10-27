import { useEffect, useId, useState } from 'react';
import {
  Button,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  Dialog,
  FieldError,
  Form,
  Header,
  Heading,
  Input,
  Label,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Modal,
  ModalOverlay,
  Popover,
  Separator,
  Text,
  TextField,
} from 'react-aria-components';
import { ACCENTS, accentOf } from '../../shared/accents';
import type { PreviousSession, ProfileRefusal, ProfileResult, ProfilesState } from '../../shared/contracts';
import { useCommands } from '../commands/useCommands';
import { plural } from '../../shared/words';

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const REFUSALS: Record<ProfileRefusal, string> = {
  empty: 'Give the profile a name.',
  'too-long': 'Use at most 64 characters.',
  'control-character': 'Use letters, digits, spaces and punctuation only.',
  taken: 'Another profile has this name.',
  'invalid-file': "The profile's file has an error. Fix it by hand, then try again.",
};

type Editing = { kind: 'new' } | { kind: 'edit' } | { kind: 'delete' } | null;

/**
 * The profile chip at the tab bar's left edge (UX F5): the window's profile by name and accent,
 * and its menu (Ctrl+Shift+M): switch, new, edit, delete, restore a previous session.
 */
export function ProfileChip({ state, onAbout }: { state: ProfilesState; onAbout: () => void }) {
  const current = state.profiles.find((profile) => profile.id === state.current);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [previous, setPrevious] = useState<PreviousSession[]>([]);

  useCommands({ profileMenu: () => setOpen(true) });

  // The previous sessions are asked for each time the menu opens: saving adds them as the app runs.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void window.galeo.session.previous().then((list) => live && setPrevious(list));
    return () => {
      live = false;
    };
  }, [open]);

  if (!current) return null;
  const accent = accentOf(current.accent);

  const act = (key: string) => {
    if (key === 'new' || key === 'edit' || key === 'delete') setEditing({ kind: key });
    else if (key.startsWith('open:')) {
      const id = key.slice('open:'.length);
      if (id !== state.current) void window.galeo.profiles.open(id);
    } else if (key.startsWith('restore:')) void window.galeo.session.restorePrevious(Number(key.slice('restore:'.length)));
    else if (key === 'about') onAbout();
  };

  return (
    <>
      <MenuTrigger isOpen={open} onOpenChange={setOpen}>
        <Button className="profile-chip" data-testid="profile-chip" aria-label={`Profile: ${current.name}`}>
          <span className="profile-chip-swatch" aria-hidden="true" style={{ background: accent }} />
          <span className="profile-chip-name">{current.name}</span>
        </Button>
        <Popover className="menu-popover" placement="bottom start">
          <Menu className="menu" onAction={(key) => act(String(key))}>
            <MenuSection>
              <Header className="menu-header">Profiles</Header>
              {state.profiles.map((profile) => (
                <MenuItem key={profile.id} id={`open:${profile.id}`} className="menu-item" textValue={profile.name}>
                  <span className="profile-chip-swatch" aria-hidden="true" style={{ background: accentOf(profile.accent) }} />
                  {/* One label holding the state too: the item's name is all of its visible text. */}
                  <Text slot="label" className="menu-label">
                    {profile.name}{' '}
                    <span className="menu-description">
                      {profile.id === state.current ? 'This window' : profile.running ? 'Open' : 'Not open'}
                    </span>
                  </Text>
                </MenuItem>
              ))}
            </MenuSection>
            <Separator className="menu-separator" />
            <MenuSection>
              <MenuItem id="new" className="menu-item">
                New profile…
              </MenuItem>
              <MenuItem id="edit" className="menu-item">
                Edit profile…
              </MenuItem>
              <MenuItem id="delete" className="menu-item" isDisabled={current.id === 'default'}>
                Delete profile…
              </MenuItem>
            </MenuSection>
            <Separator className="menu-separator" />
            <MenuSection>
              <MenuItem id="about" className="menu-item">
                About galeo
              </MenuItem>
            </MenuSection>
            {previous.length > 0 && (
              <MenuSection>
                <Header className="menu-header">Restore previous session</Header>
                {previous.map((session) => {
                  const tabs = `${plural(session.tabs, 'tab', 'tabs')}${session.windows > 1 ? ` in ${session.windows} windows` : ''}`;
                  return (
                    <MenuItem key={session.snapshot} id={`restore:${session.snapshot}`} className="menu-item" textValue={`${WHEN.format(session.savedAt)}, ${tabs}`}>
                      <Text slot="label" className="menu-label">
                        {WHEN.format(session.savedAt)} <span className="menu-description">{tabs}</span>
                      </Text>
                    </MenuItem>
                  );
                })}
              </MenuSection>
            )}
          </Menu>
        </Popover>
      </MenuTrigger>
      {editing && editing.kind !== 'delete' && (
        <ProfileDialog
          title={editing.kind === 'new' ? 'New profile' : 'Edit profile'}
          action={editing.kind === 'new' ? 'Create' : 'Save'}
          name={editing.kind === 'new' ? '' : current.name}
          accent={editing.kind === 'new' ? ACCENTS[0]!.color : accent}
          onSubmit={(name, color) =>
            editing.kind === 'new' ? window.galeo.profiles.create(name, color) : window.galeo.profiles.update(name, color)
          }
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === 'delete' && <DeleteDialog name={current.name} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProfileDialog(props: {
  title: string;
  action: string;
  name: string;
  accent: string;
  onSubmit: (name: string, accent: string) => Promise<ProfileResult>;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.name);
  const [accent, setAccent] = useState(props.accent);
  const [refusal, setRefusal] = useState<ProfileRefusal | null>(null);
  const [failed, setFailed] = useState(false);
  const accentLabel = useId();

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    setFailed(false);
    try {
      const result = await props.onSubmit(name, accent);
      if (result.ok) props.onClose();
      else setRefusal(result.reason);
    } catch {
      setFailed(true);
    }
  };

  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && props.onClose()}>
      <Modal className="modal">
        <Dialog className="dialog">
          <Heading slot="title">{props.title}</Heading>
          <Form onSubmit={(event) => void submit(event)} validationBehavior="aria">
            <TextField
              name="name"
              value={name}
              onChange={(value) => {
                setName(value);
                setRefusal(null);
              }}
              isInvalid={refusal !== null}
              autoFocus
              className="field"
            >
              <Label>Name</Label>
              <Input />
              <FieldError>{refusal && REFUSALS[refusal]}</FieldError>
            </TextField>
            <span id={accentLabel} className="swatches-label">
              Accent colour
            </span>
            <ColorSwatchPicker
              aria-labelledby={accentLabel}
              className="swatches"
              value={accent}
              onChange={(color) => setAccent(color.toString('hex').toLowerCase())}
            >
              {ACCENTS.map((each) => (
                <ColorSwatchPickerItem key={each.color} color={each.color} className="swatch-item">
                  <ColorSwatch colorName={each.name} className="swatch" />
                </ColorSwatchPickerItem>
              ))}
            </ColorSwatchPicker>
            {failed && <p role="alert">The profile couldn't be saved. Try again.</p>}
            <div className="dialog-buttons">
              <Button onPress={props.onClose}>Cancel</Button>
              <Button type="submit">{props.action}</Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function DeleteDialog({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal className="modal">
        <Dialog className="dialog" role="alertdialog">
          <Heading slot="title">Delete profile '{name}'?</Heading>
          <p>This deletes the profile's session and settings; your files are not touched.</p>
          <div className="dialog-buttons">
            <Button onPress={onClose} autoFocus>
              Cancel
            </Button>
            <Button
              onPress={() => {
                onClose();
                void window.galeo.profiles.delete();
              }}
            >
              Delete
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
