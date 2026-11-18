# Seeding content

`@xleddyl/nuxt-cms/seed` fills a database from one JSON object, the **content snapshot**: media
files, the site settings, page content, singles, collection entries and content entries (news,
blog) in a single call. Use it for
reproducible dev data, demo sites, tests, or a pipeline (an LLM, a migration script) that writes the
content of a new site.

The snapshot goes through the same validation and encoding as the admin panel: field types,
required fields, select options, locales, link targets, `validate` hooks, block types and nesting,
relation ids, unique values and media keys. Every issue is collected first and nothing is written
until the whole snapshot is valid.

## Quick start

```ts
// scripts/seed-content.ts
import { seedCmsContent } from '@xleddyl/nuxt-cms/seed'

const result = await seedCmsContent({ file: 'content/seed.json' })
console.log(result)
```

```bash
npx nuxi prepare            # writes .nuxt/cms/schema.ts
npx tsx scripts/seed-content.ts
```

The migrations in `server/db/migrations/<driver>` must exist, as for the app (`nuxt dev` generates
them, or `generateMigrations()` from `@xleddyl/nuxt-cms/generate`). The same entry point exports
`openStudio()`, which opens Drizzle Studio on the app database with the generated drizzle config.

`seedCmsContent` runs from the project root (or `root`) and:

1. reads `nuxt.config.ts` for `cms.i18n`, `cms.media`, `cms.database` and `cms.configPath`;
2. loads `cms.config.ts` and resolves the page routes from the pages folder (like
   `resolveCmsPages`);
3. loads the generated schema (`.nuxt/cms/schema.ts`, so run `nuxi prepare` after changing
   `cms.config.ts`);
