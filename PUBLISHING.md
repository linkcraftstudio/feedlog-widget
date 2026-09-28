# Publishing

Notes for maintainers releasing `@feedlog/widget` to npm. Not needed to use or build the package.

## Prerequisites

`@feedlog` is a scoped package name. Publishing requires that the `@feedlog`
organization exists on npm and that your account is a member with publish
rights — otherwise `npm publish` fails with `404`/`403` even though
`publishConfig.access` is set to `public`. Register the org (or claim the
scope) and confirm access first.

## Release steps

Before publishing, run `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm size`.
Verify the four package exports and check theme changes, host modal stacking,
launcher recovery, synchronous login and Promise login in a real browser.
Keep the old SDK working with the new embed page. Check that an old embed
degrades without reloading an active conversation. Deploy the compatible embed
page before advertising live-theme and draft-recovery support.

Update `README.md` to match the release's public API and behavior.

```bash
npm version <patch|minor|major>   # bump version + tag
npm publish                       # prepublishOnly runs the build first
```

- `prepublishOnly` runs `npm run build`, so `dist/` is produced fresh at
  publish time. `dist/` is intentionally gitignored and not committed.
- `files` in `package.json` includes only `dist`, so only that directory plus
  `README.md`, `LICENSE`, and `package.json` are published — never `src/`,
  `playground/`, or any local `.env`. Verify with `npm pack --dry-run`.
- The package is ESM-only (`"type": "module"`) with a single entry point.
