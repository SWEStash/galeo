import type { DiagramSaves } from '../../core/documents/diagram-save';
import type { Handlers } from '../ipc/register';

/** Saving the viewer's diagram (#59): main asks where, then writes only that file. */
export function diagramHandlers(deps: { saves: Pick<DiagramSaves, 'choose' | 'write'> }): Pick<Handlers, 'diagrams.save' | 'diagrams.write'> {
  return {
    'diagrams.save': ([format, name], event) => deps.saves.choose(event.sender.id, format, name),
    'diagrams.write': ([token, data], event) => deps.saves.write(event.sender.id, token, data),
  };
}