4. opens the database like `createCmsSeeder` (`NUXT_CMS_DATABASE_URL`, `_AUTH_TOKEN`, `_DRIVER` and
   `_PATH` win over the values in `nuxt.config.ts`), applies the migrations, uploads the
   [media files](#media-files) of the snapshot, imports the snapshot and closes the connection.

`nuxt.config.ts` is loaded with the `.env` of the project, so the env vars can live there.

It returns what was written:

```ts
{
   mode: 'replace',
   dryRun: false,
   pages: ['/', '/about'],
   singles: ['homepage'],
   collections: { categories: ['cat_lake'], events: ['events_Xa81...'] },
   contents: { news: ['news_P0q2...'] },
   media: { keys: ['hero/lake.webp'], uploaded: ['hero/lake.webp'], skipped: [] },
   site: true,
}
```

`site` is `true` when the snapshot has a `site` section (written, or validated on a dry run).

## Snapshot format

```json
{
   "media": [
      { "key": "hero/lake.webp", "file": "seed/media/lake.webp", "alt": "The lake at dawn" }
   ],
   "site": {
      "name": { "en": "Lake club", "it": "Club del lago" },
      "description": { "en": "Fishing and boats on the lake" },
      "titleTemplate": "%s | %siteName",
      "image": "hero/lake.webp",
      "hidden": false
   },
   "pages": {
      "/": { "title": { "en": "Home", "it": "Casa" }, "cover": "hero/lake.webp" }
   },
   "singles": {
      "homepage": {
         "heroTitle": { "en": "Fresh water, every weekend" },
         "sections": [
            { "type": "hero", "heading": { "en": "Welcome" }, "image": "team/boat.webp" },
            { "type": "text", "body": { "en": "<p>Since 1999.</p>" }, "hidden": true }
         ]
      }
   },
   "collections": {
      "categories": [{ "id": "cat_lake", "name": "Lake" }],
      "events": [
         {
            "title": "Spring fair",
            "date": "2026-04-12",
            "category": "cat_lake",
            "more": { "entry": "pages", "id": "about" }
         }
      ]
   },
   "contents": {
      "news": [
         {
            "title": { "en": "Season opens" },
            "body": [{ "type": "text", "body": { "en": "<p>See you at the lake.</p>" } }]
         }
      ]
   }
}
```

| Section | Shape | Keys |
| --- | --- | --- |
| `media` | `[{ key, file, alt?, focalX?, focalY? }, ...]` | see [Media files](#media-files) |
| `site` | `{ name?, description?, titleTemplate?, image?, hidden? }` | see [Site settings](#site-settings) |
| `pages` | `{ "<path>": values }` | a route path of the page entry (`/`, `/about`) |
| `singles` | `{ "<entry>": values }` | a `single` entry |
| `collections` | `{ "<entry>": [values, ...] }` | a `collection` entry |
| `contents` | `{ "<entry>": [values, ...] }` | a `content` entry |

Every section is optional. Field values use the shape the admin API accepts:

| Field | Value |
| --- | --- |
| `text`, `richtext` (HTML), `email`, `slug` | string |
| translatable `text` / `richtext` / `media` | `{ "<locale>": value }` with locales from `cms.i18n` |
| `number`, `boolean`, `json` | number, `true`/`false`, any JSON |
| `date` / `datetime` | `"2026-04-12"` / `"2026-04-12T09:00:00Z"` (with a time zone) |
| `select` | an option value; `multiple`: an array of values |
| `tags` | an array of strings |
| `media` | the media library key: in `local` mode the path relative to the `publicBaseUrl` folder (`hero.webp`, `team/boat.webp`); in `s3` and `filesystem` mode a key in `cms_media` or in the `media` section |
| `relation` | an id; `many-to-many`: an array of ids |
| `link` | `{ "url": "/path" }` or `{ "entry": "<entry>", "id": "<id>" }`, plus `label` and `newTab` |
| `blocks` | an array of `{ "type": "<block>", ...fields }`, nested blocks inline, optional `hidden: true` |

Rules:

- **Ids.** `id` is optional on collection and content entries (letters, numbers, `_`, `-`, up to
  128 characters). A missing id is generated with `customId`. Relations and links may point at
  ids declared anywhere in the same snapshot, in any order, self relations included. A page link
  uses the page key as `id` (`/` is `home`, `/about-us` is `aboutUs`).
- **Status.** Entries with drafts and content entries are `published` unless the values say
  `"status": "draft"`. A published content entry without `publishedAt` gets the current time.
- **Slugs.** An empty `slug` field is filled from its `from` field (the default locale value of a
  translatable title), like the admin does.
- **Defaults.** Field `default`s apply to missing keys, as on a new entry in the admin.
- **Not allowed.** `createdAt`, `updatedAt` and, on pages and singles, `id` and `path` are set
  automatically.

## Site settings

The `site` section fills **Settings → Site** (the `cms_settings` row `cms:site`), with the body of
`PUT /api/cms/site` and the same validation:

| Key | Value |
| --- | --- |
| `name` | `{ "<locale>": "..." }` (up to 200 characters each) or `null` |
| `description` | `{ "<locale>": "..." }` (up to 1000 characters each) or `null` |
| `titleTemplate` | a string with `%s` (the page title) and optionally `%siteName`, up to 200 characters, or `null` (default `%s \| %siteName`) |
| `image` | the share image: a media library key (as for `media` fields, so a key of the `media` section works) or `null` |
| `hidden` | `true` or `false` |

Locales are those of `cms.i18n` (the default locale alone without i18n); texts are trimmed and
blank ones dropped. Every key is optional: the row is written whole, so a missing key is empty
(`null`, or `false` for `hidden`). Unknown keys are errors. When `site` is present it overwrites the
row in both modes; when it is absent the row is left as it is. Saving it fires no hook, like the
admin.

## Media files

In `s3` and `filesystem` storage, the `media` section uploads local files to the configured storage
and registers them in the media library, so the rest of the snapshot can use their keys:

```json
{
   "media": [
      {
         "key": "hero/DSC06348.webp",
         "file": "seed/media/hero/DSC06348.webp",
         "alt": "Boats on the lake",
         "focalX": 0.5,
         "focalY": 0.3
      }
   ],
   "pages": { "/": { "cover": "hero/DSC06348.webp" } }
}
```

- **`key`**: the object key in the storage, also the value of `media` fields. Its folder in the
  library is the part before the last `/` (`hero`), so it must be a library folder: lowercase slug
  segments, at most 4 levels. The extension sets the content type and must be an allowed upload
  type: `jpg`, `jpeg`, `png`, `webp`, `avif`, `gif`, `mp4`, `m4v`, `webm`, `mkv`, `mov`, `mp3`,
  `wav`, `ogg`, `m4a`, `pdf` (no `svg`, like the admin). No `..`, no leading `/`, no file name
  starting with `.`, and each key once.
- **`file`**: the local file, relative to the project root (or `root`). It must exist, be non-empty
  and fit in `maxFileSize`.
- **`alt`**, **`focalX`**, **`focalY`**: optional, like the admin API: `alt` a string (up to 1024
  characters, one text for every locale), the focal point two numbers from 0 to 1 set together, or
  both `null` to clear it. Omitted, the values already in `cms_media` are kept.

Every file is checked with the rest of the snapshot, and a `dryRun` checks them too, without
uploading. Then the files are uploaded, four at a time, and the `cms_media` rows (mime, size, width
and height read from the file as in `local` mode, folder, alt, focal point) are written in the same
transaction as the content. If an upload fails, nothing is written to the database (the files
already uploaded stay in the storage, and the next run skips them).

- **`s3`**: a `PUT` to the bucket with the server's client (`aws4fetch`, the configured endpoint,
  region and credentials) and the content type of the extension. An object that already exists
  with the same size (a `HEAD` request) is skipped, so a re-run uploads only what changed in size.
  `forceMediaUpload: true` uploads every file again.
- **`filesystem`**: the file is copied into `dir`, skipped when a file of the same size is there.
- **`local`**: an error, as the library is read-only. Put the files in the `publicBaseUrl` folder
  and use their path as the key.

The storage comes from `cms.media` in `nuxt.config.ts`, and the env vars win over it like at
runtime: `NUXT_CMS_MEDIA_ENDPOINT`, `_REGION`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`
and `_MAX_FILE_SIZE` for `s3`, `NUXT_CMS_MEDIA_DIR` and `_MAX_FILE_SIZE` for `filesystem` (a
relative `dir` is resolved from the project root). `storage` itself is read from `nuxt.config.ts`
only. For AWS S3, the endpoint is the regional one, like `https://s3.eu-central-1.amazonaws.com`
with `region: 'eu-central-1'`, and the credentials need `s3:PutObject` and `s3:GetObject` (for the
`HEAD`; without `s3:ListBucket` a missing object answers `403`, which counts as missing).

Media rows are never deleted by the seed, in any mode: `replace` only replaces content rows.

## Modes

`mode: 'replace'` (default) first clears the content rows of every entry named in the snapshot,
then inserts the snapshot. Running the same snapshot twice gives the same content (generated ids
change; declare `id`s when other data must keep pointing at an entry). An entry named with an empty
list (`"events": []`) is emptied. `pages` replaces every page row, so pages missing from the
snapshot lose their content. Rows of other entries keep pointing at removed rows according to the
relation `onDelete` (a `restrict` relation from an entry outside the snapshot makes the import
fail and roll back).

`mode: 'merge'` keeps the existing rows and writes each snapshot row whole: an entry whose `id`
exists is updated, others are inserted, singles and pages are overwritten. Relation ids may then
also point at rows already in the database.

System tables (`cms_users`, `cms_settings`, `cms_media`, redirects, preview links) are never
cleared. The only system rows the seed writes are the `cms_media` rows of the `media` section,
inserted or updated by key, and the `cms:site` row of the `site` section.

## Validation

Before writing, the whole snapshot is checked and every issue is reported with its path, in one
`CmsContentError` (`error.issues` is the list, `error.message` prints it):

```
[nuxt-cms] The content snapshot has 4 issues:
- media.3.file: file not found: /app/seed/media/hero/DSC0634.webp
- pages./.subtitel: unknown field "subtitel"; did you mean "subtitle"? allowed: "title", "subtitle", "cover"
- singles.homepage.sections.0.type: unknown block type "banner"; allowed: "hero", "text"
- collections.events.0.cover: media "boat.jpg" not found in the media library; did you mean "boat.webp"? available: "boat.webp", "hero.webp"
```

Checked: the `media` section (keys, files, sizes, alt, focal points, the storage configuration);
the `site` section (keys, locales, lengths, title template, share image key);
unknown sections, entries, page paths, fields, block types and block fields; entries under
the wrong section; value types and formats (with the expected shape in the message); required
fields; locales not in `cms.i18n`; select options; link targets and page keys; `min`/`max`;
`validate` hooks; ids (format, duplicates); relation and link ids that do not resolve (in the
snapshot, or in the database when the target entry is not replaced); unique values (`slug`,
`unique`, one-to-one) inside the snapshot and, in merge mode, against the database; media keys
(`local` mode: the files of the media folder; `s3` and `filesystem`: the keys of the `media` section
and the `cms_media` table).

`dryRun: true` validates and writes nothing (the migrations still run, so the database is in the
shape the import expects).

Writes run in one transaction (`begin immediate` on SQLite, a transaction on Postgres, one atomic
batch on libSQL), so a failure leaves the database as it was. Seeding writes straight to the
database: no hooks or webhooks fire, and no redirects are created. D1 is not supported (it is only
reachable from a Worker): seed a local SQLite copy and import it with `wrangler d1`.

## API

| Export | Purpose |
| --- | --- |
| `seedCmsContent(options)` | Everything above, from a project root. Options: `root`, `snapshot` or `file`, `mode`, `dryRun`, `forceMediaUpload`, `configPath`, `pagesDir`, `schemaPath`, `database` (`CmsSeederOptions` overrides). |
| `loadCmsProject(options)` | Loads the project without touching the database: `{ root, config, i18n, media, tables, database }`. |
| `importCmsContent(options)` | Validates, uploads the media files and imports into an open database: `{ db, config, tables, snapshot, i18n?, media?, root?, mode?, forceMediaUpload? }`. `config` must be normalized with the page routes resolved and `media` holds the storage settings (as `loadCmsProject` returns them). |
| `validateCmsContent(options)` | Returns the issues without throwing or writing: `{ config, snapshot, i18n?, mode?, db?, tables?, media?, root? }`. Without `db` the ids and media keys that only the database could confirm are not checked. |
| `CmsContentError`, `formatContentIssues` | The error thrown on issues and its message formatter. |
| `createCmsSeeder`, `customId`, `resolveCmsPages` | The lower level helpers: a Drizzle db with `migrate()` and `close()`, ids, page routes. |

```ts
import { createCmsSeeder, importCmsContent, loadCmsProject } from '@xleddyl/nuxt-cms/seed'

const project = await loadCmsProject()
const seeder = await createCmsSeeder(project.database)
await seeder.migrate()
await importCmsContent({ ...project, db: seeder.db, snapshot, mode: 'merge' })
await seeder.close()
```

The package ships [`llm.txt`](../llm.txt) (`node_modules/@xleddyl/nuxt-cms/llm.txt`), a compact
reference of the schema and of this format for an LLM that writes snapshots.
