/**
 * Whether `text` takes more than `maxBytes` in UTF-8. A UTF-16 unit takes 1 to 3 bytes (a
 * surrogate pair 4 for its two units), so only text between `maxBytes / 3` and `maxBytes` units
 * long is counted, and the count stops at the cap.
 */
export function exceedsUtf8Bytes(text: string, maxBytes: number): boolean {
  if (text.length > maxBytes) return true;
  if (text.length * 3 <= maxBytes) return false;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit < 0xdc00 && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
    if (bytes > maxBytes) return true;
  }
  return false;
}
