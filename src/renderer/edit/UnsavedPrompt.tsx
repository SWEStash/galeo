import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { settleFocus } from '../document/settle-focus';
import { editors } from './editors';

type Choice = 'save' | 'discard' | 'cancel';

/** Asks about one tab's unsaved changes; true once they are saved or discarded, false on Cancel. */
type ConfirmUnsaved = (id: string, name: string) => Promise<boolean>;

const PromptContext = createContext<ConfirmUnsaved | null>(null);

export function useConfirmUnsaved(): ConfirmUnsaved {
  const confirm = useContext(PromptContext);
  if (!confirm) throw new Error('useConfirmUnsaved needs an UnsavedPrompt');
  return confirm;
}

/**
 * The window's one question about unsaved changes (UX F12): Save / Don't save / Cancel, Save
 * focused, Esc cancels and goes back to the editor. Questions from several places wait their turn.
 */
export function UnsavedPrompt({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<{ name: string; answer: (choice: Choice) => void } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const confirm = useCallback<ConfirmUnsaved>((id, name) => {
    const asked = queue.current.then(async () => {
      const choice = await new Promise<Choice>((answer) => setQuestion({ name, answer }));
      setQuestion(null);
      const editor = editors.get(id);
      if (choice === 'cancel') {
        // The tab stays: back to its editor, which the modal's own focus restore can't reach.
        if (editor) settleFocus(() => editor.focus());
        return false;
      }
      if (choice === 'discard') {
        editor?.discard();
        return true;
      }
      return editor ? editor.save() : false;
    });
    queue.current = asked.catch(() => undefined);
    return asked;
  }, []);

  return (
    <PromptContext value={confirm}>
      {children}
      {question && (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && question.answer('cancel')}>
          <Modal className="modal">
            <Dialog className="dialog" role="alertdialog" data-testid="unsaved-dialog">
              <Heading slot="title">Save changes to {question.name}?</Heading>
              <p>Your changes are lost if you don't save them.</p>
              <div className="dialog-buttons">
                <Button onPress={() => question.answer('cancel')}>Cancel</Button>
                <Button onPress={() => question.answer('discard')}>Don't save</Button>
                <Button onPress={() => question.answer('save')} autoFocus>
                  Save
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </PromptContext>
  );
}
