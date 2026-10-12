# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. The super admin signs in with
the credentials from the environment variables. The super admin can add more admin accounts.

The brand shown in the sidebar, the mobile bar and the login page (logo, title, subtitle) is set
with `cms.admin.logo`, `cms.admin.title` and `cms.admin.subtitle`, see
[Configuration](configuration.md#admin-branding).

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/media` | media library |
| `/cms/:collection` | collection list, content list, single editor, or page list |
| `/cms/:collection/new` | create entry or content item |
| `/cms/:collection/:id` | edit entry, content item, or one page |
| `/cms/preview` | live preview inside the visual editor (path set by `cms.preview.path`) |

A [`page` entry](schema.md#pages) gets its own section in the sidebar. The list is a tree that
follows the routes of the site: a child path sits under its parent, indented. On the right of each
row is the date and time of the last save, or `Never saved` when the page has no row yet, because a
page row is written the first time that page is saved. The stamp is rendered in the timezone of the
browser. The editor of a page shows the shared fields plus the
fields of that path, and its title carries a breadcrumb back to each ancestor page and to the list.
Pages cannot be deleted from the admin.

[Content entries](schema.md#content) get a **Content** group in the sidebar, between Singles and
Pages. Their list is the collection table, with title, status and publish date as default columns.
The status badge reads **Scheduled** when an item is published with a future `publishedAt`. New
and existing items open in the [visual editor](#visual-editor) (`/cms/<entry>/new`,
`/cms/<entry>/<id>`). Publishing an item with an empty publish date sets it to now. The publish date
is picked in the browser's time zone and stored in UTC.

A `blocks` field is edited as a grid of tiles, not as a stack of forms. Each tile previews the
first media of the block (or its first text) and names it by that file, falling back to the label of
the block type. A click opens that block alone with its fields, a duplicate and a remove action. The last cell of the grid adds a block. The editor also has
**Hide** and **Show**: a hidden block is dimmed in the grid and left out of the public API. A
block that declares its own `boolean` field named `hidden` uses that field instead.

A `media` field is a tile of the same shape, with the preview, the file name, replace and remove.
An empty one is a dashed box that opens the media library.

**Number of blocks.** On a field with [`min` or `max`](schema.md#number-of-blocks) the grid shows
the allowed count under it. Once the field holds `max` blocks, the add tile and **Duplicate** are
disabled, and so are the palette, the `+` buttons and **Duplicate** of the visual editor.

**Order.** Drag a tile onto another one to move it there. The target tile is outlined while you
drag. For a keyboard, focus the grip at the bottom left of a tile and press the left or right arrow
key; the block editor also carries two move buttons, which is the way on a touch screen.

**Media lists.** A `blocks` field with one block type that has one `media` field (for example a
photo gallery) is edited as a media list. **+** opens the media library and adds the file you pick.
The X on a tile removes it, and a drag changes the order. No editor opens.

**Visual editor for a field.** When every block of a `blocks` field names a `component`, the field
also shows **Open visual editor**. It opens the [visual editor](#visual-editor) over the form, on
that field only, with the Block panel. **Done** goes back to the form; the changes are already in
the form and are saved with it.

**Validation.** Save checks the form first: required fields, formats, the number of blocks and the
[`validate` hooks](schema.md#validation-hooks) of the config. An error shows under its field, or
at the top of the form when it names no field, and the form opens the tab of the first one. A
warning from a hook shows in the same places, in amber, while you edit, and does not stop the save.
The admin API runs the same checks again.

**Select fields.** A select whose options have [labels](schema.md#select-option-labels) shows the
label in the input, the table, the entry title, relation pickers and search results; the stored
value stays the option value.

**Bulk actions.** Every row of a collection table has a checkbox. When rows are selected, the
toolbar shows **Delete** and, on a collection with `drafts`, **Publish** and **Draft**. With one row
selected it also shows **Duplicate**.

**Duplicate.** **Duplicate** in the toolbar (one row selected), in the footer of the entry drawer,
or in the `...` menu of the visual editor opens a new, unsaved entry filled with a copy of the
values: translations, blocks, relations and media (the copy points at the same files, nothing is
uploaded again). Nothing is written until you save. So that the save does not hit a unique index:

- a `slug` gets the suffix `-copy-` plus four random characters (`spring-fair-copy-k3x9`; a copied
  slug that already ends with such a suffix gets a new one instead of a second one);
- a `one-to-one` relation is cleared;
- a `text` title field gets ` (copy)` in every language that has a value;
- on an entry with `drafts` the copy starts as a draft, and a content item also loses its publish
  date.

The drawer asks before it duplicates an entry with unsaved changes, and copies the saved version.
In the visual editor the copy opens at `/cms/<entry>/new?duplicate=<id>`.

### Filters

Above the table of a collection or content entry, a row of filter buttons narrows the list. A
filter exists for every single `select` (the button shows the option labels), `boolean` (Yes or
No; No also matches an empty value), `many-to-one` or `one-to-one` relation (a searchable picker of
the target entries) and, with drafts, the status (Draft or Published). Without
[`list.filters`](schema.md#form-layout) the row offers the eligible fields that are visible columns
of the table; `list.filters: ['subject', 'type']` picks the fields and their order instead,
whatever the columns.

Filters combine with AND, with the search box, the sort and the pagination. They live in the URL
(`?filter.subject=math&filter.type=quiz`), so a reload, a bookmark or a shared link keeps them.
**Clear filters** removes them all. The admin list API applies them on the server: it accepts only
the fields that the list offers and only their allowed values (the option values of a select,
`true` or `false`, `draft` or `published`, a relation id of up to 256 characters), answers `400`
otherwise, and binds every value as a query parameter on SQLite, libSQL, D1 and Postgres.

### Import and export

The arrows button next to **New entry** opens the import and export menu of a collection or
content entry.

**Export** downloads the rows as a file named `<entry>-<yyyy-mm-dd>.<format>`: **Export all**, or,
while a search or a filter is active, **Export filtered** for the current set. The order is the
table order.

- **JSON**, for every entry: `{ "collection", "exportedAt", "total", "items" }`. Each item holds
  `id`, every field (private fields too), `status` with drafts, `createdAt` and `updatedAt`, in the
  shape of the admin API: translatable values as `{ "<locale>": value }` maps, media as keys,
  relations as ids and many-to-many relations as lists of ids, blocks as their list.
- **CSV**, only when the entry has no `blocks` and no `many-to-many` field. The header is `id`, the
  fields, `status` and the timestamps. A translatable field has one column per locale (`title.it`,
  `title.de`). Booleans are `true` or `false`, `json` and multi-select values are JSON text, and an
  empty cell is an empty value. The file is UTF-8 with a byte order mark, so spreadsheet apps read
  the accents.

**Import from file** takes a file in the same format (a JSON file can also be a plain array of
items). The admin checks it before anything is written and shows a preview: how many rows are new
and how many update an entry, and every row with a problem, with the field and the message. The
checks are the ones of the entry form, so the field types, required fields, the number of blocks
and the [`validate` hook](schema.md#validation-hooks) all apply, plus:

- unknown CSV columns or JSON keys, and cells that are not a number, a boolean or JSON;
- relation ids that do not exist (an id of a row of the same file counts for a relation to the same
  collection);
- media keys that are not in the media library: import references files, it never uploads them;
- a value of a unique field (slug, one-to-one relation) used twice in the file or by another entry;
- ids: `create only` mode refuses an id that already exists, while `create or update by id` updates
  that entry (a missing field becomes empty, `status` is kept when the row has none). A row without
  an id becomes a new entry with a new id; a row with an unknown id is created with that id, so
  relations between exported files keep working.

**Import** stays disabled until every row passes. All the rows are then written in one transaction
on SQLite and Postgres and in one batch on libSQL and D1, so a failure leaves the collection
untouched. New rows without a status are drafts. `createdAt` and `updatedAt` of the file are not
imported. A relation to a row further down in the same file works for optional relations to the same
collection, which are linked after every row is written.

Limits: 5 MB and 2000 rows per file. The endpoints follow the rules of every admin endpoint (admin
session, same-origin requests for writes): `GET /api/cms/export/<entry>?format=json|csv` with the
`search`, `sort`, `order` and `filter.<field>` parameters of the list, and
`POST /api/cms/import/<entry>?format=json|csv&mode=create|upsert&dryRun=true|false` with the file
as the request body. Singles and pages have no import or export.

## Search

The search box under the title of the sidebar, or ⌘K (Ctrl K on Windows and Linux), opens a search
dialog. Results appear while you type, from 2 characters on, grouped by entry:

- **Labels** from the config: entries, pages (label or path), tabs, fields, blocks and block
  fields. A hit opens that entry or page; on a single or on a field of one page it opens the editor
  on that field.
- **Values** stored in every entry: collections, singles, content items and pages (page field rows
  and blocks included), in every language of a translatable field, with a language badge. Text,
  rich text (matched without its markup), slugs, emails, selects, JSON and the fields of blocks are
  searched, private fields too, plus the alt texts of the media library. Each hit shows the item,
  the field and a snippet with the match highlighted.

Up and down move through the results, Enter opens one, Escape or a click outside closes the dialog.
A hit opens the editor with `?field=`, `locale=` and `block=` in the URL: the editor switches to the
tab and the language of the field, selects the block in the visual editor, scrolls to the field and
highlights it.

The dialog reads `GET /api/cms/search?q=`, which needs an admin session like every admin endpoint.
Matching is a case-insensitive `LIKE` (`%` and `_` in the query are matched literally), with at
most 10 rows per entry and 50 value hits; type more words to narrow the results. On SQLite, libSQL
and D1 the case folding only covers ASCII letters, and a phrase that spans formatting in rich text
(for example a bold word in the middle) is not found as a whole.

## Visual editor

The visual editor edits a body of blocks on top of the real site. It fills the window:

- **Top bar**: back, the title, the status badge (Draft, Published or Scheduled) and an "Unsaved
  changes" note, the language switch, the preview width (desktop or mobile, 390 px), and the
  actions: **Schedule**, **Save**, **Publish** or **Unpublish**, and Delete in the `...` menu.
  **Schedule** picks a publish date and publishes the item: with a future date it stays hidden from
  the site until then. Save stays in the editor; the first save of a new item moves to its URL.
- **Canvas** (center): the [preview page](#preview-page) of the site in an iframe, so the site
  layout and CSS apply. Every change is shown at once, before saving.
- **Inspector** (right), with three tabs. **Content**: title, slug, publish date, excerpt, cover and
  the extra fields, in the order of the form layout. **Block**: the fields of the selected block,
  or, when no block is selected, the list of blocks and the palette to add one. **SEO**: the SEO
  fields. The language switch of the top bar drives every translatable field.

In the canvas, hover a block to outline it with its label; click it to select it and open its
fields. The toolbar of a block has a drag handle, move up and down, **Duplicate**, **Hide** and
delete. A **+** between two blocks, and before the first and after the last, opens the palette
(label, icon and description of each block type) and inserts the block there. A hidden block is not
drawn in the canvas: it stays in the block list with an eye icon, where **Show** brings it back.

**Keyboard.** Every action is a button. In the canvas, focus the drag handle and press the up or
down arrow to move the block; Escape clears the selection. In the block list, Alt with the up or
down arrow moves the focused block. The block panel also has move up and move down buttons.

**Validation.** Save and Publish check the whole item first, `validate` hooks included. The first
error opens its tab, selects the block that holds it and switches to the default language when the
field is translatable; a dot marks every tab with an error. An error or a warning that names no
field shows at the top of the inspector, and one that names a block shows above the fields of that
block. Leaving with unsaved changes asks for a confirmation.

### Preview page

The canvas loads `/cms/preview` (see [`preview.path`](configuration.md#preview)), a page that the
module adds to the site. It uses the default layout of the site, so it looks like a real page. It
needs an admin session, answers with `X-Robots-Tag: noindex, nofollow` and a robots meta tag,
`X-Frame-Options: SAMEORIGIN`, and lives under `/cms`, so keep `/cms/**` out of your sitemap. The page
reads nothing from the public API: the admin sends the unsaved item with `postMessage`, and both
sides check the origin and the sender window of every message. A reload of the iframe, or a hot
reload in development, asks the admin for the data again.

The preview resolves translations like the GraphQL API does, and the admin sends the media objects
(`url`, `alt`, `type`, `width`, `height`) of the media library, so a block component receives the
same props as on the site. Relations are passed as ids. Each block root gets `data-cms-block`
attributes, which the editor uses to draw its outlines, so a block component needs a single root
element. Clicks on links and form submits inside the canvas do nothing.

A content entry can show its body inside a component of the site, for example the article header,
with [`preview.component`](schema.md#preview-component). Without one, the canvas shows the blocks
only.

## Settings

The account button at the bottom of the sidebar opens **Settings**:

- **General**: the theme (light, dark or system). The choice is kept in the `cms-theme` cookie of
  the browser.
- **Account**: your name and your password. The super admin account comes from the environment
  variables, so it has no form here.
- **Users** (super admin only): add accounts, set a new password, delete accounts.
- **Content**: one item for each entry.
  - **Table columns** (collections only): show, hide and drag the columns of the table.
  - **Form layout**: drag a field up or down, or next to another field to put them in the same row.
    Sections come from the config and fields cannot be added.
- **Sign out**.

Column and layout changes save automatically in the `cms_settings` table and apply to every admin.
The [`layout` and `list` options](schema.md#form-layout) of the config are the default, and
**Reset to default** deletes the saved version. A saved layout follows config changes: a new field
goes at the end, and a removed field disappears.

All pages except `/cms/login` require an authenticated admin session (enforced by the `cms-auth`
route middleware).

## Authentication

- The credentials of `NUXT_CMS_ADMIN_EMAIL` / `NUXT_CMS_ADMIN_PASSWORD` (or `cms.admin.*`) sign
  in as the **super admin**. This account is not stored in the database and does not show in any
  list.
- The super admin creates more accounts in **Settings → Users**: an email, an optional name and a
  password (generate it and copy it with the buttons of the field). No email is sent. These
  accounts have the **admin** role: they can do everything in the panel, except manage users. They
  are stored in the `cms_users` table, with the password hashed by scrypt.
- On the first sign-in of a new account, a dialog offers to set a new password. The user can keep
  the shared one. Later, **Settings → Account** changes the name and the password. When the super
  admin sets a new password for a user, the next sign-in shows the dialog again.
- A deleted account loses access on its next request.
- On a successful login at `/cms/login` a session cookie is set via
  [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).
- Email and password are compared with a timing-safe hash comparison.
- **Login rate limiting:** after 5 failed attempts from one IP, or for one email, further attempts
  return `429` for 5 minutes. The lock always lasts 5 minutes and does not grow. Counters live
  in Nitro's `useStorage()` under `cms:login-rate`, which defaults to an in-memory driver: with more
  than one instance the limit is enforced per instance unless you mount a shared driver. See
  [Deployment → Horizontal scaling](deployment.md#horizontal-scaling).
- The count of failed attempts also resets 5 minutes after the first failure. A successful login
  clears the counters.

## Sessions

Sessions are encrypted cookies. In **production** the module refuses to boot unless
`NUXT_SESSION_PASSWORD` is set to at least 32 characters. Set a strong random value:

```bash
NUXT_SESSION_PASSWORD=$(openssl rand -base64 32)
```

The admin panel manages entries and media through its own authenticated, same-origin API. That API
is internal to the panel: your frontend reads content through the public
[GraphQL API](querying.md), never through the admin endpoints.

## Security summary

- A super admin from env, plus admin accounts in `cms_users` (scrypt hashes). The credential check
  is timing-safe.
- Encrypted session cookies; production requires `NUXT_SESSION_PASSWORD` (≥ 32 chars).
- Login rate limiting: per IP and per email, 5 failures lock the login for 5 minutes.
- Admin mutations require a same-origin request.
- The public GraphQL API is read-only and never exposes draft entries. Introspection works only
  in development.
