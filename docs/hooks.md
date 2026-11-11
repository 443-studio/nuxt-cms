# Hooks & webhooks

Every write made from the admin panel fires a Nitro runtime hook once the database has committed it.
Use the hooks for server-side work in your app (purge a cache, reindex search, log an audit trail),
and the webhooks to tell another service (a static site build, a CDN, a search indexer).

## Runtime hooks

Two hooks, typed through Nitro's `NitroRuntimeHooks`, so `nitroApp.hooks.hook(...)` autocompletes
the names and the payloads in your project:

```ts
// server/plugins/cms.ts
export default defineNitroPlugin((nitroApp) => {
   nitroApp.hooks.hook('cms:entry:change', async (change, { event }) => {
      if (change.entry === 'news' && change.action === 'publish') await purgeNewsCache(change.ids)
   })
   nitroApp.hooks.hook('cms:media:change', (change) => {
      console.info(`media ${change.action}`, change.keys)
   })
})
```

### `cms:entry:change`

```ts
interface CmsEntryChange {
   entry: string                                  // entry key in cms.config.ts
   kind: 'collection' | 'single' | 'page' | 'content'
   action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'import'
   ids: string[]                                  // row ids (a page id, the single's id)
   path: string | null                            // page path, for page entries
   status: 'draft' | 'published' | null           // status after the write, entries with drafts
   item: Record<string, unknown> | null           // saved row, admin API shape (private fields included)
   user: { id: string | null; email: string; name: string | null; role: string }
   at: string                                     // ISO 8601 UTC
}
```

| Write | `action` | `ids` | `item` |
| --- | --- | --- | --- |
| New collection or content item (also Duplicate) | `create` | the new id | saved row |
| Save an item | `update`, `publish` (status goes to published) or `unpublish` (published to draft) | the id | saved row |
| First save of a single | `create` (then like an item save) | the single's id | saved row |
| Save a page | `update` | the page id, `path` set | saved page |
| Delete an item | `delete` | the id | `null` |
| Import (one event for the whole file) | `import` | every written id, created and updated | `null` |

An item created directly as published is a `create` with `status: 'published'`. A scheduled content
item (published with a future `publishedAt`) is a `publish`. Admin settings (columns, layout) and
user accounts fire nothing.

### `cms:media:change`

```ts
interface CmsMediaChange {
   action: 'upload' | 'update' | 'move' | 'delete' | 'folder-create' | 'folder-rename' | 'folder-delete'
   keys: string[]            // file keys (folder markers excluded)
   folder: string | null     // folder of the file, target folder, or the folder acted on
   from: string | null       // previous folder name, on folder-rename
   user: CmsHookUser
   at: string
}
```

`upload` fires when an uploaded file is registered in the library, `update` on an alt text or
folder change, `move` on a bulk move (`keys` are the moved files), `delete` on a single or bulk
delete. Folder actions list the files they moved or deleted.

### Guarantees

- Hooks run after the write committed, never for a failed or rejected write.
- They never delay or break the admin response: they run in the background (the handler does not
  wait for them), every callback runs on its own, and a callback that throws or rejects is logged
  (`[nuxt-cms] a 'cms:entry:change' hook failed`) without affecting the others.
- The work is passed to `event.waitUntil`, so on serverless hosts (Cloudflare Workers, Vercel,
  Netlify) the function stays alive until the callbacks settle. Keep them short anyway.
- `item` is a copy: changing it does not change the response.
- Only writes made through the admin API fire hooks. Direct database writes (seed scripts, your own
  routes using `#cms-db`) do not.

## Webhooks

Webhooks are built on the hooks: each change becomes one `POST` to every matching URL.

```ts
// nuxt.config.ts
cms: {
   webhooks: [
      { name: 'deploy', url: 'https://api.netlify.com/build_hooks/xxx', events: ['entry'] },
      { name: 'search', url: 'https://search.example.com/cms', secret: process.env.SEARCH_HOOK_SECRET },
   ],
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | required | camelCase identifier (`deploy`, `searchIndex`), unique; names the env vars and the log lines |
| `url` | none | `http` or `https` URL; may come from env only |
| `secret` | none | signs each request; at least 16 characters |
| `events` | every event | `'entry'`, `'media'`, or exact events like `'entry:publish'`, `'media:upload'` |
| `timeout` | `5000` | ms per request, at most `30000` |

The build fails on an unknown key, a bad name, a duplicate name, a non-http URL, a short secret, an
unknown event or an empty `events` list.

### Secrets and URLs from env

The URL and the secret live in private runtime config (server only, never sent to the browser), so
they can be set or replaced at runtime per webhook name:

| Variable | Overrides |
| --- | --- |
| `NUXT_CMS_WEBHOOKS_<NAME>_URL` | `url` |
| `NUXT_CMS_WEBHOOKS_<NAME>_SECRET` | `secret` |

`<NAME>` is the name in upper snake case: `deploy` → `NUXT_CMS_WEBHOOKS_DEPLOY_SECRET`,
`searchIndex` → `NUXT_CMS_WEBHOOKS_SEARCH_INDEX_URL`. A webhook must still be declared in
`nuxt.config.ts` (at least `{ name }`): the env vars only fill it. A webhook without a URL at
runtime is skipped; the build warns when neither the config nor the env has one.

### Request

```http
POST /cms HTTP/1.1
content-type: application/json
user-agent: nuxt-cms-webhooks
x-cms-event: entry:publish
x-cms-delivery: 1b7c2c1e-4f0e-4a43-9d3a-2a1f0a6c8e10
x-cms-signature: t=1793440800,v1=5f1c...e9

{"event":"entry:publish","action":"publish","entry":"news","kind":"content","ids":["news_abc"],"path":null,"status":"published","at":"2026-11-11T10:00:00.000Z"}
```

Media events send `{ event, action, keys, folder, from, at }`. The body never carries the item data
or the user: fetch the content through GraphQL if the receiver needs it.

Requests run in parallel, in the background, under `event.waitUntil`. A failure (network error,
timeout, non-2xx status) is logged with the webhook name and host (never the full URL or the
secret) and is not retried.

### Verifying the signature

`x-cms-signature` is `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" under the secret>`.
`verifyCmsWebhook` from `@xleddyl/nuxt-cms/webhooks` checks it with Web Crypto (Node 20+, Workers,
Deno, Bun) and returns the parsed payload, or `null` when the signature is wrong, missing or more
than `toleranceSeconds` (default 300) away from the receiver's clock:

```ts
import { verifyCmsWebhook } from '@xleddyl/nuxt-cms/webhooks'

export async function POST(request: Request) {
   const payload = await verifyCmsWebhook(request, null, process.env.CMS_WEBHOOK_SECRET!)
   if (!payload) return new Response(null, { status: 401 })
   if (payload.event === 'entry:publish') await revalidate(payload.entry, payload.ids)
   return new Response(null, { status: 204 })
}
```

`verifyCmsWebhook(input, header, secret, toleranceSeconds?)` takes a `Request` (body read, header
taken from it when `header` is `null`) or the raw body string plus the header value. In a Nitro
route: `verifyCmsWebhook(await readRawBody(event, 'utf8') ?? '', getHeader(event, 'x-cms-signature'), secret)`.
Several `v1=` values are accepted, any of which may match. The entry point is server-safe (no Nuxt
or Node imports) and also exports `signCmsWebhook` and the payload types (`CmsWebhookPayload`,
`CmsWebhookEntryPayload`, `CmsWebhookMediaPayload`).
