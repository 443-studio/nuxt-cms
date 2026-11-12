# Querying content

Content is read through a **public, read-only GraphQL API** at `POST /api/cms/graphql`.
Auto-imported composables wrap it.

```ts
// one entry, query and types generated from cms.config.ts: no query string to write
const { data } = await useCmsSingle('homepage', { locale })
const { data } = await useCmsCollection('events', { sort: [{ field: 'date' }], limit: 10 })
const { data } = await useCmsPage('/about', { locale })
const { data } = await useCmsContents('news', { limit: 10, locale })
const { data } = await useCmsContent('news', slug, { locale })

// reactive, SSR-friendly (wraps useAsyncData): use in components/pages
const { data, error, refresh } = useCms(`{ ... }`, variables?, options?)

// plain promise: use in event handlers or server-side logic
const result = await $cmsQuery(`{ ... }`, variables?)
const page = await $cmsPage('/about', { locale })
```

`useCms` and `$cmsQuery` are typed end-to-end from the query string via gql.tada, with no codegen
step and no manual types.

`useCms` keys the cache on the query + variables and returns Nuxt's `AsyncData`. `$cmsQuery` throws
if the response contains GraphQL errors.

A third argument forwards options to `useAsyncData`. `key` replaces the generated cache key.
`default` gives the value that `data` holds before the query resolves and after it fails, which
keeps a failed query out of the rendering path. `server`, `lazy`, `immediate`, `deep`, `dedupe`,
`watch` and `getCachedData` are passed through unchanged. `getCachedData` is the one to reach for
when a client navigation must not refetch a page the app already holds: return
`nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]` and the query runs once per key.

```ts
const { data } = await useCms(query, { locale }, {
   key: `page:${path}:${locale}`,
   default: () => null,
})
```

