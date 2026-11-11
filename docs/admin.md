# Admin panel & security

The admin panel is served by the same Nitro server, under `/cms`. The super admin signs in with
the credentials from the environment variables. The super admin can add more accounts, each with
a [role](#roles-and-permissions) declared in code.

The brand shown in the sidebar, the mobile bar and the login page (logo, title, subtitle) is set
with `cms.admin.logo`, `cms.admin.title` and `cms.admin.subtitle`, see
[Configuration](configuration.md#admin-branding).

## Pages

| Path | Purpose |
| --- | --- |
| `/cms` | dashboard / entry-type index |
| `/cms/login` | admin login |
| `/cms/logout` | signs out, then opens the login page |
| `/cms/media` | media library |
| `/cms/:collection` | collection list, content list, single editor, or page list |
| `/cms/:collection/new` | create entry or content item |
| `/cms/:collection/:id` | edit entry, content item, or one page |
| `/cms/preview` | live preview inside the visual editor (path set by `cms.preview.path`) |

A [`page` entry](schema.md#pages) gets its own section in the sidebar. The list is a tree that
follows the routes of the site: a child path sits under its parent, indented. On the right of each
row is the date and time of the last save, or `Never saved` when the page has no row yet, because a
page row is written the first time that page is saved. The stamp is rendered in the timezone of the
browser. With several languages, a badge per language shows how much of the page is
[translated](#translations). The editor of a page shows the shared fields plus the
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
disabled, and so are the block picker, the `+` buttons and **Duplicate** of the visual editor.

**Order.** Drag a tile onto another one to move it there. The target tile is outlined while you
drag. For a keyboard, focus the grip at the bottom left of a tile and press the left or right arrow
key; the block editor also carries two move buttons, which is the way on a touch screen.

**Copy and paste.** The `...` menu of a tile has **Copy**, **Cut**, **Paste after** and
**Duplicate**. With a tile focused, ⌘ C, ⌘ X and ⌘ V (Ctrl outside macOS) do the same; ⌘ V on the
add tile appends. Copied blocks paste into any `blocks` field that has their type, here or in the
[visual editor](#copy-and-paste), even in another entry.

**Nested blocks.** A block with its own [`blocks` field](schema.md#nested-blocks) shows that field
as a grid of tiles inside its editor, with the same add, order, remove, hide, copy, paste and preset
actions. A click on a nested tile opens that block in the same editor, with the path of parent
blocks as a breadcrumb in the title (**Columns › Column › Text**): click a parent or **Back** to go
up one level. Move, **Duplicate**, **Hide** and **Remove** of the editor act on the open block in
its own list. After a failed save, tiles holding an invalid field are outlined in red at every level,
and the field shows its message when you open its block. A tile whose block only holds other blocks
previews the first text of its nested blocks, or their count. The visual editor edits nested blocks
directly: see [Nested blocks in the visual editor](#nested-blocks-in-the-visual-editor).

**Media lists.** A `blocks` field with one block type that has one `media` field (for example a
photo gallery) is edited as a media list. **+** opens the media library and adds the file you pick.
The X on a tile removes it, and a drag changes the order. No editor opens.

**Visual editor for a field.** When every block of a `blocks` field names a `component`, the field
also shows **Open visual editor**. It opens the [visual editor](#visual-editor) over the form, on
that field only: the block tree, the canvas and the form of the selected block, without the Content
and SEO tabs. **Done** goes back to the form; the changes are already in the form and are saved with
it.

**Validation.** Save checks the form first: required fields, formats, the number of blocks and the
[`validate` hooks](schema.md#validation-hooks) of the config. An error shows under its field, or
at the top of the form when it names no field, and the form opens the tab of the first one. A
warning from a hook shows in the same places, in amber, while you edit, and does not stop the save.
The admin API runs the same checks again.

**Select fields.** A select whose options have [labels](schema.md#select-option-labels) shows the
label in the input, the table, the entry title, relation pickers and search results; the stored
value stays the option value.

**Tags fields.** A [`tags`](schema.md#tags-fields) field is a chips input: type a value and press
Enter or comma to add it (pasting `a, b, c` adds three), Backspace on an empty input removes the
last chip and the x on a chip removes it. Values are trimmed and a value that is already there
(ignoring case) is not added twice. Unless the field sets `suggestions: false`, the dropdown
suggests the values used in the same field by the other entries; the first row is always what you
typed, so Enter adds it as written. At `max` the input stops adding. The table shows the tags
separated by commas, and the search box of the sidebar finds them.

**Bulk actions.** Every row of a collection table has a checkbox. When rows are selected, the
toolbar shows **Delete** and, on a collection with `drafts`, **Publish** and **Draft**. With one row
selected it also shows **Duplicate**.

**Duplicate.** **Duplicate** in the toolbar (one row selected), in the footer of the entry drawer,
or in the `...` menu of the visual editor opens a new, unsaved entry filled with a copy of the
values: translations, blocks, relations and media (the copy points at the same files, nothing is
uploaded again). Nothing is written until you save. So that the save does not hit a unique index:

- a `slug` gets the suffix `-copy-` plus four random characters (`spring-fair-copy-k3x9`; a copied
  slug that already ends with such a suffix gets a new one instead of a second one);
- a `one-to-one` relation is cleared, and so is every field with
  [`unique: true`](schema.md#field-options) (fill it before you save);
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
  `title.de`). Booleans are `true` or `false`, `json`, multi-select and `tags` values are JSON
  text (a `tags` cell may also be plain comma separated text, `Garda, Po`), and an empty cell is an
  empty value. The file is UTF-8 with a byte order mark, so spreadsheet apps read
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
- a value of a unique field (slug, one-to-one relation, a field with `unique: true`) used twice in
  the file or by another entry;
- a change of an [`immutable`](schema.md#field-options) field that already holds a value, on a row
  that updates an entry;
- ids: `create only` mode refuses an id that already exists, while `create or update by id` updates
  that entry (a missing field becomes empty, `status` is kept when the row has none; a row that
  creates an entry gets the `default` of a missing field instead). A row without
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

### Translations

With more than one language in [`cms.i18n`](configuration.md#i18n), the admin tracks how much of
each item is translated. Every translatable value that is filled in the default language counts:
`text`, `richtext` and `media` fields, at the top level and inside blocks, on collections, singles,
pages and content items. A value counts as translated in a language when that language has it too (rich
text with no visible text is empty). Fields hidden by `showIf` are left out, and `required` does not
matter. Each language is **complete** (every value), **partial** (some) or **missing** (none).

- **Language switches** carry a dot on every other language: green for complete, amber for partial,
  a red ring for missing. Hover a language for the count, for example `it: 3 of 5 values
  translated`. In a form each field has its own switch (a `blocks` field counts all its blocks); the
  switch of the visual editor counts the whole item.
- **Lists**: the table of a collection or content entry with translatable fields has a
  **Translations** column, with one badge per language other than the default. It is shown by
  default and can be hidden in **Settings > Content > Table columns**. The page tree shows the same
  badges. They are computed in the browser from the rows the list already loads.
- **Actions**: the `...` menu of the form header (entry page, entry drawer, single, page) and of the
  visual editor has a **Translations** group. **Copy EN into IT** has two choices: **Fill empty
  values** writes only the values that IT does not have yet, and **Replace all values...** asks
  first, then overwrites every IT value that has an EN version. **Clear IT...** asks first, then
  removes the IT values so the site falls back to the default language. The visual editor acts on
  the language picked in its top bar, and each action there is one undo step; a form lists every
  language other than the default. The actions change the form only: nothing is written until you
  save. They are hidden when your role cannot edit the item.

Read-only users can still switch languages to read every translation.

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

The visual editor edits a body of blocks on top of the real site. It fills the window with a top
bar and three panels:

- **Top bar**: back, the title, the status badge (Draft, Published or Scheduled) and an "Unsaved
  changes" note, the language switch, and the actions: **Undo** and **Redo**, **Schedule**,
  **Save**, **Publish** or **Unpublish**, and the `...` menu with the
  [translation actions](#translations), **Share preview**, **Duplicate** and **Delete**. The
  language switch marks how much of the item each language has.
  **Schedule** picks a publish date and publishes the item: with a future date it stays hidden from
  the site until then. Save stays in the editor; the first save of a new item moves to its URL.
- **Block tree** (left): every block of the body, in order. A row shows the block icon and label
  and a short summary (the first text, rich text or email value in the current language, or the
  name of its media file) so that similar blocks are easy to tell apart. A hidden block is dimmed
  with an eye icon, and a red dot before the label and a red label mark a block with a validation
  error. Drag a row by its handle to move it, or focus it and press Alt with the up or down arrow.
  On hover, on focus (Tab from the row) and on the selected row, the row shows **+** (add a block
  after it) and a `...` menu: add before or after, move up or down, **Duplicate**, **Hide** or
  **Show**, and **Delete**. The menu acts on its row and leaves the selection as it is, and it stays
  open while the pointer crosses other rows to reach it. On touch screens **+** and `...` are always
  visible. **Add a block** at the bottom adds one at the end.
- **Canvas** (center): the [preview page](#preview-page) of the site in an iframe, so the site
  layout and CSS apply. Every change is shown at once, before saving. The bar above it shows or
  hides each side panel, sets the preview width (desktop, tablet 768 px or mobile 390 px), shows
  the current width in pixels and reloads the preview.
- **Inspector** (right). With a block selected, the form of that block (arranged by the
  [block `layout`](schema.md#block-layout)) under a header with its icon, label and summary, a
  `...` menu with the block actions and a close button that clears the selection. With no block
  selected, two tabs: **Content** (the page address when the entry has a
  [`route`](schema.md#routes), in the active language, with **Open** to the live page once the
  saved item is published and not scheduled, then title, slug, publish date, excerpt, cover and the
  extra fields, arranged by the form layout, sections included) and **SEO** (the SEO fields and
  **Hide from search engines**). The language switch of the top bar drives every translatable
  field.

Click a row of the tree to select its block: the canvas scrolls to it. Hover a row to outline its
block in the canvas, and hover a block in the canvas to mark its row in the tree.

Drag the inner edge of a side panel to resize it (the blocks panel from 260 to 440 px, the
inspector from 300 to 560 px), or focus the edge and use the arrow keys, Home and End; a
double-click restores the default width. The widths and the hidden panels are remembered in the
browser. Below 1024 px the three panels become tabs (**Blocks**, **Preview**, **Fields**), with a
count of errors on Blocks and Fields; picking a block in the tree opens Fields.

In the canvas, hover a block to outline it with its label; click it to select it and open its
fields. The toolbar of a block has a drag handle, move up and down, **Duplicate**, **Hide** and
delete. A **+** between two blocks, and before the first and after the last, opens the
[block picker](#block-picker) and inserts the block there. A hidden block is not
drawn in the canvas: it stays in the block tree, where **Show** brings it back. Deleting a block
asks for no confirmation: undo brings it back. Deleting the whole item still asks.

**Fields in the canvas.** When a component [marks the element of a field](querying.md#marking-fields),
hovering that element in the canvas outlines it with the field label, and a click selects its block
and scrolls the inspector to the field, highlighted (the canvas always shows the language of the top
bar, so a translatable field opens in that language). A marked element outside every block, such
as the title in the [preview component](schema.md#preview-component), opens the field in the
**Content** or **SEO** tab.

**Editing text in the canvas.** Double-click a marked `text` field (a `textarea` too) to edit it in
place: the element gets a caret and a solid outline, and what you type reaches the inspector
within a quarter of a second. Enter saves the text (⌘ Enter in a `textarea`, where Enter adds a
line break), Escape restores the text you started from, and clicking elsewhere saves it. The whole
edit is one undo step. A translatable field is edited in the language of the top bar (an empty
translation shows the default language until you type). Pasted text arrives as plain text. Inline
editing needs the element to show the value as it is, with no other markup inside; otherwise a
double-click only opens the field in the inspector, as it does for every other field type. Rich
text is edited in the inspector only. Validation (for example `required`) shows in the inspector
as for any other edit. Typing stops at the `max` length of the field. A field hidden by its
`showIf` and an `immutable` field that already has a saved value are not edited in the canvas
(a double-click opens them in the inspector), and nothing is editable while the editor is read
only.

**Undo and redo.** The editor keeps the last 100 changes of the open item, from the canvas and from
the inspector forms alike. Typing in one field is one step once you pause. Undo restores the block
selection of that moment too. The history starts when the item opens, and saving does not reset
it; undoing back to the saved version clears the "Unsaved changes" note. The status (draft or
published) is not part of the history.

### Keyboard

The same keys work in the canvas and in the rest of the editor, except while the focus is in a
field (where the browser keeps its own undo) or in a dialog. ⌘ is Ctrl outside macOS.

| Keys | Action |
| --- | --- |
| ⌘ Z | undo |
| ⇧ ⌘ Z, ⌘ Y | redo |
| ⌘ S | save (also inside a field) |
| Delete, Backspace | delete the selected block |
| ⌘ D | duplicate the selected block |
| ⌘ ↑, ⌘ ↓ | move the selected block up or down |
| Enter, ⇧ Enter | open the block picker to add a block after or before the selected one |
| Escape | select the parent block, or clear the selection of a top-level block |
| ⌘ C, ⌘ X | copy or cut the selected block |
| ⌘ V | paste after the selected block, or at the end |

Duplicate and add do nothing once the field holds `max` blocks. In the canvas you can also focus the
drag handle of a block and press the arrow keys to move it (left and right work too, for blocks
side by side). In the block tree, Alt with the
up or down arrow moves the focused block. In the [block picker](#block-picker), ↑ and ↓ move
through the results, Enter picks and Escape closes. Every action is also a button or a menu item,
and every change from the tree, the menus and the canvas is one undo step.

**Validation.** Save and Publish check the whole item first, `validate` hooks included. The first
error selects the block that holds it, at any depth, and scrolls to its field, or opens its tab, shows the panel it is in and switches to
the default language when the field is translatable. A count marks every tab with an error and a
red dot every block with one in the tree. An error or a warning that names no field shows at the
top of the inspector, an error of the body itself (for example too few blocks)
shows at the top of the block tree, and one that names a block shows above the fields of that
block. Leaving with unsaved changes asks for a confirmation.

### Nested blocks in the visual editor

A block with its own [`blocks` field](schema.md#nested-blocks) (columns, accordion panels) is edited
like the top level, at every depth:

- **Tree.** Its items are nested rows under it, with an arrow to fold them (containers start
  open, and selecting a block opens its ancestors). A block with several nested `blocks` fields
  shows one group row per field, labeled with the field, with **+** to add at its end. An empty
  nested list shows an **Add a block** row. Drag a row into another list, or press Alt with an
  arrow key (left and right move out of and into the block above). A drop is only accepted where
  the field takes that block type with the same fields and has room under its `max`. The red dot
  of an invalid block also shows on every block that contains it, and a hidden block dims
  everything inside it. The `...` menu of a block adds **Add to** each of its nested fields.
- **Canvas.** Hover and click pick the innermost block under the pointer. A nested block has its
  own outline, label and toolbar (shown just above it), with a button to select its parent; its
  arrows are left and right when its list is side by side. The **+** buttons appear between the
  blocks of the list you hover or select, and inside the selected block. An empty nested list
  shows an **Add a block** placeholder in the canvas (in the editor only, never on the site). Drag
  a block by its handle into another column: the drop goes to the deepest list under the pointer
  that takes it, outlined while you drag.
- **Inspector.** The header shows the parent blocks as a breadcrumb (**Columns › Column**): click
  one to select it. A nested `blocks` field is a short list of its blocks: click one to select it,
  **Add a block** opens the picker for that list.
- **Picker, paste and presets** work on the list you add to: its blocks, its `max`, its presets.
  A block copied from inside a column pastes at the top level when the body takes that block, and
  a toast says what was skipped otherwise. A new block whose nested field has a `min` and one
  block type starts with that many (a new **Columns** has its two columns).

Undo, redo and the selection follow the block through every move, insert and delete. In a read
only editor nested blocks can be selected and copied, nothing more.

### Block picker

The block picker opens in a popover next to what opened it: under the **+** of a tree row, **Add a
block** or the add tile of a `blocks` field, under the **+** of the canvas, and for the menus and
Enter or ⇧ Enter at the edge of the selected block in the canvas (after or before it). On a screen
narrower than 640 px it opens as a dialog. The search box has the focus: type to filter
by label, description, [group and tags](schema.md#block-components) (case and accents do not
matter), move with ↑ and ↓, pick with Enter or a click, close with Escape. Blocks with a `group`
are listed under its heading. Each block shows its icon, label and description. When the field is
full the blocks are disabled, and hovering one (or reaching it with ↑ and ↓) says why. After you copy or cut blocks that the field accepts, the first row is
**Paste N blocks**. The [presets](#block-presets) that fit the field are listed last, under
**Presets**.

### Copy and paste

Copy, Cut and Paste after are also in the `...` menu of a block, in the tree and in the inspector.
Blocks go to the system clipboard as JSON text and to a copy kept by the admin, which is used when
the browser denies the clipboard or it holds something else. You can paste into another item, into
another content type that uses the same blocks, or into the tiles of a `blocks` field. Only the
block types of the target field are pasted: unknown fields are dropped, values are checked like the
form, and a full field takes as many as fit. A toast says what was pasted and what was skipped. Paste
matches blocks by type name only, since you choose where to paste: a block pasted into a field whose
block of that name has other fields keeps only the values that fit. In a text field, or with text
selected, the keys copy and paste text as usual.

### Block presets

**Save as preset** in the `...` menu of a block (block tree, inspector header, or a tile of a
`blocks` field) keeps a copy of that block under a name and an optional description. The
[block picker](#block-picker) of every field that has all the block types of a preset, with the
same schema, lists it under **Presets**, with its name and its number of blocks: picking it inserts
a copy, the same way a paste does (one undo step, as many blocks as fit under `max`, unknown fields
dropped, values checked). So a preset saved in a news item can be inserted into another news item,
or into a blog item when both use the same blocks.

The preset keeps a signature of each of its block types, computed from the field keys, the field
types and the options that shape the value (`translatable`, `integer`, the `select` option values
and `multiple`, the media `mediaType`). A field offers the preset only when every one of its block
types exists there with the same signature, so a news `quote` preset is not offered in an events
field whose own `quote` block has other fields. Labels, descriptions, validation rules, `layout`
and `component` do not count. Changing the fields of a block in `cms.config.ts` hides the presets
saved before the change. Presets saved before signatures existed are offered only in the field they
were saved from. A preset is a copy, not a link: changing or deleting it never changes the blocks
that were inserted from it.

**Settings → Block presets** lists every preset with its size and where it was saved from, to
rename or delete it. Presets live in the `cms_settings` table (one row per preset, keyed
`cms:presets:<id>`), up to 500 presets of up to 100 blocks and 1 MB each. **Save as preset** and
the **Presets** of the picker need `update` on the entry; **Settings → Block presets** (list,
rename, delete) needs `settings.manage`. Saving, renaming and deleting a preset fires no hook or
webhook.

### Share preview

**Share preview** in the `...` menu (saved items of a content entry with a
[`route`](schema.md#routes)) makes a link that shows the item on the real site to anyone, without
an account, even while it is a draft or scheduled. The link is the item address in the chosen
language plus `?cms-preview=<token>`; a never published item uses the address of its current slug.
It shows the **saved** version at the time it is opened, so later saves show up in it and unsaved
changes never do: with unsaved changes the dialog says so and offers **Save and create link**.

Pick how long the link lives: 1 hour, 1 day (default), 7 days or 30 days. The new link is copied
to the clipboard and shown once: only a SHA-256 hash of the token is stored, so it cannot be shown
again. The dialog lists the active links of the item (address, language, expiry, author) with
**Revoke**, which stops a link at once. Deleting the item deletes its links. Links live in the
built-in `cms_preview_links` table (`id`, `token_hash`, `entry`, `item_id`, `locale`,
`created_by`, `created_at`, `expires_at`, `revoked_at`), created by the generated migrations;
expired rows are removed when a new link is made. The admin API is
`GET`/`POST /api/cms/preview-links/<entry>/<id>` (`{ duration: '1h' | '1d' | '7d' | '30d', locale? }`)
and `DELETE /api/cms/preview-links/<entry>/<id>/<linkId>`, with an admin session and the same-origin
rule. Listing the links needs `<entry>.read`; creating and revoking them needs `<entry>.update`,
because a link shows the saved draft to people without an account. The menu item only shows to
roles with `<entry>.update`. How the site reads the link is in
[Querying](querying.md#preview-links).

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

- **Account**: your name and your password. The super admin account comes from the environment
  variables, so it has no form here.
- **Appearance**: the theme (light, dark or system). The choice is kept in the `cms-theme` cookie
  of the browser.
- **Users** (super admin and roles with `users.manage`): add accounts, pick their role, set a new
  password, delete accounts.
- **Site** (roles with `settings.manage`): site name, title template, default description, share
  image and the switch that hides the whole site from search engines. See
  [SEO](seo.md#site-settings).
- **Redirects** (roles with `redirects.manage`): the redirects of the site, with search, import and
  export. Changing the slug of a published item adds one. See [SEO](seo.md#redirects).
- **Block presets** (roles with `settings.manage`): rename and delete the
  [block presets](#block-presets).
- **Content** (roles with `settings.manage`): one item for each entry the role can read.
  - **Table columns** (collections only): show, hide and drag the columns of the table, including
    **Status** and **Translations**.
  - **Form layout**: drag a field up or down, or next to another field to put them in the same row.
    Sections come from the config and fields cannot be added.
- **Sign out**.

Column and layout changes save automatically in the `cms_settings` table and apply to every admin.
The [`layout` and `list` options](schema.md#form-layout) of the config are the default, and
**Reset to default** deletes the saved version. A saved layout follows config changes: a new field
goes at the end, and a removed field disappears. Block layouts come from the config only.

All pages except `/cms/login` require an authenticated admin session (enforced by the `cms-auth`
route middleware).

## Authentication

- The credentials of `NUXT_CMS_ADMIN_EMAIL` / `NUXT_CMS_ADMIN_PASSWORD` (or `cms.admin.*`) sign
  in as the **super admin**. This account is not stored in the database and does not show in any
  list.
- The super admin creates more accounts in **Settings → Users**: an email, an optional name, a
  role and a password (generate it and copy it with the buttons of the field). No email is sent.
  The built-in **admin** role can do everything in the panel except manage users; other roles come
  from [`cms.roles`](configuration.md#roles). Accounts are stored in the `cms_users` table, with
  the password hashed by scrypt.
- On the first sign-in of a new account, a dialog offers to set a new password. The user can keep
  the shared one. Later, **Settings → Account** changes the name and the password. When the super
  admin sets a new password for a user, the next sign-in shows the dialog again.
- A deleted account loses access on its next request.
- The login at `/cms/login` asks for the email first, then for the password. On a successful
  login a session cookie is set via [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils).
- **Sign out** opens `/cms/logout`. The page clears the session and reloads `/cms/login`, which
  offers to sign in again with the same account or with another account.
- Email and password are compared with a timing-safe hash comparison.
- **Login rate limiting:** after 5 failed attempts from one IP, or for one email, further attempts
  return `429` for 5 minutes. The lock always lasts 5 minutes and does not grow. Counters live
  in Nitro's `useStorage()` under `cms:login-rate`, which defaults to an in-memory driver: with more
  than one instance the limit is enforced per instance unless you mount a shared driver. See
  [Deployment → Horizontal scaling](deployment.md#horizontal-scaling).
- The count of failed attempts also resets 5 minutes after the first failure. A successful login
  clears the counters.

## Roles and permissions

Every account has one role. The super admin (env) holds every permission, the built-in `admin` role
every permission except `users.manage`, and the roles of [`cms.roles`](configuration.md#roles)
what their `can` list grants.

- **Server.** Every admin endpoint checks one permission through `requireCmsPermission(event,
  '<scope>.<action>')` (list and item reads, create, update, delete, import, export, tags,
  settings, media, users) and answers `403` with `Missing permission: <permission>`. The role is
  read from `cms_users` on every request, so a role change applies at once. Search only returns
  the entries the role can read, and media hits only with `media.read`.
- **Publishing.** On an entry with drafts, a role with `update` but without `publish` saves drafts
  only: it cannot create an item as published, publish a draft, unpublish, schedule, or edit an
  item that is already published (the live content would change). The form of a published item
  shows a notice and is read only. The import dry run reports the same rule per row. `delete` is
  its own permission and also removes published items.
- **Import** needs `import` and `create` (plus `update` in upsert mode). **Duplicate** needs
  `create`.
- **SEO.** Settings → Site needs `settings.manage` (`GET` and `PUT /api/cms/site`), Settings →
  Redirects needs `redirects.manage` (every `/api/cms/redirects` endpoint). The redirect left by a
  slug change is part of the item save, so it only needs the permissions of the save. **Share
  preview** needs `<entry>.update` (listing the links of an item needs `<entry>.read`).
- **Visual editor.** When the form of the item would be read only (no `update`, or a published item
  without `publish`), the visual editor is read only too: the inspector is disabled, the canvas
  shows no block toolbar, no **+** and no inline editing, the block tree cannot be reordered and
  its `...` menu only has **Copy**, the block picker, Undo and Redo are gone, and the keys that
  change blocks do nothing. The language switch, selection, hover and copy keep working.
- **Block presets.** Using them (the field list and **Save as preset**,
  `/api/cms/presets/<entry>/<field>`) needs `<entry>.update`; listing, renaming and deleting them
  in Settings needs `settings.manage`.
- **Links.** The link picker only searches the entries the role can read, and the preview only
  resolves links to them. `POST /api/cms/link-usage` needs `read` on the entry of every target
  and only reports the entries the role can read.
- **Admin UI.** The sidebar only lists what the role can read, and buttons the role cannot use are
  hidden (New entry, Delete, Duplicate, Publish, Schedule, Import, Export, Upload, folder actions,
  Settings sections). A direct URL to a section the role cannot read goes back to `/cms`. The
  panel computes the same permissions as the server with the same shared function, from the role
  in the session (refreshed on every session fetch).
- **Users.** The super admin and roles with `users.manage` manage accounts, with the grant rule: a
  user can assign a role only when they hold every permission of that role, and can edit or delete
  an account only when they could assign its role. Nobody can change their own role or delete
  their own account, and nobody can grant `superadmin`. The super admin lives in the environment,
  so no account can remove or lock it out.
- **Removed roles.** An account whose role is not in the config anymore gets no access: the panel
  shows "Your role no longer exists" and the users list marks the account, so an admin can pick a
  new role.

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

- A super admin from env, plus accounts in `cms_users` (scrypt hashes) with code-first roles,
  checked by every admin endpoint. The credential check is timing-safe.
- Encrypted session cookies; production requires `NUXT_SESSION_PASSWORD` (≥ 32 chars).
- Login rate limiting: per IP and per email, 5 failures lock the login for 5 minutes.
- Admin mutations require a same-origin request.
- The public GraphQL API is read-only and never exposes draft entries, except the one item of a
  valid [preview link](querying.md#preview-links). Introspection works only in development.
- Preview link tokens are 32 random bytes (base64url), stored only as a SHA-256 hash, looked up by
  that hash, scoped to one item and limited to 30 days. There is no rate limit on wrong tokens:
  guessing 256 bits is not practical. The module never logs them.
