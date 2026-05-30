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

// track nodes we've processed to avoid re-triggering from our own mutations
const processed = new WeakSet<Node>();

function renderTextNode(node: Text) {
  const text = node.textContent ?? '';
  if (!text.includes('$')) return;

  const parts: (string | { html: string })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

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
      processed.add(span);
      frag.appendChild(span);
    }
  }

  processed.add(frag);
  node.parentNode?.replaceChild(frag, node);
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'MATH']);

function walk(el: Node) {
  if (el instanceof HTMLElement) {
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.classList.contains('no-math')) return;
  }

  const children = Array.from(el.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      renderTextNode(child as Text);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      walk(child);
    }
  }
}

let observer: MutationObserver | null = null;

export function renderMath(root: Element | Document = document.body) {
  walk(root);

  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // text content changed (e.g., Alpine x-text)
      if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
        if (processed.has(m.target.parentNode!)) continue;
        const text = m.target.textContent ?? '';
        if (text.includes('$')) {
          renderTextNode(m.target as Text);
        }
      }

      // new nodes added (e.g., Alpine template rendering)
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (processed.has(node)) continue;
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            if (text.includes('$')) {
              renderTextNode(node as Text);
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (!SKIP_TAGS.has(el.tagName) && el.textContent?.includes('$')) {
              walk(el);
            }
          }
        }
      }
    }
  });

  const target = root instanceof Document ? root.body : root;
  observer.observe(target, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
