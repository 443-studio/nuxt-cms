# Changelog


## v0.10.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.10.0...v0.10.1)

### 💅 Refactors

- Field labels have no icon and show the description in a help tooltip ([24913c4](https://github.com/443-studio/nuxt-cms/commit/24913c4))
- Remove the dots from badges and the language switch ([e3449fd](https://github.com/443-studio/nuxt-cms/commit/e3449fd))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.10.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.9.4...v0.10.0)

### 🚀 Enhancements

- Server lifecycle hooks and signed webhooks ([47548c4](https://github.com/443-studio/nuxt-cms/commit/47548c4))
- Code-first roles and permissions for admin accounts ([38669f8](https://github.com/443-studio/nuxt-cms/commit/38669f8))
- Media focal point and CmsImage component ([7a1ac8e](https://github.com/443-studio/nuxt-cms/commit/7a1ac8e))
- Richer showIf operators, groups and block-level conditions ([05671ca](https://github.com/443-studio/nuxt-cms/commit/05671ca))
- Default, unique, immutable and min/max field options ([f7fa077](https://github.com/443-studio/nuxt-cms/commit/f7fa077))
- Translation progress, copy and clear actions in the admin ([ddea692](https://github.com/443-studio/nuxt-cms/commit/ddea692))
- Route patterns for content entries with path, byPath and useCmsRoute ([99b06f2](https://github.com/443-studio/nuxt-cms/commit/99b06f2))
- SEO kit with site settings, useCmsSeo, sitemap.xml, robots.txt and per-item noindex ([d2d56c2](https://github.com/443-studio/nuxt-cms/commit/d2d56c2))
- Redirects with automatic 301 when a content slug changes ([2fc3c3d](https://github.com/443-studio/nuxt-cms/commit/2fc3c3d))
- Shareable expiring draft preview links ([a1c9a55](https://github.com/443-studio/nuxt-cms/commit/a1c9a55))
- Link field with internal targets resolved to live paths ([4d7bc47](https://github.com/443-studio/nuxt-cms/commit/4d7bc47))
- Roles and field features cover routes, redirects, preview links and links ([11f1f2f](https://github.com/443-studio/nuxt-cms/commit/11f1f2f))
- Undo, redo and keyboard shortcuts in the visual editor ([629212a](https://github.com/443-studio/nuxt-cms/commit/629212a))
- Three-panel visual editor with a persistent block tree ([2771d6f](https://github.com/443-studio/nuxt-cms/commit/2771d6f))
- Copy, cut and paste blocks across editors and entries ([6f2f2af](https://github.com/443-studio/nuxt-cms/commit/6f2f2af))
- Searchable block picker with groups, tags and an anchored popover ([55559f5](https://github.com/443-studio/nuxt-cms/commit/55559f5))
- Click a marked field in the visual editor canvas to open it in the inspector ([509a0ca](https://github.com/443-studio/nuxt-cms/commit/509a0ca))
- Edit text fields in place in the visual editor canvas ([a33f0d9](https://github.com/443-studio/nuxt-cms/commit/a33f0d9))
- Block tree and picker on the KTree, Popover and KCommandList APIs ([ef0d578](https://github.com/443-studio/nuxt-cms/commit/ef0d578))
- Layout option on blocks for the tile modal and the visual editor inspector ([0af9224](https://github.com/443-studio/nuxt-cms/commit/0af9224))
- Block presets saved from a block and inserted from the block picker ([1d58460](https://github.com/443-studio/nuxt-cms/commit/1d58460))
- Block presets match fields by block schema signature ([8ec3af5](https://github.com/443-studio/nuxt-cms/commit/8ec3af5))
- Visual editor follows roles, field options and translation actions ([999408d](https://github.com/443-studio/nuxt-cms/commit/999408d))
- Nested blocks in config, storage, GraphQL and the block form ([9595664](https://github.com/443-studio/nuxt-cms/commit/9595664))
- Nested blocks in the visual editor ([29ee115](https://github.com/443-studio/nuxt-cms/commit/29ee115))
- Admin footer shows the nuxt-cms version with a link to GitHub ([f26dd4b](https://github.com/443-studio/nuxt-cms/commit/f26dd4b))

### 🩹 Fixes

- Custom admin fields follow the disabled state of the form ([19bd668](https://github.com/443-studio/nuxt-cms/commit/19bd668))
- Locale switch stays usable in a read-only form ([b36189c](https://github.com/443-studio/nuxt-cms/commit/b36189c))
- Site share image counts as media usage, hidden site keeps robots.txt open ([6a42af4](https://github.com/443-studio/nuxt-cms/commit/6a42af4))
- Tags and multi-select fields resolve to an empty list on rows saved before the field existed ([ae61579](https://github.com/443-studio/nuxt-cms/commit/ae61579))
- Playground home page uses KIcon instead of the removed CmsIcon ([97b7e53](https://github.com/443-studio/nuxt-cms/commit/97b7e53))
- Entry form tabs name their tab list ([7003f5d](https://github.com/443-studio/nuxt-cms/commit/7003f5d))
- Media usage names only the entries the role can read ([3021193](https://github.com/443-studio/nuxt-cms/commit/3021193))
- Generate the roles template as JavaScript so production builds parse it ([a32d01e](https://github.com/443-studio/nuxt-cms/commit/a32d01e))
- Paste and presets keep values that break the target field rules ([665e6ce](https://github.com/443-studio/nuxt-cms/commit/665e6ce))
- Hidden blocks on page entries ([8ed9354](https://github.com/443-studio/nuxt-cms/commit/8ed9354))
- Editor shortcuts and async races ([32179b7](https://github.com/443-studio/nuxt-cms/commit/32179b7))
- Sitemap and robots ignore forwarded hosts by default ([3682a30](https://github.com/443-studio/nuxt-cms/commit/3682a30))
- Unique, publish and redirect edge cases ([43a0627](https://github.com/443-studio/nuxt-cms/commit/43a0627))
- Pre-bundle zod for the admin so Vite does not reload the page ([cdb651e](https://github.com/443-studio/nuxt-cms/commit/cdb651e))
- Catch-all page 404s are fatal only on the client so the server does not log them ([63b37e9](https://github.com/443-studio/nuxt-cms/commit/63b37e9))
- Lists do not reload when only the URL hash changes ([16b9337](https://github.com/443-studio/nuxt-cms/commit/16b9337))
- Media folder cards keep the icon beside the name in the picker ([cdfa1fb](https://github.com/443-studio/nuxt-cms/commit/cdfa1fb))
- Playground site loads the 443 styles and its blocks share one column ([278ed62](https://github.com/443-studio/nuxt-cms/commit/278ed62))

### 💅 Refactors

- Block tree on 443-components 0.16.91 ([aa2d25f](https://github.com/443-studio/nuxt-cms/commit/aa2d25f))
- Admin layout, sidebar and settings modal on the KDashboardLayout pattern ([dcb19fd](https://github.com/443-studio/nuxt-cms/commit/dcb19fd))
- Every admin overlay lives in the URL hash ([6ce97e9](https://github.com/443-studio/nuxt-cms/commit/6ce97e9))
- Drawers and form modals on KFormDrawer and KFormModal ([7d757af](https://github.com/443-studio/nuxt-cms/commit/7d757af))
- Page headers with breadcrumbs as titles ([c0a7846](https://github.com/443-studio/nuxt-cms/commit/c0a7846))
- Lists with toolbars, full-width pagination and remembered filters ([59009ef](https://github.com/443-studio/nuxt-cms/commit/59009ef))
- Forms, buttons, headings and loading states ([6c99228](https://github.com/443-studio/nuxt-cms/commit/6c99228))
- Admin on 443-components 0.16.92 page header trail, list filters and navigation composables ([1ff5b51](https://github.com/443-studio/nuxt-cms/commit/1ff5b51))
- Editor tabs in the URL and unused form props ([c881a9d](https://github.com/443-studio/nuxt-cms/commit/c881a9d))
- Admin layout and stacks on KRoot, KStack and KGrid ([e72e857](https://github.com/443-studio/nuxt-cms/commit/e72e857))
- Page tree and nested block list on KTree ([e2940db](https://github.com/443-studio/nuxt-cms/commit/e2940db))
- Media library badges, progress, folders, list view and facts on 443 components ([2f3496a](https://github.com/443-studio/nuxt-cms/commit/2f3496a))
- Import, share, hints, status and warnings on 443 components ([50e5de5](https://github.com/443-studio/nuxt-cms/commit/50e5de5))
- Drag and drop on useSortable and tooltips on KTooltip ([2e7a141](https://github.com/443-studio/nuxt-cms/commit/2e7a141))
- Footer link on KButton and brand glyph as a registered icon ([1e4377b](https://github.com/443-studio/nuxt-cms/commit/1e4377b))
- Cms.css cleanup of duplicates, overrides and token bypasses ([fbad340](https://github.com/443-studio/nuxt-cms/commit/fbad340))
- Admin lists fill the page height with a row count and select all ([d4d9d4f](https://github.com/443-studio/nuxt-cms/commit/d4d9d4f))
- Media thumbnails, focal point and add tiles on 443 components ([98bd125](https://github.com/443-studio/nuxt-cms/commit/98bd125))
- Block tiles and media grid on TileGrid, settings columns on SortableList ([697d213](https://github.com/443-studio/nuxt-cms/commit/697d213))
- Link rows on RecordList and Tree, accordion, popover width ([7cd54e6](https://github.com/443-studio/nuxt-cms/commit/7cd54e6))
- Visual editor workspace on WorkspaceLayout ([f9ddb58](https://github.com/443-studio/nuxt-cms/commit/f9ddb58))
- Block picker popover as a sheet on phones ([b185706](https://github.com/443-studio/nuxt-cms/commit/b185706))
- Admin on 443-components 0.16.98 field highlight, search items, locale dots and file dialogs ([97a880d](https://github.com/443-studio/nuxt-cms/commit/97a880d))
- Media library fills the page height ([bcce6f6](https://github.com/443-studio/nuxt-cms/commit/bcce6f6))
- Admin root and site-side styles on 443 tokens ([3f4752b](https://github.com/443-studio/nuxt-cms/commit/3f4752b))
- Editor headers on 443-components 0.16.99 ([44a5bbc](https://github.com/443-studio/nuxt-cms/commit/44a5bbc))
- Every admin page is full width with the same header and spacing ([711254f](https://github.com/443-studio/nuxt-cms/commit/711254f))

### 🏡 Chore

- Playground migrations for routes, SEO, redirects, preview links and link field ([989af98](https://github.com/443-studio/nuxt-cms/commit/989af98))
- Bump 443-components to 0.16.100 ([74d27d1](https://github.com/443-studio/nuxt-cms/commit/74d27d1))
- Bump 443-components to 0.16.101 ([d0fa605](https://github.com/443-studio/nuxt-cms/commit/d0fa605))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.9.4

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.9.3...v0.9.4)

### 🩹 Fixes

- Single entries read the row they save instead of the first row of the table ([a396c09](https://github.com/443-studio/nuxt-cms/commit/a396c09))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.9.3

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.9.2...v0.9.3)

### 🚀 Enhancements

- Cms.config can import project code through Nuxt aliases ([3e2da7a](https://github.com/443-studio/nuxt-cms/commit/3e2da7a))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.9.2

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.9.1...v0.9.2)

### 🩹 Fixes

- Static login aside with 443-components 0.16.51 ([7457d59](https://github.com/443-studio/nuxt-cms/commit/7457d59))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.9.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.9.0...v0.9.1)

### 🚀 Enhancements

- Animated login aside, powered by link, account first in settings ([6c3dd41](https://github.com/443-studio/nuxt-cms/commit/6c3dd41))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.9.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.8.2...v0.9.0)

### 🚀 Enhancements

- Two-step login and sign out page with 443-components 0.16 ([ad7a627](https://github.com/443-studio/nuxt-cms/commit/ad7a627))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.8.2

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.8.1...v0.8.2)

### 🚀 Enhancements

- Allow slug fields generated from translatable text ([34c11f9](https://github.com/443-studio/nuxt-cms/commit/34c11f9))

### 🩹 Fixes

- Generate self-referencing relations without TypeScript-only syntax ([4df6aab](https://github.com/443-studio/nuxt-cms/commit/4df6aab))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.8.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.8.0...v0.8.1)

### 🩹 Fixes

- Stop leaking admin auto-imports and unresolvable optimizeDeps into host apps ([d3ebcb8](https://github.com/443-studio/nuxt-cms/commit/d3ebcb8))
- Scope admin styles and theme/locale plugins to the admin routes ([ed37e7f](https://github.com/443-studio/nuxt-cms/commit/ed37e7f))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.8.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.7.1...v0.8.0)

### 🚀 Enhancements

- Add tags field type and hasAny, hasAll and isEmpty filters for multi-value fields ([6d8fa5e](https://github.com/443-studio/nuxt-cms/commit/6d8fa5e))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.7.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.7.0...v0.7.1)

### 🩹 Fixes

- Update @xleddyl/443-components-vue to 0.6.2 so the admin language matches @nuxtjs/i18n after hydration ([85697b0](https://github.com/443-studio/nuxt-cms/commit/85697b0))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.7.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.6.0...v0.7.0)

### 💅 Refactors

- Merge the admin styles into one cms.css on the library tokens and drop the --cms and --ui token layer ([93d62cc](https://github.com/443-studio/nuxt-cms/commit/93d62cc))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.6.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.5.1...v0.6.0)

### 🚀 Enhancements

- Update @xleddyl/443-components-vue to 0.6.0 and move the repository to 443-studio ([3f2b05d](https://github.com/443-studio/nuxt-cms/commit/3f2b05d))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.5.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.5.0...v0.5.1)

### 🩹 Fixes

- Update @xleddyl/443-components-vue to 0.5.0 for smoother drawers, tighter headings and longer action toasts ([929339c](https://github.com/443-studio/nuxt-cms/commit/929339c))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.5.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.4.4...v0.5.0)

### 🚀 Enhancements

- Build the admin UI on @xleddyl/443-components-vue and stop injecting Tailwind into host apps ([552c3ab](https://github.com/443-studio/nuxt-cms/commit/552c3ab))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.4.4

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.4.3...v0.4.4)

### 🏡 Chore

- Share the release script with the other packages ([2bdd159](https://github.com/443-studio/nuxt-cms/commit/2bdd159))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.4.3

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.4.2...v0.4.3)

### 🚀 Enhancements

- Add select option labels, validate hooks and blocks min/max ([eb7932a](https://github.com/443-studio/nuxt-cms/commit/eb7932a))
- Add duplicate entry, list filters and collection import/export ([8ec93b8](https://github.com/443-studio/nuxt-cms/commit/8ec93b8))

### 🩹 Fixes

- Type the reference of a self relation in the generated drizzle schema ([4ca735f](https://github.com/443-studio/nuxt-cms/commit/4ca735f))
- Accept any JSON value in json fields inside blocks ([d111bdf](https://github.com/443-studio/nuxt-cms/commit/d111bdf))

### 📖 Documentation

- Rewrite the readme, fill doc gaps and refresh the screenshots in light mode ([db0ae4d](https://github.com/443-studio/nuxt-cms/commit/db0ae4d))
- Retake the screenshots with the new demo content ([498d4ee](https://github.com/443-studio/nuxt-cms/commit/498d4ee))

### 🏡 Chore

- **playground:** Add a blog, authors and every remaining field and module option ([df136da](https://github.com/443-studio/nuxt-cms/commit/df136da))
- **playground:** Regenerate migrations so every relation keeps its delete rule ([4ce8ca9](https://github.com/443-studio/nuxt-cms/commit/4ce8ca9))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.4.2

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.4.1...v0.4.2)

### 🩹 Fixes

- Return block subfields as nullable so missing values never drop the whole list ([a249c35](https://github.com/443-studio/nuxt-cms/commit/a249c35))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.4.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.4.0...v0.4.1)

### 🩹 Fixes

- Never write database credentials into the generated drizzle config ([907941e](https://github.com/443-studio/nuxt-cms/commit/907941e))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.4.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.3.0...v0.4.0)

### 🚀 Enhancements

- **admin:** Configurable brand title, subtitle and logo ([d51e4ac](https://github.com/443-studio/nuxt-cms/commit/d51e4ac))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.3.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.2.3...v0.3.0)

### 🚀 Enhancements

- **admin:** Global search and media download ([2cbef57](https://github.com/443-studio/nuxt-cms/commit/2cbef57))

### 🏡 Chore

- Release script bumps the exact semver level on 0.x versions ([141860b](https://github.com/443-studio/nuxt-cms/commit/141860b))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.2.3

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.2.2...v0.2.3)

### 🚀 Enhancements

- Content entries with scheduled publishing, datetime field and block components ([925e335](https://github.com/443-studio/nuxt-cms/commit/925e335))
- **admin:** Visual block editor with live preview page ([77910d5](https://github.com/443-studio/nuxt-cms/commit/77910d5))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.2.2

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- **admin:** Show where each media file is used and warn before deleting used media ([100cc50](https://github.com/443-studio/nuxt-cms/commit/100cc50))

### 🩹 Fixes

- **auth:** Lock login for 5 minutes after 5 failed attempts per IP or email ([f0d5242](https://github.com/443-studio/nuxt-cms/commit/f0d5242))
- Make multi-statement writes atomic on every driver and store ISO timestamps ([4b596c5](https://github.com/443-studio/nuxt-cms/commit/4b596c5))

### 🏡 Chore

- Remove code comments ([1b73353](https://github.com/443-studio/nuxt-cms/commit/1b73353))

### 🎨 Styles

- **admin:** Flatten the brand mark and drop the login grid and purple gradients ([cb08f99](https://github.com/443-studio/nuxt-cms/commit/cb08f99))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.2.1

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.2.0...v0.2.1)

### 🩹 Fixes

- Show the real light and dark colors in the theme previews ([e36c16d](https://github.com/443-studio/nuxt-cms/commit/e36c16d))
- **server:** Harden uploads, GraphQL depth checks, folder queries and Postgres search ([df3f9ad](https://github.com/443-studio/nuxt-cms/commit/df3f9ad))
- **admin:** Close only the top overlay on Escape, ignore stale loads and remove unused code ([dfaa676](https://github.com/443-studio/nuxt-cms/commit/dfaa676))

### 📖 Documentation

- Document filesystem storage and the client upload limit, drop the i18n claim ([e3f4067](https://github.com/443-studio/nuxt-cms/commit/e3f4067))

### 🏡 Chore

- Skip generated migration metadata in prettier ([de686c3](https://github.com/443-studio/nuxt-cms/commit/de686c3))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.2.0

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.61...v0.2.0)

### 🚀 Enhancements

- Upload whole folders to the media library, with their subfolders ([87f8471](https://github.com/443-studio/nuxt-cms/commit/87f8471))
- **admin:** Redesign the panel with a light and dark theme and a settings modal ([b611592](https://github.com/443-studio/nuxt-cms/commit/b611592))
- **admin:** Select table rows to delete, publish or unpublish them in bulk ([3bdf5d5](https://github.com/443-studio/nuxt-cms/commit/3bdf5d5))
- **admin:** Edit single-media blocks fields as a media list with add, remove and drag ([a1f7ea2](https://github.com/443-studio/nuxt-cms/commit/a1f7ea2))
- Configure form layouts, table columns and icons, and let admins change them in settings ([81d727e](https://github.com/443-studio/nuxt-cms/commit/81d727e))
- Add admin accounts that the super admin creates from settings ([c79a417](https://github.com/443-studio/nuxt-cms/commit/c79a417))

### 🩹 Fixes

- Show the required message when a required field is empty ([da224da](https://github.com/443-studio/nuxt-cms/commit/da224da))

### 📖 Documentation

- Document form layouts, settings and admin accounts ([4eb1a20](https://github.com/443-studio/nuxt-cms/commit/4eb1a20))

### 🏡 Chore

- **playground:** Cover every CMS option and move to a local sqlite database ([f980c82](https://github.com/443-studio/nuxt-cms/commit/f980c82))

### 🤖 CI

- Move actions to the node 24 runtime and fix the release notes input ([cdc5e60](https://github.com/443-studio/nuxt-cms/commit/cdc5e60))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.61

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.60...v0.1.61)

### 🚀 Enhancements

- Overhaul the media library with nested folders, search, bulk actions and a detail panel ([595344c](https://github.com/443-studio/nuxt-cms/commit/595344c))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.60

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.59...v0.1.60)

### 🚀 Enhancements

- Add a mobile variant option to media fields ([318a808](https://github.com/443-studio/nuxt-cms/commit/318a808))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.59

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.58...v0.1.59)

### 🚀 Enhancements

- Add filesystem media storage served by the module ([c1417c3](https://github.com/443-studio/nuxt-cms/commit/c1417c3))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.58

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.57...v0.1.58)

### 🩹 Fixes

- Apply libsql migrations in one atomic batch instead of an interactive transaction ([a9481a7](https://github.com/443-studio/nuxt-cms/commit/a9481a7))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.57

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.56...v0.1.57)

### 🚀 Enhancements

- Optional row storage for page entries ([f276517](https://github.com/443-studio/nuxt-cms/commit/f276517))
- Reject page media that is not in the media library and flag it in the admin ([17c641a](https://github.com/443-studio/nuxt-cms/commit/17c641a))
- Send the graphql queries of one tick in one request ([8b37653](https://github.com/443-studio/nuxt-cms/commit/8b37653))
- ⚠️  Store every page entry as rows and drop the storage option ([70ab771](https://github.com/443-studio/nuxt-cms/commit/70ab771))

#### ⚠️ Breaking Changes

- ⚠️  Store every page entry as rows and drop the storage option ([70ab771](https://github.com/443-studio/nuxt-cms/commit/70ab771))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.56

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.55...v0.1.56)

### 🩹 Fixes

- Share one async data option type with the disabled stub ([54c746c](https://github.com/443-studio/nuxt-cms/commit/54c746c))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.55

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.54...v0.1.55)

### 🚀 Enhancements

- Pass getCachedData through to useAsyncData ([97653b3](https://github.com/443-studio/nuxt-cms/commit/97653b3))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.54

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.53...v0.1.54)

### 🚀 Enhancements

- Split the admin form into tabs ([6192251](https://github.com/443-studio/nuxt-cms/commit/6192251))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.53

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.52...v0.1.53)

### 🩹 Fixes

- Let the libsql and d1 drivers read the sqlite migrations folder ([ccc87af](https://github.com/443-studio/nuxt-cms/commit/ccc87af))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.52

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.51...v0.1.52)

### 🩹 Fixes

- Emit the cms config wrapper as plain javascript so nitro can bundle it ([053d767](https://github.com/443-studio/nuxt-cms/commit/053d767))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.51

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.50...v0.1.51)

### 🚀 Enhancements

- Name a block tile by its media file instead of the block type ([2d4dd0e](https://github.com/443-studio/nuxt-cms/commit/2d4dd0e))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.50

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.49...v0.1.50)

### 🚀 Enhancements

- Show date and time of the last save on a page row, smaller breadcrumb chevrons ([d889482](https://github.com/443-studio/nuxt-cms/commit/d889482))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.49

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.48...v0.1.49)

### 🚀 Enhancements

- Media fields as compact tiles, last save date in the page tree, branch arrow mirrored ([be723e7](https://github.com/443-studio/nuxt-cms/commit/be723e7))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.48

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.47...v0.1.48)

### 🚀 Enhancements

- Reorder the blocks of a grid by dragging a tile instead of the arrow buttons ([e4c3114](https://github.com/443-studio/nuxt-cms/commit/e4c3114))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.47

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.46...v0.1.47)

### 🚀 Enhancements

- Pages as a tree with a breadcrumb, blocks edited as a grid, real media folders in s3 mode ([1ce15be](https://github.com/443-studio/nuxt-cms/commit/1ce15be))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.46

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.45...v0.1.46)

### 🩹 Fixes

- Keep the page route discovery inside runtime so the seed entry builds ([a5603ed](https://github.com/443-studio/nuxt-cms/commit/a5603ed))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.45

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.44...v0.1.45)

### 🚀 Enhancements

- Expose resolveCmsPages so scripts can read the page routes of a config ([d539a2f](https://github.com/443-studio/nuxt-cms/commit/d539a2f))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.44

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.43...v0.1.44)

### 🚀 Enhancements

- An override can remove a shared field from one page with null ([7c1ecb7](https://github.com/443-studio/nuxt-cms/commit/7c1ecb7))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.43

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.42...v0.1.43)

### 🚀 Enhancements

- Add the page entry kind with one row per route, a typed useCmsPage and a pages section in the admin ([2fd323e](https://github.com/443-studio/nuxt-cms/commit/2fd323e))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.42

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.41...v0.1.42)

### 🚀 Enhancements

- Add typed useCmsSingle and useCmsCollection, generate types and queries also when the cms is disabled ([428b8d1](https://github.com/443-studio/nuxt-cms/commit/428b8d1))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.41

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.40...v0.1.41)

### 🚀 Enhancements

- Query blocks through a generated interface and pass async data options to useCms ([0f532f8](https://github.com/443-studio/nuxt-cms/commit/0f532f8))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.40

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.39...v0.1.40)

### 🚀 Enhancements

- Media fields accept lists of types and read video dimensions ([6a23a3b](https://github.com/443-studio/nuxt-cms/commit/6a23a3b))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.39

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.38...v0.1.39)

## v0.1.38

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.37...v0.1.38)

## v0.1.37

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.36...v0.1.37)

### 🚀 Enhancements

- Bundle migrations at build time and add cloudflare d1 driver ([acb8b9a](https://github.com/443-studio/nuxt-cms/commit/acb8b9a))

### 📖 Documentation

- Document per-driver client packages in readme and getting started ([faa4da7](https://github.com/443-studio/nuxt-cms/commit/faa4da7))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.36

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.35...v0.1.36)

### 📖 Documentation

- Add readme badges and admin panel screenshots ([420318f](https://github.com/443-studio/nuxt-cms/commit/420318f))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.35

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.34...v0.1.35)

### 🩹 Fixes

- Conditional required fields must stay nullable in schema and graphql ([cd04ed7](https://github.com/443-studio/nuxt-cms/commit/cd04ed7))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.34

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.33...v0.1.34)

### 🚀 Enhancements

- Conditional field visibility with showIf ([3940672](https://github.com/443-studio/nuxt-cms/commit/3940672))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.33

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.32...v0.1.33)

### 🚀 Enhancements

- Translatable fields inside blocks ([d40ffce](https://github.com/443-studio/nuxt-cms/commit/d40ffce))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.32

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.31...v0.1.32)

### 🚀 Enhancements

- Private fields kept out of the public graphql api ([afc2ff1](https://github.com/443-studio/nuxt-cms/commit/afc2ff1))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.31

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.30...v0.1.31)

### 🚀 Enhancements

- Local media library reads from disk or build manifest instead of syncing cms_media ([a5d29d0](https://github.com/443-studio/nuxt-cms/commit/a5d29d0))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.30

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.29...v0.1.30)

### 🚀 Enhancements

- Build-time media manifest so local media syncs on serverless hosts ([8bf90fb](https://github.com/443-studio/nuxt-cms/commit/8bf90fb))

### 🏡 Chore

- Skip changelogen github release step ([e4f2efc](https://github.com/443-studio/nuxt-cms/commit/e4f2efc))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.29

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.28...v0.1.29)

### 🚀 Enhancements

- Translatable media fields and configurable upload size limit ([3e4c0f9](https://github.com/443-studio/nuxt-cms/commit/3e4c0f9))

### 🏡 Chore

- Docs ([382b8a0](https://github.com/443-studio/nuxt-cms/commit/382b8a0))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.28

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.27...v0.1.28)

### 🚀 Enhancements

- Redesign the admin panel with a dark minimal theme ([7dc8322](https://github.com/443-studio/nuxt-cms/commit/7dc8322))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.27

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.26...v0.1.27)

### 🚀 Enhancements

- Media library search, upload folders and clearer image field actions ([082cb7f](https://github.com/443-studio/nuxt-cms/commit/082cb7f))
- Sort collection rows by clicking the column headers ([eb733c5](https://github.com/443-studio/nuxt-cms/commit/eb733c5))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.26

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.25...v0.1.26)

### 🚀 Enhancements

- Sync local media library with the public media folder on server start ([027df53](https://github.com/443-studio/nuxt-cms/commit/027df53))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.25

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.24...v0.1.25)

### 🩹 Fixes

- Inline tailwind theme tokens so host app css is never overridden ([4306b3f](https://github.com/443-studio/nuxt-cms/commit/4306b3f))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.24

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.23...v0.1.24)

### 🚀 Enhancements

- Ui improvements ([61d206d](https://github.com/443-studio/nuxt-cms/commit/61d206d))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.23

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.22...v0.1.23)

### 🚀 Enhancements

- Add media.storage option with read-only local mode ([7d10615](https://github.com/443-studio/nuxt-cms/commit/7d10615))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.22

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.21...v0.1.22)

### 🩹 Fixes

- Register cms-admin layout from its real file instead of a virtual template ([821dc63](https://github.com/443-studio/nuxt-cms/commit/821dc63))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.21

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.20...v0.1.21)

### 🩹 Fixes

- Write cms-admin layout template to disk so vue-tracer resolves its client import ([5c2b79b](https://github.com/443-studio/nuxt-cms/commit/5c2b79b))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.20

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.19...v0.1.20)

### 🩹 Fixes

- Push release tag only after branch push ([929095d](https://github.com/443-studio/nuxt-cms/commit/929095d))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.19

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.18...v0.1.19)

## v0.1.18

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.17...v0.1.18)

### 🩹 Fixes

- Minor improvements and bug fixing ([e85201c](https://github.com/443-studio/nuxt-cms/commit/e85201c))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.17

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.16...v0.1.17)

## v0.1.16

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.15...v0.1.16)

### 🩹 Fixes

- Bundle ([4c8fd5d](https://github.com/443-studio/nuxt-cms/commit/4c8fd5d))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.15

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.14...v0.1.15)

### 🚀 Enhancements

- Seeding ([99bf36c](https://github.com/443-studio/nuxt-cms/commit/99bf36c))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.14

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.13...v0.1.14)

### 🚀 Enhancements

- New ui ([dbcd894](https://github.com/443-studio/nuxt-cms/commit/dbcd894))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.13

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.12...v0.1.13)

### 🩹 Fixes

- Readded test (fake) ([1f731d1](https://github.com/443-studio/nuxt-cms/commit/1f731d1))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.12

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.11...v0.1.12)

### 🚀 Enhancements

- Removed nuxt ui and i18n ([fd5aaa0](https://github.com/443-studio/nuxt-cms/commit/fd5aaa0))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.11

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.10...v0.1.11)

### 🚀 Enhancements

- Llm.txt and readme improvement ([0d9f966](https://github.com/443-studio/nuxt-cms/commit/0d9f966))
- Docs and libsql ([c8cb4d1](https://github.com/443-studio/nuxt-cms/commit/c8cb4d1))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.10


### 🚀 Enhancements

- Improvements ([8d988c5](https://github.com/443-studio/nuxt-cms/commit/8d988c5))

### ❤️ Contributors

- Edoardo Alberti <edoalberti99@gmail.com>

## v0.1.8

[compare changes](https://github.com/443-studio/nuxt-cms/compare/v0.1.7...v0.1.8)

