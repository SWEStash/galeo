import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  Input,
  Label,
  NumberField,
  RadioButton,
  RadioField,
  RadioGroup,
  SwitchButton,
  SwitchField,
  TextArea,
  TextField,
} from 'react-aria-components';
import { ACCENTS, accentOf } from '../../shared/accents';
import type { ProfileView, SettingsResult, SettingsScope, SettingsState } from '../../shared/contracts';
import type { SeparatorChoice } from '../../shared/csv';
import type { Settings, SettingsOverrides, ThemeMode } from '../../shared/settings';

const SOURCE_NAMES = { default: 'Default', global: 'All profiles', profile: 'This profile' } as const;

/** The table separators Settings offers (ADR-021), Auto first. */
const SEPARATOR_CHOICES: readonly [SeparatorChoice, string][] = [
  ['auto', 'Auto'],
  [',', 'Comma'],
  [';', 'Semicolon'],
  ['\t', 'Tab'],
  ['|', 'Pipe'],
];

/**
 * The Settings tab (UX §6): the v0.1 settings, for this profile or for all of them. Each shows
 * where its value comes from, and this profile's own values can go back to the shared one.
 */
export function SettingsView({ state, profile, appImage = false }: { state: SettingsState; profile: ProfileView; appImage?: boolean }) {
  const [scope, setScope] = useState<SettingsScope>('profile');
  const [refused, setRefused] = useState<string | null>(null);
  const [launcher, setLauncher] = useState<string | null>(null);
  const [accentRefused, setAccentRefused] = useState(false);
  const values = scope === 'profile' ? state.settings : state.shared;

  const done = (result: SettingsResult) => setRefused(result.ok ? null : result.path);
  const set = (change: SettingsOverrides) => void window.galeo.settings.set(scope, change).then(done);
  const reset = (key: keyof Settings) => void window.galeo.settings.reset(key).then(done);

  /** One setting: its control, where its value comes from, and "Reset to global" when this profile overrides it. */
  const setting = (key: keyof Settings, control: ReactNode) => (
    <div className="setting" data-setting={key} key={`${scope}:${key}`}>
      {control}
      {scope === 'profile' && <span className="setting-source">{SOURCE_NAMES[state.sources[key]]}</span>}
      {scope === 'profile' && state.sources[key] === 'profile' && (
        <Button className="setting-reset" onPress={() => reset(key)}>
          Reset to global
        </Button>
      )}
    </div>
  );

  return (
    <section className="settings-view" aria-labelledby="settings-title" data-testid="settings-view">
      <h1 id="settings-title">Settings</h1>
      <RadioGroup className="settings-scope" value={scope} onChange={(value) => setScope(value as SettingsScope)} orientation="horizontal">
        <Label>Change settings for</Label>
        <RadioField value="profile">
          <RadioButton>This profile ({profile.name})</RadioButton>
        </RadioField>
        <RadioField value="global">
          <RadioButton>All profiles</RadioButton>
        </RadioField>
      </RadioGroup>
      {refused && (
        <p className="settings-refused" role="alert">
          <code>{refused}</code> has an error from a hand edit, so it was left untouched. Fix it, then change the setting again.
        </p>
      )}

      <h2>Appearance</h2>
      {setting(
        'themeMode',
        <RadioGroup className="field" value={values.themeMode} onChange={(value) => set({ themeMode: value as ThemeMode })} orientation="horizontal">
          <Label>Theme</Label>
          <RadioField value="system">
            <RadioButton>System</RadioButton>
          </RadioField>
          <RadioField value="light">
            <RadioButton>Light</RadioButton>
          </RadioField>
          <RadioField value="dark">
            <RadioButton>Dark</RadioButton>
          </RadioField>
        </RadioGroup>,
      )}
      <div className="setting" data-setting="accent">
        <span className="field-label" id="settings-accent" data-label>
          Accent colour
        </span>
        <ColorSwatchPicker
          aria-labelledby="settings-accent"
          className="swatches"
          value={accentOf(profile.accent)}
          onChange={(color) =>
            void window.galeo.profiles.update(profile.name, color.toString('hex').toLowerCase()).then((result) => setAccentRefused(!result.ok))
          }
        >
          {ACCENTS.map((each) => (
            <ColorSwatchPickerItem key={each.color} color={each.color} className="swatch-item">
              <ColorSwatch colorName={each.name} className="swatch" />
            </ColorSwatchPickerItem>
          ))}
        </ColorSwatchPicker>
        <span className="setting-source">This profile</span>
        {accentRefused && (
          <p className="settings-refused" role="alert">
            The accent wasn't saved: this profile's profile.json has an error from a hand edit. Fix it, then pick again.
          </p>
        )}
      </div>

      <h2>Reading</h2>
      {setting('proseFont', <TextSetting label="Prose font" value={values.proseFont} onCommit={(proseFont) => set({ proseFont })} />)}
      {setting('codeFont', <TextSetting label="Code font" value={values.codeFont} onCommit={(codeFont) => set({ codeFont })} />)}
      {setting(
        'fontSize',
        <NumberField className="field" value={values.fontSize} minValue={10} maxValue={40} onChange={(fontSize) => !Number.isNaN(fontSize) && fontSize !== values.fontSize && set({ fontSize })}>
          <Label>Font size</Label>
          <Input />
        </NumberField>,
      )}
      {setting(
        'measure',
        <NumberField className="field" value={values.measure} minValue={40} maxValue={200} onChange={(measure) => !Number.isNaN(measure) && measure !== values.measure && set({ measure })}>
          <Label>Measure</Label>
          <Input aria-describedby="settings-measure-unit" />
          <span id="settings-measure-unit" className="field-hint">
            characters per line
          </span>
        </NumberField>,
      )}

      <h2>Window</h2>
      {setting(
        'statusBar',
        <SwitchField className="switch" isSelected={values.statusBar} onChange={(statusBar) => set({ statusBar })}>
          <SwitchButton>
            <span className="switch-track" aria-hidden="true" />
            Status bar
          </SwitchButton>
        </SwitchField>,
      )}

      <h2>Tables</h2>
      {setting(
        'tableSeparator',
        <RadioGroup className="field" value={values.tableSeparator} onChange={(value) => set({ tableSeparator: value as SeparatorChoice })} orientation="horizontal">
          <Label>Separator</Label>
          {SEPARATOR_CHOICES.map(([value, name]) => (
            <RadioField key={value} value={value}>
              <RadioButton>{name}</RadioButton>
            </RadioField>
          ))}
        </RadioGroup>,
      )}
      {setting(
        'tableHeader',
        <SwitchField className="switch" isSelected={values.tableHeader} onChange={(tableHeader) => set({ tableHeader })}>
          <SwitchButton>
            <span className="switch-track" aria-hidden="true" />
            First row is a header
          </SwitchButton>
        </SwitchField>,
      )}

      <h2>Quick open</h2>
      {setting(
        'quickOpenExclude',
        <ListSetting label="Excluded from quick open" hint="One folder or file name per line, skipped wherever it appears" value={values.quickOpenExclude} onCommit={(quickOpenExclude) => set({ quickOpenExclude })} />,
      )}

      <h2>Custom CSS</h2>
      <p className="field-hint">Your own styles for documents, edited in your editor; saving applies them at once.</p>
      <div className="settings-buttons">
        <Button onPress={() => void window.galeo.settings.openCustomCss('profile')}>Open CSS for this profile</Button>
        <Button onPress={() => void window.galeo.settings.openCustomCss('global')}>Open CSS for all profiles</Button>
      </div>

      {appImage && (
        <>
          <h2>Command line</h2>
          <p className="field-hint">Adds galeo to ~/.local/bin and to your applications, for this AppImage.</p>
          <div className="settings-buttons">
            <Button
              onPress={() =>
                void window.galeo.app
                  .installLauncher()
                  .then((result) => setLauncher(result.ok ? `Installed ${result.bin}. Open a new terminal to use galeo.` : `Not installed: ${result.reason}.`))
                  .catch(() => setLauncher("Not installed: galeo couldn't write the files."))
              }
            >
              Install command-line launcher
            </Button>
          </div>
          <p className="field-hint" role="status" data-testid="launcher-result">
            {launcher}
          </p>
        </>
      )}
    </section>
  );
}

/** A text setting, written when the field is left or Enter is pressed. */
function TextSetting({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  // A value from main (this change, a hand edit, the other scope) replaces the draft in place, keeping focus.
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
  };
  return (
    <TextField className="field" value={draft} onChange={setDraft} onBlur={commit} onKeyDown={(event) => event.key === 'Enter' && commit()}>
      <Label>{label}</Label>
      <Input />
    </TextField>
  );
}

/** A list setting, one entry per line, written when the field is left. */
function ListSetting({ label, hint, value, onCommit }: { label: string; hint: string; value: readonly string[]; onCommit: (value: string[]) => void }) {
  const text = value.join('\n');
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = () => {
    const next = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (next.join('\n') !== value.join('\n')) onCommit(next);
  };
  return (
    <TextField className="field" value={draft} onChange={setDraft} onBlur={commit}>
      <Label>{label}</Label>
      <TextArea rows={4} />
      <span className="field-hint">{hint}</span>
    </TextField>
  );
}
