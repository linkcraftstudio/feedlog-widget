# @feedlog/widget

The host-side SDK for the [FeedLog](https://github.com/linkcraftstudio/feedlog) feedback widget. Drop one function on your page and your users get a feedback launcher, backed by your FeedLog instance.

- **ESM + TypeScript declarations**, **zero runtime dependencies**, ~5 KB gzipped.
- **One public function.** No return value, no instance, no events — the widget manages its own open/close state.
- **Upgrades itself.** The SDK only renders the launcher, badge, panel container, and iframe lifecycle. All the feedback UI lives in a FeedLog-hosted page loaded in a cross-origin iframe, so new features ship with FeedLog — you never bump the SDK for them.

## Install

```bash
npm install @feedlog/widget
# or: pnpm add @feedlog/widget / yarn add @feedlog/widget
```

## Usage

```ts
import { createWidget } from '@feedlog/widget'

createWidget({
  baseUrl: 'https://acme.feedlog.ai',
  auth: {
    // Return a JWT signed by YOUR backend with your org's SSO secret.
    getToken: async () => {
      const res = await fetch('/api/feedlog-token')
      if (!res.ok) throw new Error('temporary failure') // throw = retryable failure
      return (await res.json()).token ?? null           // null = signed out
    },
    // Optional: open your own sign-in UI (popup or full-page redirect).
    login: () => openYourLoginModal(),
  },
  theme: 'auto',
})
```

That is the entire integration. The launcher opens the panel; the panel's own close button closes it.

### Opening it yourself

`openWidget()` and `closeWidget()` drive the same panel from anywhere in your app, so you can add entry points the launcher cannot reach — a "having trouble?" link inside your own sign-in dialog, a menu item, a prompt after a failed action.

```js
import { openWidget, closeWidget } from '@feedlog/widget'

document.querySelector('#need-help').onclick = () => openWidget()
```

Call `createWidget` once first. Before it finishes booting the call is replayed once the panel mounts; when the widget is switched off for your workspace, both functions do nothing.

### Without a user system

`auth` is optional. Leave it out and the widget runs with no host identity:

```ts
createWidget({ baseUrl: 'https://acme.feedlog.ai' })
```

This works when the org has **Guest posting** switched on (FeedLog → Settings → Guest actions). Visitors write feedback without signing in; the embed page mints its own guest identity on the first message, and if that person later signs in to FeedLog, everything they filed as a guest moves onto their account. With guest posting off and no `auth`, the panel only ever shows a sign-in prompt it has no way to satisfy.

### Options

| Option | Required | Description |
| --- | --- | --- |
| `baseUrl` | yes | Your FeedLog org address, e.g. `https://acme.feedlog.ai`. |
| `auth` | no | How your product tells FeedLog who the visitor is. Omit it to run guest-only (see above). |
| `auth.getToken` | with `auth` | `() => Promise<string \| null>`. Return a JWT when signed in, `null` when signed out, or throw for a temporary failure. A thrown error surfaces a retryable error state — it is **not** treated as signed out. |
| `auth.login` | no | `() => void \| Promise<void>`. Opens your own sign-in UI. Settling only means the interaction ended; whether it succeeded is judged by the next `getToken()`. Both popup and redirect styles work. |
| `theme` | no | `'light' \| 'dark' \| 'auto'`. Defaults to `'auto'` (follows the OS). Passed to the iframe up front so the first paint is not mis-themed. |

Calling `createWidget` more than once logs a warning and is ignored, so React StrictMode's double-mount and HMR reloads never produce two launchers.

## Authentication

FeedLog reuses your product's existing identity through **Product SSO**. Your backend already knows who is signed in; the widget just needs a short-lived, signed assertion of that identity.

`auth.getToken` must return a **JWT signed by your backend** with one of your org's SSO secrets (HS256), or `null` when nobody is signed in. Generate the SSO secret in FeedLog under **Developer → SSO**; the same secret already powers the Product SSO handoff, so most integrators reuse the code they already have.

Required and optional claims:

| Claim | Required | Notes |
| --- | --- | --- |
| `email` | yes | The identity key. |
| `exp` | yes | Expiry. Must be no more than 24 hours out; an hour is a good default. |
| `name` | no | Display name. |
| `picture` | no | Avatar URL. |

The SDK trades this JWT for a FeedLog session token, caches it per-email in `localStorage`, and hands it to the iframe through the URL fragment. Signing must happen on your server — never ship the SSO secret to the browser.

## Browser support

Works in all current evergreen browsers (Chrome, Firefox, Safari, Edge). The build targets ES2020 and relies on Shadow DOM, `fetch`, and Web Storage — no polyfills required for supported browsers.

## Types

The package ships `.d.ts` declarations. `createWidget`, `WidgetOptions`, `WidgetAuth`, and `WidgetTheme` are all exported and documented inline, so editor autocompletion is the fastest reference for the option shapes.

## How it works

The SDK does only what cannot be done from inside a cross-origin iframe: render the launcher and unread badge, own the panel and iframe lifecycle, call your `getToken` / `login`, and receive messages from the iframe. Everything else — the feedback UI and all business API calls — happens inside the FeedLog-hosted iframe.

A few invariants worth knowing if you are reading the source or debugging:

- **The message channel is one-way.** The iframe posts five message types to the SDK (`ready`, `auth-requested`, `unread`, `navigate`, `close-request`); the SDK never posts back. Inbound messages are validated against both `event.origin` and `event.source`, and unknown types are ignored for forward compatibility.
- **The session token travels only in the URL fragment** (`#token=…`), never in a query string and never over `postMessage`. Fragments are not sent to the server, so the token stays out of access logs and `Referer` headers; the iframe wipes it from the address bar on load. The only way a new session reaches the iframe is by rebuilding it with a fresh fragment.
- **The token cache is keyed by email.** A `null` from `getToken()` clears the cache immediately, and a different email discards it — so a shared computer never leaks one person's session to the next. A `401` triggers exactly one silent re-exchange before giving up.
- **`auth-requested` always retries `getToken()` silently first** (the user may have signed in on another tab). Only `reason: 'user'` may then escalate to `auth.login()`; `reason: 'expired'` never opens a popup on its own.
- **The embed URL carries `?origin=<your page's origin>`.** The iframe uses it as the `postMessage` target origin, which it cannot derive reliably on its own (Firefox has no `location.ancestorOrigins`, and a referrer policy may strip the referrer). Forging it gains nothing: if the real parent origin does not match, the browser refuses to deliver the message.

## Contributing

```bash
pnpm install
pnpm build        # tsup -> dist/index.js + dist/index.d.ts
pnpm typecheck
pnpm size         # report the bundle size
```

Source layout:

```
src/
  index.ts          createWidget / openWidget / closeWidget, with single-call protection
  widget.ts         orchestration: boot, open/close, iframe lifecycle, postMessage dispatch
  auth.ts           the auth flow, with single-flight de-duplication
  session-cache.ts  session-token cache in localStorage, keyed by email
  unread.ts         badge count (unread endpoint + 60s sessionStorage cache)
  api.ts            fetch wrappers for the three widget endpoints
  jwt.ts            reads the email claim from a JWT (base64 decode only, no verification)
  login-marker.ts   sessionStorage marker for redirect-style login (~5 min expiry)
  storage.ts        localStorage / sessionStorage with an in-memory fallback
  ui.ts             launcher / badge / panel / loading, all inside a shadow root
  types.ts          public types + the postMessage protocol types
```

## Test environment

`playground/demo-host.html` is the test environment: a single self-contained file — a realistic (fictional) SaaS landing page that embeds the widget, with a mock sign-in and a draggable control panel for `baseUrl`, embed path, org SSO secret, and theme. The SDK is inlined into it as a global build by `build:demo`.

```bash
pnpm demo          # build the inline SDK once, then serve at http://localhost:5173/demo-host.html
pnpm dev:demo      # same server, plus re-inline the SDK on every src/ change (refresh the browser)
```

Both print the URL on start; `PORT=xxxx` overrides the port. Use `demo` to just click through it, `dev:demo` while iterating on the SDK itself.

Point the panel's `baseUrl` at a running FeedLog instance (default `http://localhost:3000`) and paste that org's SSO secret. The page signs a fresh JWT client-side on every `getToken()` — so it stands in for a customer backend without one of its own, and a persisted secret never goes stale. Panel config (baseUrl, embed path, secret, theme, sign-in state) persists across reloads, keyed by the page origin.

> **Client-side signing is a demo shortcut only.** In production the SSO secret lives on **your** server and signs JWTs there — it must never reach the browser. The panel's field models the value a developer configures; the signing it simulates is your backend's job.

Serve it over **http**, not `file://`: a `file://` page reports a `null` origin, which breaks the widget's cross-origin postMessage + CORS (the landing page, sign-in, and panel still work, but the live widget is skipped with a notice).

The live widget needs a reachable FeedLog backend — there is no bundled mock, so bring up a FeedLog instance (or your dev server) at `baseUrl`.

## License

[MIT](./LICENSE)
