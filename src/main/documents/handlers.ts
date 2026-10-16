import type { EditGrants } from '../../core/documents/edit-grants';
import type { CloseAnswer } from '../../core/documents/unsaved';
import type { ReadIdentities } from '../../core/documents/identities';
import type { DocumentLinks } from '../../core/documents/links';
import { FORMATS } from '../../core/formats/registry';
import { readDocument } from '../../core/documents/read';
import { saveDocument } from '../../core/documents/save';
import type { TabRegistry } from '../../core/tabs/registry';
import type { FileSystem } from '../../core/ports';
import type { Decode, WhatwgEncoding } from '../../core/text/decode';
import type { Hash } from '../../core/documents/read';
import type { DocumentContent } from '../../shared/documents';
import { workerFormat } from '../../shared/formats';
import type { Handlers } from '../ipc/register';

type DocumentChannels =
  | 'documents.read'
  | 'documents.setEncoding'
  | 'documents.followLink'
  | 'documents.back'
  | 'documents.forward'
  | 'documents.resolveImage'
  | 'documents.save'
  | 'documents.dirty'
  | 'documents.leaveEdit'
  | 'documents.closeAnswer'
  | 'documents.keep'
  | 'documents.recover';

/**
 * The document channels. Every request names a document by id and is scoped to the sending
 * window; reads go through main's records, links through main's own check (SR-04, SR-12).
 */
export function documentHandlers(deps: {
  records: TabRegistry;
  links: DocumentLinks;
  reads: ReadIdentities;
  fs: FileSystem;
  decode: Decode;
  hash: Hash;
  /** The tabs main put in edit mode (ADR-013). */
  grants: EditGrants;
  /** The window's real input: a save spends one (ADR-004). */
  input: { spend(window: number): boolean };
  /** Closes and quits waiting on the reader's word about unsaved changes. */
  unsaved: { answer(window: number, answer: CloseAnswer): void };
  /** A file was read (the profile's recent files keep it). */
  opened: (path: string, window: number) => void;
}): Pick<Handlers, DocumentChannels> {
  const { records, links, reads, fs, decode, hash, grants, input, unsaved, opened } = deps;
  // The file each tab last counted as opened: re-reads of it (a wake, a changed file) aren't opens.
  const counted = new Map<string, string>();
  // Concurrent reads of one document share a single read, so repeated requests can't multiply it.
  const reading = new Map<string, Promise<DocumentContent>>();

  const read = async (id: string, window: number, path: string, encoding: WhatwgEncoding | null): Promise<DocumentContent> => {
    // The identity is taken first: a change during the read then shows as a change afterwards.
    await reads.remember(id, path);
    const content = await readDocument(path, { fs, decode, hash, encoding: encoding ?? undefined, shaped: (shape) => reads.saw(id, path, shape) });
    if ((content.state === 'ready' || content.state === 'empty') && counted.get(id) !== path) {
      counted.set(id, path);
      opened(path, window);
    }
    // Only the text main read itself defines which links the page may follow. Only rendered
    // articles (Markdown, MDX) have links; nothing else is kept.
    const article = content.state === 'ready' ? workerFormat(content.format) : null;
    if (content.state === 'ready' && article && content.size <= (FORMATS[content.format].renderMaxBytes ?? Infinity)) {
      links.remember(id, window, path, content.text, article);
    } else {
      links.forget(id);
    }
    return content;
  };

  return {
    'documents.read': ([id], event) => {
      const record = records.get(id, event.sender.id);
      if (!record) throw new Error('unknown document');
      if (record.kind === 'settings') throw new Error('not a document');
      const encoding = records.encoding(id, event.sender.id);
      const key = `${id}\0${record.path}\0${encoding ?? ''}`;
      let pending = reading.get(key);
      if (!pending) {
        pending = read(id, event.sender.id, record.path, encoding).finally(() => reading.delete(key));
        reading.set(key, pending);
      }
      return pending;
    },
    'documents.setEncoding': ([id, encoding], event) => {
      if (!records.setEncoding(id, event.sender.id, encoding)) throw new Error('unknown document');
    },
    'documents.followLink': ([id, href, target], event) => links.follow(id, event.sender.id, href, target),
    'documents.back': ([id], event) => links.back(id, event.sender.id),
    'documents.forward': ([id], event) => links.forward(id, event.sender.id),
    'documents.resolveImage': ([id, src], event) => links.resolveImage(id, event.sender.id, src),
    'documents.save': async ([id, text, base], event) => {
      const window = event.sender.id;
      const record = records.get(id, window);
      if (!record || record.kind === 'settings') throw new Error('unknown document');
      if (!grants.allows(id, window, record.path)) return { kind: 'refused', reason: 'not-editable' };
      if (!input.spend(window)) return { kind: 'refused', reason: 'no-input' };
      const result = await saveDocument(
        { fs, decode, hash },
        { path: record.path, text, base, encoding: records.encoding(id, window) ?? undefined, shape: reads.shapeOf(id, record.path) },
      );
      // The file's new identity, before the watcher reports the write: our own save isn't a change on disk.
      if (result.kind === 'saved') await reads.remember(id, record.path);
      return result;
    },
    'documents.dirty': ([id, dirty], event) => grants.setDirty(id, event.sender.id, dirty),
    'documents.leaveEdit': ([id], event) => grants.revoke(id, event.sender.id),
    'documents.closeAnswer': ([answer], event) => unsaved.answer(event.sender.id, answer),
    'documents.keep': ([id, text, base], event) => grants.keep(id, event.sender.id, text, base),
    'documents.recover': ([id], event) => grants.kept(id, event.sender.id),
  };
}
