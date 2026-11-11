# Schema

Content types are declared in `cms.config.ts` at the project root with `defineCmsConfig()`. From
this single file the module generates the database schema, migrations, TypeScript types and the
read-only GraphQL API. The config is validated at build time; invalid config fails the build with
precise errors.

```ts
import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   <entryKey>: {
      id: '<entryKey>',            // must equal the object key
      label: 'Human label',
      kind: 'collection' | 'single' | 'content',
      titleField: 'name',          // collections: required, field used as the entry title
      drafts: true,                // optional; adds draft/published status
      fields: { <fieldKey>: <FieldInput>, ... },
   },
})
```

## Entries

- **`collection`**: many rows, with list + detail + count queries.
- **`single`**: one document, with a single query.
- **`page`**: one row per route of the app, with a list query and a query by path. See
  [Pages](#pages).
- **`content`**: one entry per content type (news, blog, ...). Each item has system fields (title,
  slug, excerpt, cover, publish date, SEO) and a body made of blocks, with drafts and scheduled
  publishing. See [Content](#content).
- `id` (equal to the object key), `label`, `kind` and `fields` are required.
- `titleField` is **required on collections** and not allowed on singles. It picks the field used as
  the entry title: in the admin list, in relation pickers, and to render relation columns (a
  relation cell shows the target's title instead of its id). It must be a `text`, `slug`, `email`,
  `number`, `date` or single `select` field, and it is the field the admin search matches on.
- `drafts: true` (collections only) adds a draft/published status. **The public GraphQL API returns
  published rows only**: drafts are invisible to it.
- `id`, `createdAt` (collections only) and `updatedAt` are managed automatically: never declare
  them as fields. Row ids are opaque strings.

The GraphQL type name is the PascalCase of the entry key (`blog_posts` → `BlogPosts`).

## Pages

A `page` entry holds the content of the pages of the app: one row per route, with one section in
the admin. Use it for the images and the texts that belong to a page, instead of one
`single` per page.

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   exclude: ['/cms'],
   labels: { '/': 'Home' },
   order: ['/', '/about'],
   fields: {
      title: { label: 'Title', type: 'text', translatable: true },
      cover: { label: 'Cover', type: 'media', mediaType: ['image', 'video'] },
   },
   overrides: {
      '/about': { intro: { label: 'Intro', type: 'text', textarea: true } },
   },
}
```

**Where the rows come from.** By default (`routes: 'auto'`) the module reads the page files of the
app and makes one row per route. Dynamic routes (`[slug].vue`, `[...all].vue`) are skipped, and
route groups (`(marketing)/`) do not appear in the path. `routes: ['/a', '/b']` replaces the
discovered list with an explicit one. `include` adds paths that are not page files, `exclude`
removes paths, `order` puts the given paths first in the admin, and `labels` overrides the label
that is otherwise built from the last segment of the path.

**Fields.** `fields` applies to every page. `overrides` changes the fields of one path: it adds
fields, and `null` removes a shared field from that path alone.

```ts
overrides: {
   '/': { gallery: null, slideshow: { label: 'Slideshow', type: 'blocks', blocks: { ... } } },
}
```

An override may not redeclare a shared field, and two paths that declare the same field name must
declare the same type. A removed field keeps its stored values, so the other pages are untouched.
The admin form of a path shows exactly the fields of that path.

**Identity.** `path` is a reserved field name and is unique. Each row has an `id` built from the
path (`/asolo-e-dintorni/venezia` gives `asoloEDintorniVenezia`, `/` gives `home`), which is the
address of the page in the admin.

**Scripts.** A script that reads `cms.config.ts` on its own (a seed, an import) gets no routes,
because the module resolves them at build time. `resolveCmsPages` fills them in:

```ts
import { resolveCmsPages } from '@xleddyl/nuxt-cms/seed'

const config = resolveCmsPages(await jiti.import('./cms.config.ts', { default: true }))
config.pages.pages // [{ path: '/about', key: 'about', label: 'About' }, ...]
```

**Limits.** One page entry per config. `titleField` and `drafts` do not apply. Rows are created
when a page is saved for the first time, and they cannot be deleted from the admin.

### Storage

A page entry keeps one row per page and stores the field values as rows of two child tables, so
pages with many page-specific fields do not produce a wide table that is mostly `NULL`.
`columns` lists the fields that stay columns of the page table (none by default):

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   columns: ['seoTitle', 'seoDescription', 'seoImage'],
   fields: { ... },
   overrides: { ... },
}
```

For an entry called `pages` the schema is:

```
pages         (id, path unique, <fields listed in columns>, updated_at)
pages_fields  (page_id -> pages.id on delete cascade, key, position default 0, value)
              primary key (page_id, key, position)
pages_media   (page_id -> pages.id on delete cascade, key, position default 0, media_key)
              primary key (page_id, key, position)
```

- `columns` lists the fields that stay columns of the page table. Each one must be declared in
  `fields` (for every page) and must not be removed by an override. Without `columns` the page
  table holds only `id`, `path` and `updated_at`.
- A scalar field is one row in `<entry>_fields` at `position` 0. Plain strings (`text`,
  `richtext`, `email`, `date`, single `select`) are stored as they are; every other value
  (numbers, booleans, multi-select, `tags`, `json`, translatable text) is stored as JSON text, so a
  translatable field keeps the same `{"en": "...", "it": "..."}` it has in a column.
- A media field is one row in `<entry>_media` at `position` 0; `media_key` holds the same value a
  column would (the key, or the JSON of a translatable media).
- A `blocks` field stores each block at its own `position`: the block type is a row with
  `key = <field>._type`, each subfield is a row with `key = <field>.<subfield>` (media subfields
  in `<entry>_media`, the others in `<entry>_fields`).
- An empty value (`null`) has no row. An empty list of blocks reads back as `null`.
- `relation` and `slug` fields must be listed in `columns` (they need their foreign key and their
  unique index), and many-to-many relations are not supported on pages.

The storage does not show outside the database: the GraphQL schema, the generated types and
queries, the admin API and the panel see one flat object per page, with every field. Reading a page (or all pages) is one
query on every driver, with two correlated subqueries (`json_group_array` on SQLite, libSQL and
D1, `json_agg` on Postgres). Saving a page is one transaction on SQLite and Postgres and one batch
(a single round trip) on libSQL and D1.

**No foreign key to `cms_media`.** `media_key` is not a foreign key to `cms_media.key`. With
`storage: 'local'` the files come from the folder (or the build manifest) and `cms_media` only holds
the alt texts and focal points, so it can be empty while pages use many media; with `'s3'` deleting a file from the
library removes its `cms_media` row, and a foreign key would either block that or wipe content. The
module checks media keys when a page is saved instead: the admin API rejects (400) a media key, in
a media field or in a block, that is not in the media library (the folder or manifest in local
mode, `cms_media` in `'s3'` mode), and the panel flags a saved media that is no longer there.

**Upgrading from 0.1.56 or earlier (breaking).** Earlier versions stored every page field as a
column of the page table. After the upgrade, `drizzle-kit generate` (run by the dev server) writes
one migration that creates `<entry>_fields` and `<entry>_media` and then drops every page column
that is not listed in `columns`. The data is not copied for you: before deploying, edit that
migration and put the copy between the `CREATE TABLE` statements and the first `DROP COLUMN`,
each statement followed by `--> statement-breakpoint`. For example on SQLite, libSQL and D1:

```sql
INSERT INTO pages_fields (page_id, key, position, value)
SELECT id, 'title', 0, title FROM pages WHERE title IS NOT NULL;
--> statement-breakpoint
INSERT INTO pages_media (page_id, key, position, media_key)
SELECT id, 'cover', 0, cover FROM pages WHERE cover IS NOT NULL;
--> statement-breakpoint
INSERT INTO pages_fields (page_id, key, position, value)
SELECT pages.id, 'gallery._type', block.key, json_extract(block.value, '$.type')
FROM pages, json_each(pages.gallery) AS block WHERE pages.gallery IS NOT NULL;
```

Write one statement per moved field. Column values copy as they are: plain strings, the JSON text of
a translatable field and media keys are already in the stored format; a boolean column becomes
`'true'` or `'false'` and a number its text. For a `blocks` field write one statement per subfield
as well, reading it with `json_extract(block.value, '$.<subfield>')` and skipping `NULL`s
(`json_type(block.value, '$.<subfield>')` tells `'null'`, `'true'` and `'false'` apart, and a
translatable subfield comes out as its JSON text); media subfields go to `<entry>_media`. On
Postgres use `jsonb_array_elements ... WITH ORDINALITY` (position is the ordinality minus one). Compare
the GraphQL output of every page before and after the migration.

## Content

A `content` entry is a content type such as news or a blog: each item has a fixed set of system
fields plus a body made of [blocks](#blocks). Declare one entry per content type, so two types can
use different blocks and different extra fields.

```ts
import { defineCmsBlocks, defineCmsConfig } from '#nuxt-cms'

const sections = defineCmsBlocks({
   text: {
      label: 'Text',
      component: 'SectionText',
      icon: 'bars-3-bottom-left',
      description: 'A heading and a paragraph.',
      fields: {
         heading: { label: 'Heading', type: 'text', translatable: true },
         body: { label: 'Body', type: 'richtext', translatable: true, required: true },
      },
   },
   image: {
      label: 'Image',
      component: 'SectionImage',
      fields: { image: { label: 'Image', type: 'media', mediaType: 'image', required: true } },
   },
})

export default defineCmsConfig({
   news: {
      id: 'news',
      label: 'News',
      kind: 'content',
      icon: 'newspaper',
      blocks: sections,
      fields: {
         category: { label: 'Category', type: 'relation', to: 'categories' },
      },
      labels: { excerpt: 'Summary' },
   },
})
```

- `blocks` (required) is the set of blocks of the body. `defineCmsBlocks()` returns it unchanged
  with its literal types, so several entries can share one set.
- `fields` (optional) adds extra fields to every item, with the same options as a collection.
- `labels` (optional) renames system fields in the admin, keyed by system field name.
- `tabs`, `layout` and `list` work as on a collection. The default list columns are title, status
  and publish date. In the visual editor, `layout` arranges the Content tab.
- `preview` (optional) sets the component that wraps the body in the visual editor, see
  [Preview component](#preview-component).
- `route` (optional) is the public address of the items on the site, see [Routes](#routes).
- `titleField`, `drafts`, `columns`, `routes`, `include`, `exclude`, `overrides` and a custom
  `table` are config errors on a content entry.

System fields, injected for you (declaring one of them in `fields` is a config error):

| field            | type                                 | notes                                              |
| ---------------- | ------------------------------------ | -------------------------------------------------- |
| `title`          | `text`, translatable, required       | the title of the item                              |
| `slug`           | `slug`, unique, required             | generated from the title in the default locale     |
| `publishedAt`    | `datetime`                           | ISO 8601 UTC; set to now when published empty      |
| `excerpt`        | `text` textarea, translatable        |                                                    |
| `cover`          | `media` image                        |                                                    |
| `body`           | `blocks` built from `blocks`         |                                                    |
| `seoTitle`       | `text`, translatable                 |                                                    |
| `seoDescription` | `text` textarea, translatable        |                                                    |
| `seoImage`       | `media` image                        |                                                    |
| `seoNoindex`     | `boolean`                            | hides the item from search engines and the sitemap |

The text system fields are translatable when `cms.i18n.locales` is set, plain text otherwise. The
SEO fields feed [`useCmsSeo`](seo.md#usecmsseo) and the [sitemap](seo.md#sitemapxml).

Every item has a draft or published `status` and `createdAt`/`updatedAt`. **The public API returns
an item only when it is published and its `publishedAt` is not in the future**: a published item
with a future date is scheduled, and it shows up on its own once that moment has passed. The rule
applies to the list, the count, the queries by id and by slug, and to every relation that points
at a content entry. Content entries can be the target of a relation (`to: 'news'`).

Content items are stored in a regular table named after the entry, so they follow the same
migrations as collections.

Items are edited in the [visual editor](admin.md#visual-editor): the body is drawn by the block
components of the site, with live updates, drag and drop and a palette of the blocks.

### Routes

`route` tells the CMS where the site shows the items of a content entry, so it can give each item
its public path. It is a path pattern, the full path the site serves:

```ts
news: { id: 'news', kind: 'content', blocks: sections, route: '/news/[slug]' }
```

Placeholders fill a whole segment: `[slug]`, `[id]`, and `[year]`, `[month]`, `[day]` (from
`publishedAt`, in UTC, `2026`, `04`, `01`). A pattern needs `[slug]` or `[id]`. With
`cms.i18n.locales`, a single pattern is the path in every locale; a map gives each locale its own
full path, prefix included, and must name every locale:

```ts
blog: {
   id: 'blog',
   kind: 'content',
   blocks: sections,
   route: { en: '/blog/[slug]', it: '/it/blog/[slug]' },
}
```

The CMS does not add a locale prefix by itself: write the paths your router serves (with
`@nuxtjs/i18n` and the `prefix_except_default` strategy, the map above). The slug is shared by
every locale.

With a route, the items get `path` (in the requested locale) and `paths` (one `{ locale, path }`
per locale) in GraphQL and in `#cms-types`, the entry gets a `<entry>ByPath(path, locale)` query,
and `useCmsRoute(path)` finds the item a site path shows, see
[Routes in querying](querying.md#content-routes). The visual editor shows the address of the item
in its Content tab, with an Open link once the item is live. `path` and `paths` are reserved field
names on a routed entry.

The build fails when a pattern does not start with `/`, has an empty segment or a trailing slash,
holds `?`, `#`, spaces or an unknown placeholder, puts a placeholder inside a segment
(`[slug].html`), repeats a placeholder, has neither `[slug]` nor `[id]`, or lives under `/cms`; when
a map is used without `cms.i18n.locales`, names an unknown locale or misses one; when `route` is set
on an entry that is not `kind: 'content'`; and when two entries have patterns that match the same
paths (`/news/[slug]` and `/news/[id]`).

### Preview component

By default the visual editor shows only the blocks of the body. To show the whole article as the
site does, name a site component that takes the item and renders the body in its default slot:

```ts
news: {
   id: 'news',
   kind: 'content',
   blocks: sections,
   preview: { component: 'NewsArticle' },
   ...
}
```

```vue
<template>
   <article>
      <h1>{{ item.title }}</h1>
      <p v-if="item.excerpt">{{ item.excerpt }}</p>
      <slot />
   </article>
</template>

<script setup lang="ts">
import type { News } from '#cms-types'

defineProps<{ item: Pick<News, 'title' | 'excerpt' | 'cover'>; locale?: string }>()
</script>
```

The component receives `item` (every public field of the item in the active language, media as
`CmsMedia` objects, relations as ids, values not saved yet included, and `path` when the entry has
a [route](#routes)) and `locale`. Use the same
component on the site page, with `<CmsBlocks>` in the slot, and the preview matches the page.
Mark the item fields it shows (`<CmsField name="title" as="h1">`, see
[Marking fields](querying.md#marking-fields)) to open them from the canvas.
`cms.preview.component` in `nuxt.config` sets a default for every content entry. A `preview` option
on an entry that is not `kind: 'content'` is a config error.

## Field types

Every field has `label: string` and optional `required?: boolean` and `private?: boolean` (see
[Private fields](#private-fields)), plus the [field options](#field-options) `default`, `unique`,
`immutable`, `min` and `max` where they apply. Type-specific options:

| type       | extra options                                                                      | stored / queried as |
| ---------- | ---------------------------------------------------------------------------------- | ------------------- |
| `text`     | `textarea?: boolean`, `translatable?: boolean`, `min?` / `max?` (characters)        | String              |
| `richtext` | `translatable?: boolean`                                                            | String (HTML)       |
| `number`   | `integer?: boolean`, `min?` / `max?` (value)                                        | Float / Int         |
| `boolean`  | none                                                                               | Boolean             |
| `date`     | none                                                                               | String `yyyy-mm-dd` |
| `datetime` | none                                                                                | String, ISO 8601 UTC |
| `email`    | none                                                                               | String              |
| `slug`     | `from: '<fieldKey>'` (required; auto-generated from that text field, from its default-locale value when translatable) | String (unique)     |
| `select`   | `options: (string \| { value, label })[]` (required, unique values), `multiple?: boolean` | String (enum) or `[String!]!` |
| `tags`     | `max?: number`, `suggestions?: boolean` (default `true`); see [Tags fields](#tags-fields) | `[String!]!`        |
| `json`     | none                                                                               | JSON                |
| `media`    | `mediaType?: T \| T[]` where `T` is `'image' \| 'video' \| 'file'`, `accept?: string[]`, `translatable?: boolean`, `mobile?: boolean` | CmsMedia object     |
| `relation` | see [Relations](#relations)                                                         | related entry / list |
| `link`     | `to?: string[]`, `external?: boolean` (default `true`), `withLabel?: boolean`, `translatable?: boolean`; see [Links](#links) | CmsLink object      |
| `blocks`   | `blocks: Record<name, { label, fields, validate? }>` (required), `min?: number`, `max?: number` | array of typed blocks |

A `datetime` field stores an instant as an ISO 8601 string in UTC (`2026-05-01T08:30:00.000Z`). The
API accepts any ISO 8601 date and time with a time zone (`Z` or `+02:00`) and stores it in UTC; a
value without a time zone is rejected. The admin shows a date and time picker in the browser's time
zone. It filters and sorts as a `StringFilter`, and the fixed format keeps the string order equal to
the time order.

## Field options

```ts
code:  { label: 'Code', type: 'text', unique: true, immutable: true, min: 3, max: 12 },
seats: { label: 'Seats', type: 'number', integer: true, min: 1, max: 500, default: 24 },
date:  { label: 'Date', type: 'date', default: 'today' },
level: { label: 'Level', type: 'select', options: ['basic', 'pro'], default: 'basic' },
```

**`default`** is the initial value of a new item: the create form, the first save of a single, an
API create that leaves the key out, and an import row that creates an entry without that column
(an explicit `null` stays `null`). Duplicate keeps the copied value instead.

| type | `default` |
| ---- | --------- |
| `text`, `richtext` | a string; on a translatable field it fills the default locale only |
| `number` | a number (an integer with `integer`, inside `min` / `max`) |
| `boolean` | `true` or `false` |
| `date` | `yyyy-mm-dd`, or `'today'` (the browser's date in the admin, the UTC date on the server) |
| `datetime` | an ISO 8601 date and time with a time zone, or `'now'` |
| `email` | a valid email |
| `select` | one of the option values; a list of option values with `multiple` |
| `tags` | a list of non-empty strings, at most `max` after deduplication |

**`unique: true`** on `text`, `email` and `number` adds a unique index to the column (the
generated migration holds it: an existing duplicate makes the migration fail, so clean the data
first). Values match exactly, case included. A blank value is stored as `null`, and any number of
items may be empty. The admin API checks the value before it writes and answers `409` with the
issue on the field (`ValidationMessages.unique`, "This value is already used by another entry"),
which the admin form shows under the field. Duplicate clears a unique field and the import reports a
value already taken by another row or entry. Not supported on translatable fields (no per-locale
uniqueness), inside `blocks`, on pages (their values are rows) and on singles. A `slug` is always
unique and does not take the option.

**`immutable: true`** makes a value fixed once it is saved: the admin shows the field disabled when
it edits an item that holds a value, and the admin API refuses a different value with `400`
(`ValidationMessages.immutable`, "This value cannot be changed once saved"), the import too. An item
saved with the field empty can fill it once, so a field added to existing items, or left blank on
create, is not stuck empty. Supported on `text`, `number`, `boolean`, `date`, `datetime`, `email`,
`slug`, `select` and `relation` (not many-to-many), not on translatable fields, inside `blocks` or on
pages. Like every admin rule, it does not protect the database from direct writes.

**`min` / `max`** use one vocabulary for every type and measure what the field holds: the value of
a `number`, the length in characters of a `text` (every locale of a translatable text), the number
of blocks of a [`blocks`](#number-of-blocks) field and the number of tags of a
[`tags`](#tags-fields) field (`max` only). An empty value skips them (add `required`). They are
checked by the admin form and the admin API (`ValidationMessages.minValue` / `maxValue`, "Must be at
least 1", and `minLength` / `maxLength`, "Use at most 12 characters"); the number input also stops
at the bounds. With [`showIf`](#conditional-fields) they apply only while the field is visible.
`minLength` and `maxLength` are not options: the build tells you to use `min` and `max`. Number
bounds are any numbers with `min <= max`; text bounds are integers (`min >= 0`, `max >= 1`).
They work on block fields too and never change the column.

## Select option labels

An option of a `select` field is a string, or an object with the stored `value` and the `label`
shown in the admin. The two forms can be mixed:

```ts
visibility: {
   label: 'Visibility',
   type: 'select',
   options: [
      'public',
      { value: 'members', label: 'Club members' },
      { value: 'hidden', label: 'Hidden from the site' },
   ],
}
```

- **The value is what is stored and served.** The database column, the GraphQL field, the
  filters, the generated `#cms-types` union and the validation all use `value`. Changing a label
  needs no migration; changing a value does.
- **The admin shows the label**: in the select input, in the table cells, in the title of an entry
  whose `titleField` is the select, in relation pickers and relation columns, and in the search
  results. The admin search also finds a select by the label of its value.
- `showIf` refers to values: `showIf: { field: 'visibility', eq: 'members' }`.
- Values must be unique non-empty strings and every label a non-empty string, or the build fails.
- `CmsSelectValue<typeof field>` from `#nuxt-cms` gives the union of the values of a field declared
  `as const` (or with `options: [...] as const`).

## Multi-select fields

`select` fields support a `multiple: true` option to allow selecting multiple options:

```ts
tags: {
   label: 'Tags',
   type: 'select',
   options: ['featured', 'news', 'tutorial', 'guide'],
   multiple: true,
   required: true,  // when true, at least one option must be selected
}
```

Multi-select fields are stored as JSON arrays and queried as `[String!]!` in GraphQL. They filter
with a [`StringListFilter`](querying.md#list-filters) (`hasAny`, `hasAll`, `isEmpty`), are **excluded
from sorting** and are **not allowed inside blocks**.

When `required: true`, the field must have at least one item (an empty array is invalid).

## Tags fields

A `tags` field is a free list of strings, for values that are not known in advance (spots, rivers,
keywords):

```ts
spots: { label: 'Spot', type: 'tags' },
languages: { label: 'Languages', type: 'tags', required: true, max: 5, suggestions: false },
```

- Stored as a JSON array of strings (the same column as a multi-select: `text` in JSON mode on
  SQLite, libSQL and D1, `jsonb` on Postgres), queried as `[String!]!` and typed `string[]` in
  `#cms-types`. An empty field is `[]`.
- Every value is trimmed, empty values are dropped and duplicates are ignored case-insensitively
  (the first spelling wins), by the admin input and again by the validation of the admin API and
  the import.
- `max` caps the number of tags (an integer of 1 or more, checked after deduplication, message
  `ValidationMessages.maxTags`, "Add at most 5 tags"); with `showIf` it applies only while the field
  is visible. `required: true` asks for at least one tag. `min` is not supported.
- `suggestions` (default `true`) makes the admin input suggest the values already used in the same
  field across the entry, read by `GET /api/cms/tags/<entry>/<field>` (admin session). Set it to
  `false` for values that should not leak from one entry to another.
- In the admin: type a value and press Enter or comma to add a chip, Backspace on an empty input
  removes the last chip, the x on a chip removes it.
- Filters with a [`StringListFilter`](querying.md#list-filters) (`hasAny`, `hasAll`, `isEmpty`;
  exact, case-sensitive match), never sorts.
- Not allowed inside `blocks` (like multi-select), not translatable, and it cannot be a
  `titleField`. A `showIf` can test it with `empty` or `has` only.

## Relations

```ts
category: {
   label: 'Category',
   type: 'relation',
   to: 'categories',              // required: target entry key (must be a collection)
   cardinality: 'many-to-one',    // 'many-to-one' (default) | 'one-to-one' | 'many-to-many'
   onDelete: 'set null',          // 'set null' | 'cascade' | 'restrict'
}
```

- The target `to` must be a **collection** or a [**content**](#content) entry.
- `many-to-one` / `one-to-one` store a foreign key on the entry; `many-to-many` uses a generated
  join table (`<entry>_<field>`).
- A `required` relation cannot use `onDelete: 'set null'`.
- Custom-table entries cannot be the source of `many-to-many` relations.

## Links

A `link` field points either at an address or at a page or content item of the site. Menus and
calls to action are the main use, so it is allowed inside `blocks` too.

```ts
cta: { label: 'Button', type: 'link', withLabel: true, translatable: true },
privacy: { label: 'Privacy page', type: 'link', to: ['pages'], external: false },
```

- **Value**, stored as JSON: `{ url }` for an address, or `{ entry, id }` for an internal target,
  plus an optional `label` and `newTab: true`. Internal targets are the rows of the page entry (`id`
  is the page key, `about` for `/about`) and the items of [content entries with a
  `route`](#routes). Links store ids, so a slug change or a moved item never breaks them.
- **Options**: `to` lists the entries an internal link may target (default: the page entry and
  every routed content entry; each must be one of those); `external: false` refuses addresses;
  `withLabel: true` asks for a link text; `translatable: true` (needs `withLabel` and
  `cms.i18n.locales`) keeps the link text per locale while the target stays the same.
- **Addresses** must be `http(s)://` URLs, `mailto:`, `tel:`, a root-relative path (`/contact`) or
  an anchor (`#team`). `javascript:`, `data:`, other schemes, protocol-relative `//host` URLs,
  spaces and control characters are refused by the admin form and the admin API.
- **Queried** as [`CmsLink`](querying.md#links), whose `href` is resolved for the requested locale
  and is `null` when the target is missing, a draft or scheduled.
- **Admin**: an Internal / External switch, a search across the allowed entries (title and path,
  drafts and scheduled items marked), the URL input, the link text and an "Open in a new tab"
  switch. A warning shows when the target is a draft, scheduled or deleted. The search only covers
  the entries the role can read. Deleting a content item that is linked somewhere lists those
  entries first (`POST /api/cms/link-usage`, admin session, only the entries the role can read);
  after the delete the links stay stored and their `href` is `null`.
- With `translatable`, the link text counts in the [translation progress](admin.md#translations)
  like a translatable text, and the copy and clear actions of the form include it.
- The admin search finds link texts (in every locale) and addresses. CSV import and export use JSON
  text; a plain address in a CSV cell is read as `{ url }`. Duplicate copies the value.
- `required` asks for a target (a link text alone is not enough) and `showIf` works on the link
  itself. Other fields can test a link with [`empty`](#conditional-fields) only: a link is empty
  without an address or a target, whatever its text. `default`, `unique`, `immutable`, `min` and
  `max` are refused on links at build time.
- Not a `titleField`, not filterable or sortable.

## Blocks

A `blocks` field is an ordered list of typed content blocks, for page builders.

```ts
body: {
   label: 'Body',
   type: 'blocks',
   blocks: {
      hero: { label: 'Hero', fields: {
         heading: { label: 'Heading', type: 'text', required: true },
         image: { label: 'Image', type: 'media', mediaType: 'image' },
      } },
      quote: { label: 'Quote', fields: {
         text: { label: 'Text', type: 'text', textarea: true },
      } },
   },
}
```

### Number of blocks

`min` and `max` limit how many blocks a `blocks` field holds:

```ts
gallery: { label: 'Gallery', type: 'blocks', min: 2, max: 8, blocks: { ... } }
```

- `max` is always enforced. In the admin the add button, the duplicate action and the `+` of the
  visual editor are disabled once the field is full.
- `min` is enforced as soon as the field has a block. An empty field stays valid unless it is
  `required`, so `required: true, min: 2` asks for at least two blocks.
- Both are checked by the admin form and by the admin API (400), with the `minBlocks` and
  `maxBlocks` messages of `ValidationMessages` ("Add at least 2 blocks", "Add at most 8 blocks").
  On a field with `showIf` they apply only while the field is visible.
- `min` is an integer of 0 or more, `max` an integer of 1 or more, and `min` cannot exceed `max`.
  The schema, the column and the query shape do not change. On `number` and `text` fields the same
  options bound the value and the length (see [Field options](#field-options)).

Block fields accept every field type **except** `slug`, `relation`, `blocks`, `tags` and
multi-select (`select` with `multiple: true`). A block field can take a `showIf` that tests the other fields of
the same block item (see [Conditional fields](#conditional-fields)). They can be `translatable` (see below) but not `private`: mark the
whole `blocks` field private instead.
`required` inside a block is an admin and save-time rule: the API and the generated types always
return block fields as nullable, since stored items can predate a field or its `required` flag.
See [Querying → Blocks](querying.md#blocks) for how to read them.

Every block item can carry `hidden: true`, set from the block editor with **Hide**. When the block
does not declare a field named `hidden`, hidden items are dropped from the public API. A block that
declares its own `hidden` field keeps the old behavior: the value is returned and the site decides.

### Block components

A block can name the site component that renders it, plus an icon, a help text, a group and search
tags for the admin:

```ts
blocks: {
   hero: {
      label: 'Hero',
      component: 'SectionHero',
      icon: 'photo',
      description: 'Full-width image with a heading.',
      group: 'Headers',
      tags: ['banner', 'cover'],
      fields: { ... },
   },
}
```

- `component` is the name of a component of the site as Nuxt auto-imports it (`SectionHero`, or
  `section-hero`). The build fails when no such component is registered.
- `icon` is a Heroicons outline name; `description` is a short help text.
- `group` puts the block under a heading in the [block picker](admin.md#block-picker). Groups follow
  the order of their first block in the config; blocks without a group come last, under **Other**.
- `tags` are extra words the search of the picker matches, next to the label, the description and
  the group.
- These keys work in every `blocks` field: collections, singles, pages and content.
- A block with a `component` cannot have fields named `key`, `ref`, `class` or `style`.
- When every block of a field has a `component`, the admin edits that field in the
  [visual editor](admin.md#visual-editor) as well; other `blocks` fields keep the tile grid.

Render a blocks value with [`<CmsBlocks>`](querying.md#rendering-blocks). Each component receives
the fields of its block as props; mark the element of each field with `<CmsField>` or
`v-cms-field` ([Marking fields](querying.md#marking-fields)) so the visual editor can open it from
the canvas. Type the props with the generated interface `<Entry><Field><Block>Props` from
`#cms-types`:

```vue
<script setup lang="ts">
import type { NewsBodyHeroProps } from '#cms-types'

defineProps<NewsBodyHeroProps>()
</script>
```

The same type is reachable as `CmsBlockProps<'news', 'body', 'hero'>`, for use outside
`defineProps` (Vue cannot resolve a generic indexed type in `defineProps`, so use the named
interface there).

### Translatable block fields

`text`, `richtext` and `media` fields **inside** a block accept `translatable: true`, with the same
semantics as at the top level:

```ts
answers: {
   label: 'Answers', type: 'blocks',
   blocks: {
      answer: { label: 'Answer', fields: {
         text: { label: 'Text', type: 'text', required: true, translatable: true },
         correct: { label: 'Correct', type: 'boolean' },
      } },
   },
}
```

The per-locale values live inside the block's JSON, so the column shape does not change and **adding
`translatable: true` to an existing block field needs no migration**: blocks that still hold a plain
value keep working and are read as the default locale's value. The query shape does not change
either: the field still resolves to a single `String` (or `CmsMedia`) for the requested `locale`.

In the admin panel the locale switcher appears next to the `blocks` field label and applies to every
translatable sub-field of every block at once, so a whole list can be translated in one pass.

## Tabs

An entry with many fields can split its admin form into horizontal tabs. Declare `tabs` on the
entry, then send each field to one with `tab`.

```ts
pages: {
   id: 'pages',
   label: 'Pages',
   kind: 'page',
   tabs: [
      { id: 'texts', label: 'Texts' },
      { id: 'images', label: 'Images' },
      { id: 'seo', label: 'SEO' },
   ],
   fields: {
      title: { label: 'Title', type: 'text' },
      hero: { label: 'Hero', type: 'media', tab: 'images' },
      seoTitle: { label: 'SEO title', type: 'text', tab: 'seo' },
   },
}
```

- **Only the admin editor is affected.** The database, the GraphQL schema and the query shape are
  unchanged.
- A field with no `tab`, like `title` above, goes to the **first** tab.
- An entry with no `tabs`, or with one tab, renders as a single form with no tab strip.
- A field that points at a tab the entry does not declare fails the build, and so does a duplicate
  tab id or a tab with no label.
- On a page entry, a field added by `overrides` takes `tab` the same way.
- `tab` is not supported inside `blocks`: a block's own fields always render together.
- When a save fails validation, the form opens the tab that holds the first invalid field, so the
  error is never hidden behind another tab.

## Form layout

By default the admin form shows one field per row, in the order of `fields`. Use `layout` on an
entry to change that. It is admin-only: the database, the GraphQL schema and the query shape do not
change.

```ts
events: {
   id: 'events',
   label: 'Events',
   kind: 'collection',
   titleField: 'title',
   icon: 'calendar-days',
   fields: { /* ... */ },
   layout: [
      ['title', 'slug'],
      'description',
      ['seats', 'price', 'date'],
      ['category', 'featured'],
      {
         title: 'Advanced',
         description: 'Data for integrations.',
         collapsed: true,
         rows: ['metadata', 'internalNotes'],
      },
   ],
   list: {
      columns: ['title', 'date', 'category', 'status'],
      filters: ['category', 'featured', 'status'],
   },
}
```

- A string is a row with one field. An array is a row with up to 4 fields side by side. On a narrow
  screen the fields of a row stack.
- An object with `title` and `rows` is a section: a titled card. `description` shows under the
  title, and `collapsed: true` closes it by default.
- Fields that the layout does not name go at the end of the form, each in its own row. The mobile
  field of a `mobile: true` media field goes next to its parent, or on the next row when the row is
  full.
- Tabs still apply: the form shows the fields of the active tab.
- A key that is not a field, a key named twice, a row with more than 4 fields or a section with no
  title fails the build. On a page entry, the layout can name fields from `overrides`.

Other admin-only options:

| Option | On | Effect |
| --- | --- | --- |
| `icon` | entry | The icon in the sidebar and the page header. A Heroicons outline name, for example `calendar-days`. |
| `list.columns` | collection | The default table columns, in order. `status` is available on collections with `drafts`. Without it, the table shows the first 4 fields. |
| `list.filters` | collection | The [filter buttons](admin.md#filters) of the list, in order: single `select`, `boolean`, `many-to-one` or `one-to-one` `relation` fields, and `status` with `drafts`. Without it, the list offers every one of those fields that is a visible column; `[]` turns the filters off. |
| `description` | field | A help text under the input. |
| `placeholder` | field | The placeholder of text, textarea, email, number and select inputs. |

Admins can change the table columns and the form layout in **Settings** (see
[Admin panel](admin.md#settings)). The config is the default, and **Reset to default** goes back
to it.

### Block layout

A block takes `layout` too, in the same format, to arrange its form in the tile grid modal and in
the inspector of the visual editor:

```ts
blocks: {
   session: {
      label: 'Session',
      fields: { title, day, startsAt, minutes, fee, indoor, level, host, notes, handout, extra },
      layout: [
         'title',
         ['day', 'startsAt', 'minutes'],
         ['fee', 'level', 'indoor'],
         'notes',
         { title: 'Extras', collapsed: true, rows: [['host', 'handout'], 'extra'] },
      ],
   },
}
```

The rules are the ones above, checked against the fields of the block: unknown or repeated keys,
rows over 4 fields and untitled sections fail the build, and unnamed fields go at the end. The
fields of a row stay side by side only where the form is wide enough (32rem), so in a narrow
inspector they stack. Block layouts come from the config only: Settings does not override them.

## Conditional fields

`showIf` hides a field in the admin editor until a condition on the other fields of the same entry
holds. This is useful when one `select` decides which of the remaining fields are meaningful.

```ts
type: { label: 'Type', type: 'select', options: ['text', 'image'], required: true },
body:  { label: 'Body',  type: 'richtext', showIf: { field: 'type', eq: 'text' } },
photo: { label: 'Photo', type: 'media', showIf: { field: 'type', eq: 'image' } },
alt:   { label: 'Alt text', type: 'text', showIf: { field: 'photo', empty: false } },
```

A condition is `{ field, <operator>: value }`. Several operators in one condition must all hold
(`{ field: 'seats', gte: 10, lt: 100 }`).

| operator | holds when the value of `field` | target field types |
| -------- | ------------------------------- | ------------------ |
| `eq` / `neq` | equals / differs from the value | `select`, `boolean`, `text`, `number`, `date`, `datetime`, `email`, `slug` |
| `in` / `notIn` | is / is not one of a non-empty list | same as `eq` |
| `gt` / `gte` / `lt` / `lte` | is greater / greater or equal / lower / lower or equal | `number` (a number), `date` (`yyyy-mm-dd`), `datetime` (ISO 8601 with a time zone, compared as instants) |
| `empty: true \| false` | is / is not empty | every type except `boolean` |
| `has` | is a list that contains the value | `tags` (case-insensitive), multi-select, many-to-many `relation` (a related id) |

Combine conditions with `{ all: [...] }`, `{ any: [...] }` and `{ not: condition }`, nested as
deep as you need. An array at the top is the same as `all`:

```ts
sponsor: {
   label: 'Sponsor',
   type: 'text',
   showIf: [
      { field: 'featured', eq: true },
      { any: [{ field: 'visibility', neq: 'hidden' }, { not: { field: 'keywords', empty: true } }] },
   ],
},
```

- **Only the admin editor is affected.** The GraphQL schema, the database column and the query shape
  are unchanged: a condition cannot make a column conditional.
- A hidden field **keeps the value it already has**; it is not cleared on save, so toggling the
  controlling field back and forth does not lose work.
- On a conditional field, `required` means **"required while visible"**, and `min` / `max` also
  apply only while the field is visible. The same rule runs in the admin form and in the
  validation of the admin API and of the import (one shared evaluator), never in the database: the
  column stays nullable and the GraphQL field stays optional, because two fields belonging to
  opposite branches can never both be filled, and a `NOT NULL` on either would make every entry
  unsavable. Treat a conditional field as optional when you read it.
- A missing value never matches `eq`, `in`, `has` or the comparisons, and always matches `neq` and
  `notIn`. Empty means `null`, a blank string, an empty list, a translatable value with no locale
  filled, a `json` value of `{}` or `[]`, or a `link` with no address and no target; `0` and
  `false` are not empty.
- A translatable field can only be tested with `empty`. Every other operator is checked against the
  target type at build time: the value type (a boolean for a `boolean` field, a number for a
  `number` field, a valid date for `date` and `datetime`), select values against the `options` (so a
  typo fails the build instead of silently hiding the field forever), non-empty lists, unknown keys
  and groups with anything next to `all` / `any` / `not`.
- Inside `blocks`, `showIf` on a block field tests the **sibling fields of the same block item**:
  `{ field: 'layout', eq: 'image' }` reads the `layout` of that block. It cannot reach the fields of
  the entry. The block editor, the visual editor and the block validation follow it.
- The `titleField` cannot be conditional.

## Validation hooks

`validate` on a collection, single, page or content entry adds your own rules to the entry form.
It receives the values of the entry and returns a list of issues:

```ts
import type { CmsValidationIssue } from '#nuxt-cms'
import { defaultLocaleValue, defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   events: {
      id: 'events',
      label: 'Events',
      kind: 'collection',
      titleField: 'title',
      fields: { /* ... */ },
      validate: (values, { defaultLocale }) => {
         const issues: CmsValidationIssue[] = []
         if (typeof values.price === 'number' && values.price < 0)
            issues.push({ field: 'price', message: 'The price cannot be negative' })
         if (!defaultLocaleValue(values.description, defaultLocale))
            issues.push({ message: 'The event has no description yet', level: 'warning' })
         return issues
      },
   },
})
```

An issue is `{ field?, message, level? }`:

- `level: 'error'` (the default) blocks the save. With `field` the message shows under that field
  (and the form opens its tab); without it, at the top of the form.
- `level: 'warning'` never blocks the save. The admin shows it under the field, or at the top of
  the form, while you edit.

The second argument is `{ locales, defaultLocale, path? }`: `path` is the path of the page being
saved on a `page` entry. A translatable value is a `{ locale: text }` map, and
`defaultLocaleValue(value, defaultLocale)` from `#nuxt-cms` reads its text in the default locale (a
plain string, from a field that is not translatable, is returned as it is).

A block can have its own `validate`, with the values of one block item and `{ ..., index }`. Its
`field` names a field of the block, and the message shows on the `blocks` field (in the visual
editor, on the field of the selected block):

```ts
blocks: {
   session: {
      label: 'Session',
      fields: { minutes: { label: 'Minutes', type: 'number' } },
      validate: (values) =>
         typeof values.minutes === 'number' && values.minutes <= 0
            ? [{ field: 'minutes', message: 'A session lasts at least one minute' }]
            : [],
   },
}
```

**Where it runs.** `cms.config.ts` is not serialized: the module imports the module itself, through
the `#cms-config` alias, in the admin client and in the Nitro server. So the same function checks
the form before the request and the admin API (`POST` and `PUT` of an entry, a single, a page or a
content item) checks the body again and answers `400` on an error issue. Warnings are admin-only.
The hook therefore runs in the browser too, which sets three rules:

- It must be synchronous and pure: no database, no `fetch`, no server-only import in
  `cms.config.ts`.
- It runs after the field types are checked, on the parsed values (`null` for an empty field, ISO
  dates in UTC), and also while other fields are still invalid (a required field left empty is
  `null`). Guard every value you read.
- It sees the whole entry, hidden conditional fields included.

## Private fields

`private: true` keeps a field out of the **public GraphQL API**. The column is still created, the
field is still editable in the admin panel and its value is still stored. It is simply never
published: it is absent from the entry type, from the filters input and from the sort enum, so it
cannot be selected, filtered or sorted on, and introspection does not reveal it. It is also omitted
from the generated `#cms-types` interfaces, which describe the API shape.

```ts
file: { label: 'File', type: 'media', mediaType: 'file', private: true }
```

Use it for values that only server-side code should see, for example a media key that must be served
through your own authenticated route instead of the public bucket URL. Read those values from the
database directly (`#cms-db` + `#cms-tables`) in a server handler that enforces your own rules:

```ts
import { useDb } from '#cms-db'
import { magazine } from '#cms-tables'
import { eq } from 'drizzle-orm'

const [row] = await useDb().select().from(magazine).where(eq(magazine.id, id)).limit(1)
```

Note that a private field holds its **raw column value** (a media field holds the object key string,
a translatable media field a JSON map of locale → key), not the resolved GraphQL shape.

`private` is not supported inside `blocks`: mark the whole `blocks` field private instead.

## Translatable fields

`translatable: true` is supported on `text`, `richtext` and `media`, as top-level fields and
[inside blocks](#translatable-block-fields). It requires `cms.i18n.locales` to be configured. Values are stored per locale and resolved to a single value at query time via the
`locale` argument (falling back to `defaultLocale` when a translation is missing). Translatable
fields are **excluded from filtering and sorting**. A `slug` field can take its `from` from a
translatable `text` field: the admin generates it from the value in `defaultLocale`, and the slug
itself is a single value shared by every locale.

```ts
i18n: { locales: ['en', 'it'], defaultLocale: 'en' } // in nuxt.config.ts

description: { label: 'Description', type: 'richtext', translatable: true } // in cms.config.ts
```

### Translatable media

A translatable `media` field holds a different file per locale: an Italian and a German PDF of the
same document, a screenshot per language, and so on. The admin panel shows the usual media picker
with the locale switcher above it, one file per locale.

```ts
brochure: { label: 'Brochure', type: 'media', mediaType: 'file', translatable: true }
```

The query shape does not change; it still resolves to a single `CmsMedia`:

```graphql
brochure { url alt }
```

Resolution picks the requested `locale`, then `defaultLocale`, then any locale that has a file.
The column stays a plain `text` column holding a JSON map of locale → object key, so adding
`translatable: true` to an **existing** media field needs no migration: rows that still hold a plain
key keep working and are read as the default locale's value.

### Mobile media

`mobile: true` on a top-level `media` field adds a second, optional media field for small screens.
The CMS names it `<field>Mobile` and puts it right after the main field in the admin, with the label
`<label> (mobile)` and the same `mediaType`, `accept`, `tab` and `translatable` options.

```ts
hero: { label: 'Hero', type: 'media', mediaType: ['image', 'video'], mobile: true }
```

```graphql
hero { url type }
heroMobile { url type }
```

The module only stores and serves the two files. The frontend decides the breakpoint and falls back
to the main media when `heroMobile` is empty. The mobile field is a normal media field, so it is a
new column on collections and singles (generate a migration) and a new row key on pages. A declared
field with the same `<field>Mobile` key is a config error, and `mobile` is not supported inside
`blocks`.

## Full example

```ts
import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   categories: {
      id: 'categories', label: 'Categories', kind: 'collection', titleField: 'name',
      fields: { name: { label: 'Name', type: 'text', required: true } },
   },
   tags: {
      id: 'tags', label: 'Tags', kind: 'collection', titleField: 'name',
      fields: { name: { label: 'Name', type: 'text', required: true } },
   },
   events: {
      id: 'events', label: 'Events', kind: 'collection', titleField: 'title', drafts: true,
      fields: {
         title: { label: 'Title', type: 'text', required: true },
         slug: { label: 'Slug', type: 'slug', from: 'title', required: true },
         description: { label: 'Description', type: 'richtext', translatable: true },
         seats: { label: 'Seats', type: 'number', integer: true },
         date: { label: 'Date', type: 'date', required: true },
         visibility: { label: 'Visibility', type: 'select', options: ['public', 'hidden'] },
         topics: { label: 'Topics', type: 'select', options: ['tech', 'science', 'art'], multiple: true },
         keywords: { label: 'Keywords', type: 'tags', max: 10 },
         poster: { label: 'Poster', type: 'media', mediaType: ['image', 'video'] },
         category: { label: 'Category', type: 'relation', to: 'categories' },
         tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
         body: {
            label: 'Body', type: 'blocks',
            blocks: {
               hero: { label: 'Hero', fields: {
                  heading: { label: 'Heading', type: 'text', required: true },
                  image: { label: 'Image', type: 'media', mediaType: 'image' },
               } },
            },
         },
      },
   },
   homepage: {
      id: 'homepage', label: 'Homepage', kind: 'single',
      fields: { heroTitle: { label: 'Hero title', type: 'text', required: true, translatable: true } },
   },
})
```

## Validation rules (highlights)

- Entry keys and field keys must be valid identifiers. The reserved entry names are `admin`,
  `auth`, `login`, `logout`, `media`, `graphql`, `settings`, `cms_media`, `cms_settings` and
  `cms_users`. The automatic columns (`id`, `status`, `created_at`, `updated_at`) are reserved
  field names.
- `drafts` is only valid on collections; content entries always have drafts and do not take the
  option.
- A content entry needs a non-empty `blocks` map and cannot declare a system field, `titleField`,
  `columns`, `routes`, `overrides` or a custom table; `labels` may only name system fields.
- A block `component` must be a non-empty string naming a registered Nuxt component; `icon` and
  `group` must be non-empty strings; `tags` must be an array of non-empty strings; `layout`
  follows the [form layout](#form-layout) rules against the fields of the block.
- `titleField` is required on collections, must reference a declared field, and that field must be a
  `text`, `slug`, `email`, `number`, `date`, `datetime` or single `select`.
- `select` needs a non-empty array of `options`: non-empty strings or `{ value, label }` objects
  with a non-empty `value` and `label`, and no value repeated.
- `min` and `max` are valid on `blocks` fields (`min` an integer of 0 or more, `max` an integer of
  1 or more, `min` not greater than `max`), `number` fields (numbers, `min <= max`) and `text`
  fields (characters, same integer rules as blocks). A `tags` field takes `max` only (an integer of
  1 or more), and `suggestions` (a boolean) is only valid on `tags` fields. `minLength` and
  `maxLength` are refused.
- `default` must fit the field (see [Field options](#field-options)) and is not allowed on `slug`,
  `json`, `media`, `relation` and `blocks` fields, inside `blocks` or on pages. `unique` is only
  valid on `text`, `email` and `number` fields of collections and content entries, not translatable
  and not inside `blocks`. `immutable` is not allowed on `richtext`, `json`, `media`, `tags`,
  `blocks`, many-to-many and translatable fields, inside `blocks` or on pages.
- `validate` on an entry or a block must be a function.
- Multi-select (`select` with `multiple: true`) and `tags` are not allowed inside `blocks` and are excluded from sorting.
- `translatable` is only valid on `text`, `richtext`, `media` and `link` (with `withLabel`), at the top level or inside a block, and requires `cms.i18n.locales`. The `blocks` field itself cannot be translatable.
- `showIf` must reference another declared field (a sibling field inside `blocks`) with an operator that fits its type and a value of the right type (see [Conditional fields](#conditional-fields)); groups take only `all`, `any` or `not`; the `titleField` cannot be conditional.
- `tab` must name a tab declared by the same entry; tab ids must be unique and every tab needs a label.
- `slug.from` must point to a `text` field. When that field is translatable, the slug is generated
  from its value in the default locale (as the `slug` of a content entry is from the title).
- `private` is not allowed inside `blocks`.
- A relation `to` must reference an existing collection or content entry.
- A link `to` must be a list of distinct entries, each the page entry or a content entry with a
  `route`; `external` and `withLabel` are booleans valid only on links; a link with no allowed
  target (`external: false` and no internal entry) is refused.
- `list.filters` may only name single `select`, `boolean` and single `relation` fields, plus
  `status` on an entry with drafts.
- `columns` is only valid on the page entry and may only list fields that every page has;
  `relation` and `slug` fields of a page must be listed there, and pages cannot have many-to-many
  relations or a custom table.

After changing the schema, restart the dev server so migrations and types are regenerated.
