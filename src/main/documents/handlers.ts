import type { DocumentLinks } from '../../core/documents/links';
import { readDocument } from '../../core/documents/read';
import type { DocumentRecords } from '../../core/documents/records';
import type { FileSystem } from '../../core/ports';
import type { Decode } from '../../core/text/decode';
import type { Handlers } from '../ipc/register';

type DocumentChannels =
  | 'documents.list'
  | 'documents.read'
  | 'documents.followLink'
  | 'documents.back'
  | 'documents.forward'
  | 'documents.resolveImage';

/**
 * The document channels. Every request names a document by id and is scoped to the sending
 * window; reads go through main's records, links through main's own check (SR-04, SR-12).
 */
export function documentHandlers(deps: {
  records: DocumentRecords;
  links: DocumentLinks;
  fs: FileSystem;
  decode: Decode;
}): Pick<Handlers, DocumentChannels> {
  const { records, links, fs, decode } = deps;
  return {
    'documents.list': (_args, event) => records.list(event.sender.id),
    'documents.read': async ([id], event) => {
      const record = records.get(id, event.sender.id);
      if (!record) throw new Error('unknown document');
      const content = await readDocument(record.path, { fs, decode });
      // Only the text main read itself defines which links the page may follow.
      if (content.state === 'ready') links.remember(id, event.sender.id, content.text);
      else links.forget(id);
      return content;
    },
    'documents.followLink': ([id, href], event) => links.follow(id, event.sender.id, href),
    'documents.back': ([id], event) => links.back(id, event.sender.id),
    'documents.forward': ([id], event) => links.forward(id, event.sender.id),
    'documents.resolveImage': ([id, src], event) => links.resolveImage(id, event.sender.id, src),
  };
}
