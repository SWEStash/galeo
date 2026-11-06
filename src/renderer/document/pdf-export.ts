import { preparePrint, type Printable } from './print';

/**
 * Export to PDF (#56): main asks where (the page never names a path) and answers a one-use token;
 * the page puts its print copy in place, main prints the window into the file, the copy goes.
 */
export async function exportPdf(id: string, printable: Printable, say: (message: string) => void): Promise<void> {
  try {
    const token = await window.galeo.documents.exportPdf(id);
    if (!token) return;
    say('Exporting to PDF…');
    const done = await preparePrint(printable);
    try {
      const result = await window.galeo.documents.printPdf(token);
      say(result === 'saved' ? 'Exported to PDF' : "Couldn't export to PDF");
    } finally {
      done();
    }
  } catch {
    say("Couldn't export to PDF");
  }
}