With [`cms.enabled: false`](configuration.md#enabled) the composables stay defined but become
no-ops: `useCms().data`, `useCmsSingle().data`, `useCmsPage().data`, `useCmsContent().data` and `useCmsRoute().data` are
`null`, `useCmsCollection().data` and `useCmsContents().data` are `[]` and `$cmsQuery()` resolves to
`{}`. The plain promise helpers resolve to the same empty values (`null` or `[]`). `<CmsBlocks>` stays registered too. The generated types stay available too, so the same code type-checks
in both modes. Callers therefore never need a `typeof useCms === 'function'` guard, they just render
their empty state.

## Entry helpers

`useCmsSingle`, `useCmsCollection` and `useCmsPage` build the query from `cms.config.ts`, so adding
a field to an entry adds it to the result with no change in the page.

```ts
const { data: home } = await useCmsSingle('homepage', { locale: 'it' })
home.value?.heroTitle

const { data: events } = await useCmsCollection('events', {
   filters: { date: { gte: '2026-01-01' } },
   sort: [{ field: 'date', direction: 'desc' }],
   limit: 10,
   offset: 0,
   locale: 'it',
})
events.value[0]?.poster?.url
```

What they select:

- every public field of the entry, plus `id` and `updatedAt` (and `createdAt` for a collection);
- media fields with all their keys (`key url type alt folder mime size width height focalX focalY`);
- blocks fields with `__typename`, `type` and an inline fragment per block type, nested blocks
  included (down to the nesting limit);
- relations one level deep. The related entry brings its own fields, but not its own relations.

`data` holds `null` for a single and `[]` for a collection before the query resolves and after it
fails. Both helpers accept the same `useAsyncData` options as `useCms`, `key` and `default`
included. `sort.field` accepts only the field names of that entry.

`useCmsPage` takes the path of a page of a [`page` entry](schema.md#pages) and returns exactly the
fields of that path, the shared ones plus its own:

```ts
const { data: page } = await useCmsPage('/about', { locale })
page.value?.intro
```

The path is typed: only the paths of the config are accepted, and `page.value` carries the fields of
that path alone. The entry also answers the generated queries `<entry>(locale)` for the whole list
and `<entry>ByPath(path, locale)` for one page.

`useCmsContents` and `useCmsContent` read a [`content` entry](schema.md#content). The list takes
the same options as `useCmsCollection` and sorts by `publishedAt`, newest first, when `sort` is
omitted. The item is read by slug:

```ts
const { data: news } = await useCmsContents('news', { limit: 10, locale })
const { data: article } = await useCmsContent('news', String(route.params.slug), { locale })
article.value?.body
```

`data` holds `[]` for the list and `null` for the item until the query resolves, and the item is
`null` when the slug is unknown, a draft, or scheduled. When the CMS is disabled both return their
default without a request.

### Plain promise helpers

`$cmsSingle`, `$cmsCollection`, `$cmsPage`, `$cmsContents`, `$cmsContent` and `$cmsRoute` run the
same generated queries as the `useCms*` helpers and return a plain promise of the result, with no
`useAsyncData`. They take the same arguments, without the `useAsyncData` options. Use them outside
component setup: in event handlers, in plugins, in route guards, or to fill the payload ahead of a
navigation.

```ts
const key = `cms-page:/about:${locale}`
nuxtApp.payload.data[key] ??= await $cmsPage('/about', { locale })
```

A page that reads the same key with a `getCachedData` that returns `nuxtApp.payload.data[key]`
then renders with no request. The helpers forward the preview token of the current route, and their
queries are batched like the others. A failed query rejects the promise.

### Content routes

When a content entry has a [`route`](schema.md#routes), its items carry `path` (the public path in
the requested locale) and `paths` (`[{ locale, path }]`, one per locale), and the content helpers
select both, so a list links with `<NuxtLink :to="item.path">`.

`useCmsRoute` finds the item a site path shows, across every routed content entry, so a site can
serve all of them from one catch-all page:

```vue
<script setup lang="ts">
const route = useRoute()
const { data: match } = await useCmsRoute(route.path, { locale })
if (!match.value) throw createError({ statusCode: 404, fatal: import.meta.client })
</script>

<template>
   <NewsArticle v-if="match?.entry === 'news'" :item="match.item" />
   <BlogPost v-else-if="match?.entry === 'blog'" :item="match.item" />
</template>
```

`data` is `{ entry, item }`, typed as a union on `entry` (`CmsContentRouteMatch` in `#cms-types`),
or `null` when no published item has that path. The path is matched against the pattern of
`locale` (the default locale when omitted), so pass the locale the site is showing; query string,
hash and trailing slash are ignored. When two patterns could match the same path, the one with
more fixed segments wins. It sends one request (`<entry>ByPath` per routed entry).

### Preview links

An editor can share a draft or scheduled item with a [preview link](admin.md#share-preview):
the item address plus `?cms-preview=<token>`. Nothing changes in the page code: `useCmsRoute`,
`useCmsContent`, `useCms` and the other helpers read the token from the current route and send it
as the `x-cms-preview` header, on the server render and in the browser. The server checks the
hash, the expiry and the revocation, then lets `<entry>ByPath`, `<entry>BySlug` and `<entry>ById`
return that one item even if it is a draft or scheduled. Every other item, lists, counts and
relations stay published only. A wrong, expired or revoked token falls back to the public behavior,
so the catch-all page answers 404 for a draft. `$cmsQuery` reads the token when called with the
Nuxt app available (setup, plugins, middleware); elsewhere send the header yourself.

Requests with the token (the page, by the `cms-preview` query, and GraphQL, by the header) answer
with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` and
`Referrer-Policy: same-origin`. Preview queries skip the in-flight dedupe and go out in their own
batch, and their `useAsyncData` keys end with `:cms-preview`. If a CDN or route rule (`swr`,
`isr`, `cache`) caches your pages, bypass it for requests with `cms-preview` in the query.

On such a page the module shows a small "Preview" banner with the expiry (turn it off with
[`preview.banner: false`](configuration.md#preview)). `useCmsPreviewMode()` returns a computed
`{ entry, id, expiresAt }` while a valid link is open, else `null`, for your own banner or to skip
analytics. It is filled by `GET /api/cms/preview` with the header.

### SEO tags

`useCmsSeo(item, { locale })` writes the title, description, canonical, Open Graph, Twitter,
`robots` and hreflang tags of a page from a content item or a page row, with the site settings as
fallback; `useCmsSite({ locale })` reads those settings (`cmsSite` in GraphQL). See
[SEO](seo.md).

```ts
const { data: match } = await useCmsRoute(route.path, { locale })
useCmsSeo(() => match.value?.item, { locale })
```

Write a query with `useCms` when you need a count, a relation two levels deep, several entries in
one request, or a narrower selection.

## Generated queries

For each **collection** (e.g. `events`, GraphQL type `Events`):

```graphql
events(filters: EventsFilters, sort: [EventsSort!], limit: Int, offset: Int, locale: String): [Events!]!
eventsById(id: ID!, locale: String): Events
eventsCount(filters: EventsFilters): Int!
```

For each **single** (e.g. `homepage`):

```graphql
homepage(locale: String): Homepage
```

For each **content** entry (e.g. `news`), the collection queries plus a query by slug:

```graphql
news(filters: NewsFilters, sort: [NewsSort!], limit: Int, offset: Int, locale: String): [News!]!
newsById(id: ID!, locale: String): News
newsBySlug(slug: String!, locale: String): News
newsCount(filters: NewsFilters): Int!
```

Without `sort`, the list is ordered by `publishedAt` descending.

A content entry with a [`route`](schema.md#routes) also gets a query by public path, and its type
gets `path: String!` and `paths: [CmsLocalePath!]!` (`type CmsLocalePath { locale: String! path: String! }`):

```graphql
newsByPath(path: String!, locale: String): News
```

It returns the published, non-scheduled item whose path in `locale` (default locale when omitted)
is `path`, or `null`.

For a **page** entry (e.g. `pages`):

```graphql
pages(locale: String): [Pages!]!
pagesByPath(path: String!, locale: String): Pages
```

## Filters, sorting, pagination

**Filterable fields:** `id`, `createdAt`, `updatedAt`, and every field except `json`, `blocks`,
`translatable` and `private` fields. Single relations filter by the related id as a
`StringFilter`. Non-translatable `media` fields filter and sort on the stored object key.
Multi-value fields (multi-select, `tags`, `many-to-many` relations) filter with a
`StringListFilter` and cannot be sorted.

**Operators:**

- String: `eq neq gt gte lt lte like in isNull`
- Int / Float: `eq neq gt gte lt lte in isNull`
- Boolean: `eq neq isNull`
- String list: `hasAny hasAll isEmpty`

All filters combine with AND, across fields and across the operators of one field.

### List filters

```graphql
input StringListFilter {
  hasAny: [String!]
  hasAll: [String!]
  isEmpty: Boolean
}
```

- `hasAny`: the list holds at least one of the values.
- `hasAll`: the list holds every one of the values (repeated values count once).
- `isEmpty: true`: the list is empty or null; `isEmpty: false`: it has at least one item.
- On multi-select and `tags` the values are matched exactly (case-sensitive) against the stored
  strings; on a `many-to-many` relation they are the ids of the related entries. A drafted related
  entry still counts, since the match is on the join table.
- An empty `hasAny` or `hasAll` list is an error; a `null` operator is ignored.
- SQLite, libSQL and D1 run it with `json_each` (or a subquery on the join table); Postgres with
  `jsonb_array_elements_text` and `@>`.

```graphql
{
  guides(
    filters: {
      spots: { hasAny: ["Lago di Garda", "Po"] }
      species: { hasAll: ["pike", "zander"] }
      regions: { isEmpty: false }
    }
  ) {
    id name spots
  }
}
```

The same object works as the `filters` option of `useCmsCollection` and `useCmsContents`:

```ts
const { data } = await useCmsCollection('guides', {
   filters: { spots: { hasAny: ['Lago di Garda'] } },
})
```

**Sort:** `[{ field: <fieldName>, direction: asc | desc }]` (`direction` defaults to `asc`).

**Pagination:** `limit` and `offset`.

## Media

`media` fields resolve to a `CmsMedia` object:

```graphql
poster { key url type alt folder mime size width height focalX focalY }
```

- **`key`**: the object key in your S3-compatible storage (the media field stores only this).
- **`url`**: the public URL, built as `publicBaseUrl` + "/" + `key`. A relative `publicBaseUrl` (e.g. `/images`) gives a root-relative URL. `url` is `null` only when `publicBaseUrl` is not configured.
- **`type`**: the enum `CmsMediaType`, derived from the mime type: `image`, `video` or `file`.
- **`focalX`** / **`focalY`**: the focal point an editor marked on the image, as floats from 0
  (left / top) to 1 (right / bottom). Both are `null` until it is set, which means the center. See
  [Media → Focal point](media.md#focal-point).
- Other fields: metadata set at upload time (alt text, folder, dimensions).

To render an image, use `<CmsImage>` (see [Media → Rendering images](media.md#rendering-images)):

```vue
<CmsImage :media="event.poster" sizes="sm:100vw md:50vw" class="aspect-video w-full object-cover" />
```

## Links

`link` fields resolve to a `CmsLink` object (typed `CmsLink` in `#cms-types`, selected in full by
the generated queries):

```graphql
cta { href label newTab external entry id }
```

- **`href`**: the address to render. For an address it is the stored URL. For a page it is the page
  path. For a content item it is the item path in the requested `locale` (from the entry
  `route`). It is `null` when the target was deleted, is a draft or is scheduled, so the site never
  links to an item it cannot show.
- **`label`**: the link text in the requested locale (falls back to the default locale), or `null`.
- **`newTab`**: open in a new tab. **`external`**: the address has a scheme (`https:`, `mailto:`,
  `tel:`), as opposed to a site path or anchor.
- **`entry`** / **`id`**: the internal target, `null` for addresses.

Internal targets of one request are loaded in one query per entry, whatever the number of links.

Render it with `<CmsLink>` (auto-imported). It renders a `<NuxtLink>` to `href` with
`target="_blank"` and `rel="noopener noreferrer"` when `newTab` is set, shows `label` (or the href)
unless you pass slot content, and renders nothing when `href` is `null`:

```vue
<CmsLink :link="block.cta" class="button" />
<CmsLink :link="footer.privacy">Privacy</CmsLink>
```

## Blocks

Each `blocks` field has a GraphQL interface named `<Entry><Field>Block`, and every block type of
that field implements it. The interface holds `type` plus each field that all blocks of the field
declare. A field with one block type therefore needs no inline fragment:

```graphql
gallery { type hidden photo { url alt } }
```

Use an inline fragment to select the fields of one block type. Block type names are
`<Entry><Field><Block>`:

```graphql
body {
   type
   ... on EventsBodyHero { heading image { url alt } }
}
```

Every block field is nullable in the API and in the generated types, even when it is `required`:
block items are stored as JSON, so older items can lack a field added or made required later.
`type` and `__typename` are always set.

[Nested blocks](schema.md#nested-blocks) follow the same pattern one level down. The interface of
a nested field adds the block and the field to the name, `<Entry><Field><Block><SubField>Block`,
and so do its block types:

```graphql
body {
   __typename type
   ... on NewsBodyColumns {
      columns {
         __typename type
         ... on NewsBodyColumnsColumnsColumn {
            content { __typename type ... on NewsBodyColumnsColumnsColumnContentText { heading body } }
         }
      }
   }
}
```

Hidden items are dropped at every level, translatable fields are localized and media and links are
resolved inside nested blocks as at the top level.

## Rendering blocks

`<CmsBlocks>` renders a blocks value with the components named by `component` on each block (see
[Block components](schema.md#block-components)). Every block becomes its component, with the fields
of the block as props (`type` and `__typename` are left out). Hidden blocks (`hidden: true`) are
skipped, and so is a block whose type has no component; in development a warning names it.

```vue
<template>
   <CmsBlocks :blocks="article?.body" />
</template>
```

The component of a block is found by its GraphQL type name. The generated queries select
`__typename`, so the value of `useCmsContents`, `useCmsContent` and the other helpers works as is.
For a value without `__typename` (a hand-written query, or raw data), pass the entry and the field
(`field` defaults to `body`):

```vue
<CmsBlocks :blocks="page?.sections" entry="pages" field="sections" />
```

The components are imported at build time from `#components`, as lazy components, through a
generated map (`#cms-blocks`). Nothing is registered globally and nothing is resolved by name at
runtime. The `annotate` prop adds `data-cms-block` (the index), `data-cms-block-path` (the item path,
`body.2`) and `data-cms-block-type` to the root element of each block, for tools that need to find a
block in the page. The visual editor uses it, so give each block component a single root element.

For [nested blocks](schema.md#nested-blocks), render the nested field with `<CmsBlocks>` inside the
block component:

```vue
<template>
   <div class="grid md:grid-cols-2">
      <CmsBlocks :blocks="columns" />
   </div>
</template>

<script setup lang="ts">
import type { NewsBodyColumnsProps } from '#cms-types'

defineProps<NewsBodyColumnsProps>()
</script>
```

A nested `<CmsBlocks>` knows its parent block: it inherits `entry` and `annotate`, and finds the
name of the field from the prop you pass it (pass `field="columns"` when you pass a filtered or
copied list). With `annotate`, nested roots get `data-cms-block-path` (`body.2.columns.0`),
`data-cms-block-parent` (`body.2`) and `data-cms-block-type`, but no `data-cms-block`, so
`data-cms-block` keeps meaning a top-level block. The visual editor finds blocks at every level by
`data-cms-block-path`. Keep the nested `<CmsBlocks>` rendered when its list is empty: in the editor
preview it shows an **Add a block** placeholder there (empty nested lists reach the preview as `[]`),
and on the site it renders nothing.

### Marking fields

Tell the visual editor which element shows which field, so that a click on it in the canvas opens
that field in the inspector. Use the `<CmsField>` component or the `v-cms-field` directive, both
registered by the module:

```vue
<template>
   <section>
      <CmsField name="heading" as="h2">{{ heading }}</CmsField>
      <div v-cms-field="'body'" v-html="body" />
   </section>
</template>
```

`<CmsField>` renders the tag given by `as` (default `span`) with its slot; attributes like `class`
pass through. Both add `data-cms-field` only inside the editor preview: on the public site they
render nothing extra. Inside a block, the name is a field of that block (the block is the nearest
`data-cms-block-path` ancestor, so a field of a nested block belongs to that nested block). Outside every block, for example in a
[preview component](schema.md#preview-component), the name is a field of the item (`title`,
`excerpt`, an extra field). Unknown names and private fields are ignored.

A marked `text` field can also be edited in place from the canvas (double-click). For that, the
element must render the value as is, as its only content: `{{ heading }}` inside the element, no
formatting of the value and no child elements. Keep rendering the element when the value is empty
if it should stay clickable. For a `textarea` field, add `white-space: pre-line` so the line
breaks show. Rich text fields are not edited in place: a click opens them in the inspector.

## Example

```ts
const { data } = useCms(`query ($cat: String!) {
   homepage(locale: "it") { heroTitle }
   events(
      filters: { date: { gte: "2026-01-01" }, category: { eq: $cat } }
      sort: [{ field: date, direction: desc }]
      limit: 10
      offset: 0
   ) {
      id title date slug
      poster { url alt }
      category { id name }
      tags { id name }
      body {
         type
         ... on EventsBodyHero { heading image { url alt } }
      }
   }
   eventsCount
}`, { cat: 'some-category-id' })
```

## Behavior notes

- Entries with `drafts: true` return **published rows only**; drafts are invisible to the API
  (except the one item of a valid [preview link](#preview-links)).
- Content entries also hide **scheduled** items: a published item whose `publishedAt` is still in
  the future stays out of every query, relations included, until that moment.
- Fields declared with [`private: true`](schema.md#private-fields) are absent from the schema
  entirely: they cannot be selected, filtered or sorted on, and introspection does not list them.
- `locale` omitted → `defaultLocale`; unknown locale → error; missing translation → falls back to
  `defaultLocale`.
- Relations resolve nested entries (localized with the parent's `locale`). A required many-to-one
  pointing to a drafted (unpublished) entry can still resolve to `null`.
- Query nesting depth is capped by `cms.graphql.maxDepth` (default 8); deeper queries are rejected.
- A query can select at most 500 fields. This limit is fixed.
- Introspection works only in development, where GraphiQL is on. In production an introspection
  query returns the error `Introspection is disabled`.
- `createdAt` and `updatedAt` are ISO 8601 UTC strings (`2026-05-01T08:30:00.000Z`) on every driver.
- **SSR and hydration:** `useCms` queries must be awaited at the top level of `<script setup>` (or inside `await definePageMeta()` lifecycle) to ship server-rendered data to the client. Without awaiting, the page loads without the data until hydration:
  ```ts
  const { data } = await useCms(`{ ... }`)
  ```
- In development a GraphiQL explorer is served at `/api/cms/graphql`.
- **Batching:** `$cmsQuery` and every helper built on it (`useCms`, `useCmsSingle`,
  `useCmsCollection`, `useCmsPage`, `useCmsContents`, `useCmsContent` and their `$cms*` forms) send the queries started in
  the same tick as one HTTP request (a JSON array, up to 20 queries per request), and a query identical to one already in flight
  shares its request. A single query is sent as before. The `useAsyncData` keys, and so the SSR
  payload keys, do not change.
