# @feedlog/widget

The host-side SDK for the [FeedLog](https://github.com/linkcraftstudio/feedlog) feedback widget. It renders a launcher and hosts the feedback interface in an iframe, with zero runtime dependencies and an ESM bundle of about 11 KB gzipped.

## Install

```bash
pnpm add @feedlog/widget
```

## Usage

```ts
import { createWidget } from '@feedlog/widget'

createWidget({
  baseUrl: 'https://acme.feedlog.ai',
  auth: {
    getToken: async () => {
      const res = await fetch('/api/feedlog-token')
      if (!res.ok) throw new Error('Could not fetch the feedback token')
      return (await res.json()).token ?? null
    },
    login: () => new Promise<void>((resolve) => {
      openYourLoginModal({ onClose: resolve })
    }),
  },
  theme: 'auto',
})
```

`openYourLoginModal` is your application's function. Its `onClose` handler must run on every exit, including cancellation. Return a Promise only when it represents the entire interaction, not just opening the modal.

Products without a user system can omit `auth`:

```ts
createWidget({ baseUrl: 'https://acme.feedlog.ai' })
```

Enable **Guest posting** in FeedLog to let these visitors submit without signing in. With guest posting disabled and no host authentication, the widget cannot satisfy a sign-in request.

## Public API

The package exports four functions. All return `void`; there is no instance or `destroy` method.

| Function | Effect |
| --- | --- |
| `createWidget(options: WidgetOptions)` | Initialize once per page. Repeated calls warn and are ignored. |
| `openWidget()` | Open the feedback panel without changing launcher state or prompting for login. |
| `closeWidget()` | Close the panel without destroying its iframe, clearing its draft or moving focus away from a host dialog. |
| `updateWidget(options: WidgetDisplayOptions)` | Update theme, launcher placement/state or stacking order. It does not open or close the panel. |

Call `createWidget` first in normal integrations. Controls do not need to wait for initialization or iframe readiness: the last open/close instruction is retained and display updates merge by field. Calls before initialization are also retained but never initialize the SDK themselves. Server-side calls do nothing. A disabled workspace renders nothing, even after `openWidget()`.

### Initialization options

| Option | Description |
| --- | --- |
| `baseUrl` | Required FeedLog workspace URL. |
| `auth` | Optional host identity integration. |
| `auth.getToken` | Required with `auth`: `() => Promise<string \| null>`. Return a signed JWT or `null` when signed out. Throw for a temporary failure, which does not sign the visitor out. |
| `auth.login` | Optional `() => void \| Promise<void>`. Opens your sign-in UI. Identity is checked again after it returns or settles. |
| `theme` | `light`, `dark` or `auto` (default). `auto` follows the operating system. |
| `launcher` | Optional fields listed below. Missing placement fields use dashboard defaults. |
| `zIndex` | Integer from 0 to 2147483647; default **40**. Applies to the launcher and panel together. |
| `embedPath` | Defaults to `/widget/embed`. A same-origin absolute path for a custom embed build; it cannot point to a different origin. |
| `onUnreadChange` | Optional `(count: number) => void` for a custom entry's unread indicator. |

`baseUrl`, `auth`, `embedPath` and `onUnreadChange` are initialization-only options. Calling `createWidget` again does not update them.

### Runtime updates

```ts
import { createWidget, openWidget, closeWidget, updateWidget } from '@feedlog/widget'

createWidget({
  baseUrl: 'https://acme.feedlog.ai',
  launcher: { state: 'hidden' },
})

document.querySelector('#help')?.addEventListener('click', openWidget)

updateWidget({ theme: 'dark' })
updateWidget({ zIndex: 40 })
updateWidget({ launcher: { alignment: 'left', bottomOffset: 80 } })
updateWidget({ launcher: { state: 'tab' } })
updateWidget({ launcher: { state: 'button' } })

// A host modal needs the panel closed; the launcher is controlled separately.
closeWidget()
updateWidget({ launcher: { state: 'hidden' } })
```

`WidgetDisplayOptions` accepts only `theme`, `zIndex` and `launcher`. Updates merge individual fields, including fields inside `launcher`. Omitted and `undefined` fields retain their existing values. Invalid supplied display values throw `TypeError`. Updates do not change dashboard settings.

Launcher options:

| Field | Values |
| --- | --- |
| `alignment` | `left` or `right`. Defaults to `right`. |
| `bottomOffset` | Non-negative safe integer in pixels. Defaults to `20`. |
| `sideOffset` | Non-negative safe integer in pixels. Defaults to `20`. |
| `state` | `button`, `tab` or `hidden`. When omitted at initialization, restore the visitor's saved state, otherwise show the button. |

There is no fixed offset limit. Placement is constrained to the viewport without changing configured values, and device safe-area insets are added automatically. Desktop and mobile share the same configuration.

At initialization, saved visitor placement takes priority over SDK and dashboard defaults. An explicit runtime position update replaces that saved drag and preserves the other current placement fields. State, theme and z-index updates leave the position intact. Explicit state updates override the visitor's preference and are independent of the dashboard's visitor closing policy.

### Theme and stacking order

`updateWidget({ theme })` changes the launcher, panel shell and iframe content without reloading the frame. It preserves the conversation, draft, scroll position and open/closed state. An application with its own theme toggle should pass `light` or `dark`; the SDK does not inspect the host's CSS classes.

The iframe advertises live-theme support. With an older or custom embed that lacks it, the current shell and iframe theme are retained and the SDK logs a warning. The requested theme will apply to a subsequently created frame; the SDK never reloads an active frame just to change its theme.

The default z-index is **40**, below common dialog layers such as `50`. Host stacking contexts still determine the final order. Override `zIndex` at initialization or through `updateWidget` when your application's layer scale differs.

## Launcher interaction

Visitors can drag the button or Help tab with a mouse, pen or touch. Moving more than 8px starts a drag; release docks to the nearest left/right edge. Arrow keys also move the focused launcher; Escape or an interrupted gesture cancels the drag. Dragging does not open the panel or change launcher form.

The button keeps a 20px edge margin plus the safe area after dragging. The outlined Help tab sits flush against the viewport edge, regardless of side offset. Its visible size is 22 × 56px with at least a 44px hit target. Shapes transition over 220ms, respecting reduced-motion preferences. Clicking the tab restores the button and opens feedback.

After dragging, the launcher uses a fixed distance from the nearer top or bottom edge. Collapsing and restoring preserve that vertical anchor. Mobile browser toolbar and keyboard height changes do not recalculate the saved drag ratio; rotating the device or resizing a desktop window restores its relative placement. The feedback panel still adapts to the visible viewport separately.

Dashboard closing behavior is `none`, `collapse` (default) or `hide`. The button's close control is visible on desktop hover/focus and always visible on touch devices. It is absent when closure is disabled, the panel is open, or the launcher is collapsed or being dragged. There are no launcher controls inside the feedback panel.

Button/tab state and dragged position use `sessionStorage`, scoped to the host and FeedLog URL. They survive reloads in the same tab. Hidden state lasts only for the current page and clears any saved tab state. A host that initializes with `state: 'hidden'` explicitly hides the launcher again on every load. Storage-restricted browsers retain preferences only in memory. Dashboard `none` resets old visitor collapse preferences on the next load, but an explicitly supplied SDK state still applies.

On desktop, the panel prefers opening above the launcher when at least 480px fits, then below, then beside it. It prefers the inward side, tries the other side when needed, and otherwise fits within the viewport without squeezing the conversation into a narrow strip. It keeps a 16px launcher gap where space permits and a 12px viewport margin plus safe areas, up to 680px high. Small screens use a full-screen panel. Hidden launchers retain an anchor for panels opened by custom host entries.

## Host login lifecycle

The SDK calls `auth.login()` only after an explicit sign-in request and a silent `getToken()` check. A returned Promise hides the panel and launcher until the interaction ends and identity has been checked again. Rejection also ends the wait, without automatically retrying login. There is no forced timeout.

A non-Promise return keeps the widget visible and checks identity again immediately. No completion callback or separate completion method is required. Use a Promise for automatic modal avoidance, or coordinate the host's z-index yourself. Silent authentication does not hide the widget.

With a compatible iframe, identity changes preserve the same visitor's view, conversation, draft, uploaded attachment references and scroll position. State cannot be inherited by a different signed-in account. Full-page redirects use a five-minute return marker and a one-use session-storage snapshot; storage restrictions prevent draft recovery across navigation. Session tokens travel only in the iframe URL fragment.

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

The package ships `.d.ts` declarations. `WidgetOptions`, `WidgetDisplayOptions`, `LauncherOptions`, `LauncherPlacement`, `LauncherState`, `WidgetAuth`, and `WidgetTheme` are exported from the package root alongside the four functions.

## How it works

The SDK does only what cannot be done from inside a cross-origin iframe: render the launcher and unread badge, own the panel and iframe lifecycle, call your `getToken` / `login`, and receive messages from the iframe. Everything else — the feedback UI and all business API calls — happens inside the FeedLog-hosted iframe.

A few invariants worth knowing if you are reading the source or debugging:

- **Both ends validate origin and source.** Version-1 messages carry readiness, theme updates, page context and temporary resume state. Launcher state remains in the SDK. Unknown types are ignored for forward compatibility; an old iframe does not receive unsupported resume data.
- **The session token travels only in the URL fragment** (`#token=…`), never in a query string and never over `postMessage`. Fragments are not sent to the server, so the token stays out of access logs and `Referer` headers; the iframe wipes it from the address bar on load. The only way a new session reaches the iframe is by rebuilding it with a fresh fragment.
- **The token cache is keyed by email.** A `null` from `getToken()` clears the cache immediately, and a different email discards it — so a shared computer never leaks one person's session to the next. A `401` triggers exactly one silent re-exchange before giving up.
- **`auth-requested` always retries `getToken()` silently first** (the user may have signed in on another tab). Only `reason: 'user'` may then escalate to `auth.login()`; `reason: 'expired'` never opens a popup on its own.
- **The embed URL carries `?origin=<your page's origin>`.** The iframe uses it as the `postMessage` target origin, which it cannot derive reliably on its own (Firefox has no `location.ancestorOrigins`, and a referrer policy may strip the referrer). Forging it gains nothing: if the real parent origin does not match, the browser refuses to deliver the message.

## Contributing

```bash
pnpm install
pnpm build        # tsup -> dist/index.js + dist/index.d.ts
pnpm typecheck
pnpm test
pnpm size         # report the bundle size
```

Source layout:

```
src/
  index.ts          public controls, single-call initialization and pending instructions
  display.ts        display defaults, partial updates and option validation
  position.ts       visitor docking and viewport-constrained panel placement
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

**Demo controls → Launcher transitions** provides **Show collapsed tab**, **Show launcher**, and **Dock left / Dock right** to try the transitions. Drag the tab away from an edge to see its floating shape, then release to dock. The outlined Help tab is 22 × 56px, excluding safe-area padding, with a hit target at least 44px wide on its inward side.

```bash
pnpm demo          # build the inline SDK once, then serve at http://localhost:5173/demo-host.html
pnpm dev:demo      # same server, plus re-inline the SDK on every src/ change (refresh the browser)
```

Both print the URL on start; `PORT=xxxx` overrides the port. Use `demo` to just click through it, `dev:demo` while iterating on the SDK itself.

Point the panel's `baseUrl` at a running FeedLog instance (default `http://localhost:3000`) and paste that org's SSO secret. The page signs a fresh JWT client-side on every `getToken()` — so it stands in for a customer backend without one of its own, and a persisted secret never goes stale. Panel config (baseUrl, embed path, secret, theme, sign-in state) persists across reloads, keyed by the page origin.

The permanent navigation **Help** menu calls `openWidget()` to open feedback or `updateWidget({ launcher: { state: 'button' } })` to restore the floating button. The launcher's close button follows the dashboard's closing behavior.

> **Client-side signing is a demo shortcut only.** In production the SSO secret lives on **your** server and signs JWTs there — it must never reach the browser. The panel's field models the value a developer configures; the signing it simulates is your backend's job.

Serve it over **http**, not `file://`: a `file://` page reports a `null` origin, which breaks the widget's cross-origin postMessage + CORS (the landing page, sign-in, and panel still work, but the live widget is skipped with a notice).

The live widget needs a reachable FeedLog backend — there is no bundled mock, so bring up a FeedLog instance (or your dev server) at `baseUrl`.

## License

[MIT](./LICENSE)

## Agent page context

For each message, the trusted iframe requests page context by request ID. The SDK responds with the current pathname, document.title and meta description (up to 2000/500/2000 characters). Query parameters, fragments and the page body are excluded. Both sides check message origin and source. This works across SPA navigation without additional options. Older SDK releases can still chat without page context.

The SDK responds to the iframe’s `ready` event with a version-1 `init` message containing `payload.capabilities.pageContext: true`. The iframe requests page context only after this declaration. Older SDKs omit it, so the iframe skips collection without waiting; a declared capability still has a 500 ms response timeout.


## Mobile panel behavior

On screens up to 520px wide, opening the full-screen panel hides the launcher. Closing the panel restores its previous button/tab/hidden state. Closing through the panel UI returns focus to the visible launcher or the host entry; programmatic `closeWidget()` leaves host focus alone. Loading and error screens include an independent close button. Wider screens keep a floating panel whose height fits the available viewport; a short viewport alone never triggers full-screen mode.
