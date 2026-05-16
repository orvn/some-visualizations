![Alpine.js](https://img.shields.io/badge/Alpine.js-8BC0D0?style=flat&logo=alpinedotjs&logoColor=black) ![Astro](https://img.shields.io/badge/Astro-FF5D01?style=flat&logo=astro&logoColor=white) ![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=flat&logo=d3dotjs&logoColor=black) ![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun&logoColor=white)

# Some Visualizations

A collection of frontend interactive data visualization. Built with [Astro](https://astro.build) and [Alpine.js](https://alpinejs.dev).

### See at _**[somevisuals.com](https://somevisuals.com)**_

<img src="/public/og-image.png" alt="Some Visualizations" width="500">



## Quickstart

```bash
bun install    # node 22+
bun dev        # local development
bun build      # outputs to ./dist
bun preview    # preview the ./dist
```

## Stack

- Astro 6
- Alpine.js
- Various visualization libs, like:
  - chart.js
  - d3.js
  
## Content

All page content lives in `src/content/` as [TOON](https://toonformat.dev) files, a compact, human-readable format. Each page file follows a consistent three-section structure: `meta`, `options`, and `content`.


### Global content

`src/content/global.toon` holds site-wide values used across all pages: site name, default description, default graph image, title postfix appended to page titles, etc.


### Adding a content file for a new page

Create `src/content/my-page.toon`, then load it in the corresponding `.astro` file:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { loadPage } from '../lib/content';

const { meta, options, content } = loadPage('my-page');
const c = content as { heading: string; body: string };
---

<BaseLayout
  title={meta.title ?? undefined}
  description={meta.description}
  noindex={options?.noindex ?? false}
>
  <h1>{c.heading}</h1>
  <p>{c.body}</p>
</BaseLayout>
```

`loadGlobal()` is available for components that need site-wide values (name, URL, etc.).

## Configuration

### Site metadata

Edit `src/content/global.toon` to set the site name, description, URL, and title postfix before deploying.

### Local development server

Configured in `astro.config.mjs`:

```js
server: {
  port: 14300,
},
```

### Sitemap

Generated automatically at build time by `@astrojs/sitemap`. The output file is `dist/sitemap-index.xml`. It will 404 in dev, this is expected.


## Deployment

Assuming a static site host like Cloudflare Pages, Github Pages, Netlify, etc.

- Build command: `bun run build`
- Set output directory: `dist`
- Ensure Node version is set to **22** or higher in environment settings
- Add any environment variables (none by default)
