export function toUnicodeBold(str: string): string {
  return Array.from(str).map(ch => {
    const code = ch.codePointAt(0)!;
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + (code - 97));
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + (code - 48));
    return ch;
  }).join('');
}

export function toUnicodeItalic(str: string): string {
  return Array.from(str).map(ch => {
    const code = ch.codePointAt(0)!;
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D608 + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + (code - 97));
    return ch;
  }).join('');
}

function extractText(node: Node, bold: boolean, italic: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = node.textContent ?? '';
    if (bold) text = toUnicodeBold(text);
    if (italic) text = toUnicodeItalic(text);
    return text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  const isBold = bold || tag === 'b' || tag === 'strong';
  const isItalic = italic || tag === 'i' || tag === 'em';

  if (tag === 'ul') {
    return Array.from(el.children)
      .filter(c => c.tagName.toLowerCase() === 'li')
      .map(li => '• ' + extractText(li, isBold, isItalic).trim() + '\n')
      .join('');
  }

  if (tag === 'ol') {
    return Array.from(el.children)
      .filter(c => c.tagName.toLowerCase() === 'li')
      .map((li, i) => `${i + 1}. ` + extractText(li, isBold, isItalic).trim() + '\n')
      .join('');
  }

  const childText = Array.from(node.childNodes)
    .map(child => extractText(child, isBold, isItalic))
    .join('');

  const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  if (blockTags.includes(tag)) {
    return childText + '\n';
  }

  return childText;
}

export function htmlToLinkedInText(html: string): string {
  if (typeof window === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const raw = extractText(doc.body, false, false);
  return raw.replace(/\n{3,}/g, '\n\n').trim();
}
