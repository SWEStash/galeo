import { Facet, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { CodeMirror, getCM, vim, Vim } from '@replit/codemirror-vim';

/** Vim's modes, as the status bar shows them. */
export type VimMode = 'normal' | 'insert' | 'visual' | 'replace';

/** What an editor with Vim keys asks of galeo (#51). */
export interface VimHooks {
  /** `:w`: save the tab, as Ctrl+S does. */
  save(): void;
  /**
   * `"+p` / `"+P`: paste the system clipboard at the cursor (after it for `p`). The page can't read
   * the clipboard, so main pastes, as for Ctrl+V.
   */
  paste(view: EditorView, options: { after: boolean }): void;
  /** Vim's mode changed. */
  onMode(mode: VimMode): void;
}

type VimEditor = NonNullable<ReturnType<typeof getCM>>;

const hooksFacet = Facet.define<VimHooks, VimHooks | null>({ combine: (values) => values[0] ?? null });
const hooksOf = (cm: VimEditor) => cm.cm6?.state.facet(hooksFacet) ?? null;


let defined = false;

/** Vim's commands are global: `:w` and the clipboard register (`+`) go to the editor's own hooks. */
function defineOnce(): void {
  if (defined) return;
  defined = true;
  (CodeMirror.commands as Record<string, (cm: VimEditor) => void>)['save'] = (cm) => hooksOf(cm)?.save();
  Vim.defineAction('paste', function (this: { continuePaste(...args: unknown[]): void }, cm: VimEditor, args: { registerName?: string; after?: boolean }, state: unknown) {
    if (args.registerName === '+') {
      if (cm.cm6) hooksOf(cm)?.paste(cm.cm6, { after: args.after === true });
      return;
    }
    const register = Vim.getRegisterController().getRegister(args.registerName);
    this.continuePaste(cm, args, state, register.toString(), register);
  });
}

/** Marks the editor with its Vim mode (`data-vim-mode`, which the key dispatcher reads) and reports it, from normal on. */
const modeMarker = ViewPlugin.define((view) => {
  const cm = getCM(view);
  const onChange = ({ mode }: { mode: VimMode }) => {
    view.dom.dataset['vimMode'] = mode;
    view.state.facet(hooksFacet)?.onMode(mode);
  };
  onChange({ mode: 'normal' });
  cm?.on('vim-mode-change', onChange);
  return {
    destroy() {
      cm?.off('vim-mode-change', onChange);
      delete view.dom.dataset['vimMode'];
    },
  };
});

/** Vim's modal keys for an editor in edit mode. */
export function vimKeys(hooks: VimHooks): Extension {
  defineOnce();
  return [vim(), hooksFacet.of(hooks), modeMarker];
}
