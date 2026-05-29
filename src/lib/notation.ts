// LaTeX notation with temml: supports $$...$$ (display), $`...`$ (inline), $...$ (inline)
import temml from 'temml';

const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$`', right: '`$', display: false },
  { left: '$', right: '$', display: false },
];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pattern = new RegExp(
  DELIMITERS.map(d => `${escapeRegex(d.left)}(.+?)${escapeRegex(d.right)}`).join('|'),
  'g'
);

function renderTextNode(node: Text) {
  const text = node.textContent ?? '';
  if (!text.includes('$')) return;

  const parts: (string | { html: string })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // reset pattern
  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // find which delimiter matched
    let latex = '';
    let display = false;
    for (let i = 0; i < DELIMITERS.length; i++) {
      if (match[i + 1] != null) {
        latex = match[i + 1]!;
        display = DELIMITERS[i]!.display;
        break;
      }
    }

    try {
      const html = temml.renderToString(latex.trim(), {
        displayMode: display,
        throwOnError: false,
        annotate: true,
      });
      parts.push({ html });
    } catch {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (parts.length === 0) return;
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  const frag = document.createDocumentFragment();
  for (const part of parts) {
    if (typeof part === 'string') {
      frag.appendChild(document.createTextNode(part));
    } else {
      const span = document.createElement('span');
      span.innerHTML = part.html;
      frag.appendChild(span);
    }
  }

  node.parentNode?.replaceChild(frag, node);
}

function walk(el: Node) {
  // skip script, style, code, pre, and elements already processed
  if (el instanceof HTMLElement) {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA') return;
    if (el.classList.contains('no-math')) return;
  }

  // snapshot childNodes since we'll be mutating
  const children = Array.from(el.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      renderTextNode(child as Text);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child);
    }
  }
}

export function renderMath(root: Element | Document = document.body) {
  walk(root);
}
