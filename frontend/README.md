# Homy frontend

One widget runtime for two hosts:

| Host | Entry | Output |
|------|-------|--------|
| Web app (served by Flask at `/`) | `src/web/main.tsx`, `src/web/embed.tsx` | `../homy/static/app/` (hashed file names = cache versioning) |
| Browser add-on (Chrome, Firefox, Opera, MV3) | `src/extension/main.tsx`, `src/extension/background.ts` | `../browser-extension/dist/homy-<version>-<browser>.zip` |

Stack: Preact 11 + Signals, TypeScript 7, Vite 8. No other runtime dependencies besides `lucide-preact` icons.

## Commands

```bash
cd frontend
npm ci
npm run build        # web app + add-on zips
npm run build:web    # only homy/static/app
npm run build:ext    # only the add-on
npm run dev          # Vite dev server on :5173, proxies /api etc. to Homy on :8080
npm run typecheck
npm test             # grid engine tests (vitest)
```

The add-on version is read from `../pyproject.toml` (override: `HOMY_VERSION=1.2.3 npm run build:ext`).

## Layout

```
src/sdk/        Module SDK: types, defineModule(), config helpers
src/ui/         Shared shell: store, 24-column grid engine, drawer, command palette, themes
src/modules/    Native modules (bundled into web app AND add-on)
src/web/        Web host (Homy API v2), legacy runtime for classic widget plugins, embed page
src/extension/  Add-on host (local tabs in browser storage + Homy server tabs), background worker
scripts/        package-extension.mjs (manifests, icons, zips – no extra dependencies)
```

## Writing a native module

```tsx
import { defineModule, cfgStr } from '@/sdk';

defineModule({
  type: 'hello',                       // also register the type server-side (homy/modules/<m>/<m>.py)
  name: { de: 'Hallo', en: 'Hello' },  //   if it should be placeable on Homy (server) tabs
  description: { de: '…', en: '…' },
  icon: 'sparkles',
  category: 'essentials',
  size: { w: 6, h: 3 },
  schema: [{ key: 'who', type: 'text', label: 'Name', default: 'Welt' }],
  component: ({ config, ctx }) => <div>{ctx.t('Hallo', 'Hello')} {cfgStr(config, 'who')}</div>,
});
```

Import it in `src/modules/index.ts`. `ctx` gives `setConfig` (inline editing), `server` (Homy API when
connected), `kv` storage, `refreshTick`, and host capabilities (favorites, bookmarks, top sites, favicons).

Widget types without a native module still work:

* **Web app:** the classic renderer (`window.WidgetRegistry` plugin from `homy/modules` or
  `homy/integrations/*/widgets`) runs inside the new shell (`src/web/legacy.ts`).
* **Add-on:** MV3 forbids remote code, so those widgets are shown in an iframe of
  `/embed/widget/<id>`, authenticated with the add-on's personal access token (URL fragment → Bearer header).
