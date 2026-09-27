export interface TextParagraph {
  /** The paragraph's first source line, for view toggles and scroll anchors. */
  line: number;
  text: string;
}

/** Splits plain text into paragraphs at blank lines; line breaks inside a paragraph are kept. */
export function textParagraphs(text: string): TextParagraph[] {
  const paragraphs: TextParagraph[] = [];
  let current: { line: number; lines: string[] } | null = null;
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') {
      if (current) paragraphs.push({ line: current.line, text: current.lines.join('\n') });
      current = null;
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { line: index + 1, lines: [line] };
    }
  });
  const last = current as { line: number; lines: string[] } | null;
  if (last) paragraphs.push({ line: last.line, text: last.lines.join('\n') });
  return paragraphs;
}
