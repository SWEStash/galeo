import type { DiagramSaves } from '../../core/documents/diagram-save';
import type { Handlers } from '../ipc/register';

/** Saving the viewer's diagram (#59): main asks where and writes only that file. */
export function diagramHandlers(deps: { saves: Pick<DiagramSaves, 'save'> }): Pick<Handlers, 'diagrams.save'> {
  return {
    'diagrams.save': ([format, data, name], event) => deps.saves.save(event.sender.id, format, data, name),
  };
}
