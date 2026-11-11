# SEO

The CMS gives the site what search engines ask for: the tags in the `<head>` of each page, a
`/sitemap.xml` and a `/robots.txt`. Editors manage the site-wide part in the admin; the pages of
your app call one composable.

## Site settings

**Settings → Site** in the admin holds the settings of the whole site. Every admin can edit them.

- **Site name**: shown in page titles and as `og:site_name`. Translatable when `cms.i18n` has
  locales.
- **Title template**: how each title reads. `%s` is the page title, `%siteName` the site name:
  `%s | %siteName` (the default) turns `About` into `About | Acme`. It must contain `%s`.
- **Default description**: for a page without its own. Translatable.
- **Share image**: an image of the media library, for a page shared without its own image.
- **Hide the site from search engines**: every page gets `noindex, nofollow`, `robots.txt`
  disallows everything and the sitemap is empty. For a staging site, or one not launched yet.

They are stored as one row of the built-in `cms_settings` table (key `cms:site`), so they need no
migration and no entry in `cms.config.ts`. Saving checks the share image against the media library.
The admin API is `GET` / `PUT /api/cms/site` (admin session, same-origin rules).

The public GraphQL API serves them in the requested locale:

```graphql
cmsSite(locale: String): CmsSite!
# type CmsSite { name titleTemplate description image: CmsMedia hidden: Boolean! }
```

`useCmsSite({ locale })` runs that query (an `AsyncData` holding `CmsSite | null`), for example to
show the site name in a header. `CmsSite` is a reserved GraphQL type name.

## Site URL

Canonical links, `og:url`, `og:image`, hreflang links, the sitemap and `robots.txt` need absolute
URLs. The module reads the site URL from, in order:

1. `cms.site.url` in `nuxt.config.ts`;
2. `runtimeConfig.public.siteUrl`, if your app already sets it;
3. `site.url`, the key used by `nuxt-site-config` and `@nuxtjs/seo`;
4. the `NUXT_PUBLIC_SITE_URL` env variable at build time.

The result is written to `runtimeConfig.public.siteUrl`, so `NUXT_PUBLIC_SITE_URL` also overrides it
at runtime. Without any of them, the origin of the request is used (behind a proxy it follows
`X-Forwarded-Host` / `X-Forwarded-Proto`). `cms.site.url` must be an absolute `http(s)` URL without
query, hash or credentials, or the build fails; a trailing slash is dropped.

## `useCmsSeo`

```ts
const { data: page } = await useCmsPage('/about')
useCmsSeo(page)

const { data: match } = await useCmsRoute(route.path, { locale })
useCmsSeo(() => match.value?.item, { locale })
```

`useCmsSeo(item?, options?)` loads the site settings (`useCmsSite`) and sets, with `useHead` and
`useSeoMeta`:

- `<title>`: the page title through the title template (the app's own `titleTemplate` is turned
  off for that page, so it is not applied twice). A page without a title, or titled like the site,
  shows the site name alone.
- `description`, `og:description`, `twitter:description`.
- `<link rel="canonical">` and `og:url`: the site URL plus the item `path`, else the current route.
- `og:title`, `twitter:title` (the page title without the template), `og:site_name`, `og:type`
  (`article` when the item has a `publishedAt`, else `website`).
- `og:image` (+ `width`, `height`, `type`, `alt`), `twitter:image` and `twitter:card`
  (`summary_large_image` with an image). Media URLs are made absolute. Only images count: a video
  cover is skipped.
- `article:published_time` / `article:modified_time` for articles.
- `robots`: `noindex, nofollow` when the site is hidden, `noindex` when the item is hidden.
- `<link rel="alternate" hreflang>` from the item `paths`, plus `x-default` on the default
  locale's path. When every locale shares one path (a single-string `route`), no alternate is
  written.

The item can be a ref, a getter or a plain object. It reads these fields when present:

| meta        | first of                                                    |
| ----------- | ----------------------------------------------------------- |
| title       | `seoTitle`, `title`                                         |
| description | `seoDescription`, `excerpt`, `description` (HTML stripped), site default |
| image       | `seoImage`, `cover`, site share image                       |
| noindex     | `seoNoindex`                                                |
| canonical   | `path`, current route                                       |
| alternates  | `paths`                                                     |

Content items have all of these as system fields. **For pages, name the fields the same way**:
`seoTitle`, `seoDescription`, `seoImage` (media image) and `seoNoindex` (boolean) on the page
entry, next to an optional `title` and `cover`:

```ts
pages: {
   id: 'pages', label: 'Pages', kind: 'page',
   fields: {
      title: { label: 'Title', type: 'text', translatable: true },
      seoTitle: { label: 'SEO title', type: 'text', translatable: true, tab: 'seo' },
      seoDescription: { label: 'SEO description', type: 'text', textarea: true, translatable: true, tab: 'seo' },
      seoImage: { label: 'Share image', type: 'media', mediaType: 'image', tab: 'seo' },
      seoNoindex: { label: 'Hide from search engines', type: 'boolean', tab: 'seo' },
   },
}
```

`options` overrides any value (each one a value, a ref or a getter): `title`, `description`,
`image` (URL or media object, `null` for none), `path`, `alternates` (`{ locale, path }[]`),
`noindex`, `type` (`'website' | 'article'`), `titleTemplate` (a template, or `false` for the raw
title), plus `locale` for the site settings. It returns `{ site, meta }`: the site settings and a
computed `CmsSeoMeta` (`title`, `pageTitle`, `description`, `canonical`, `image`, `robots`,
`alternates`, `type`, `siteName`, `publishedTime`, `modifiedTime`). The pure resolver is exported
as `resolveSeoMeta(item, site, { siteUrl, path, defaultLocale }, overrides)` from `#nuxt-cms`.

With the CMS disabled, `useCmsSeo` still works from the item alone (no site settings).

## Hide one item

Content entries have the system field `seoNoindex` (**Hide from search engines**, in the SEO tab of
the visual editor). A hidden item stays public in the API, gets `robots: noindex` from
`useCmsSeo` and is left out of the sitemap. A page row with a truthy `seoNoindex` field is left out
too.

## `/sitemap.xml`

The sitemap lists, with absolute URLs:

- every route of the page entry, with `lastmod` from the page row (dynamic routes, paths under
  `/cms` and pages with `seoNoindex` are skipped);
- every published, non-scheduled, not hidden item of the content entries that have a
  [`route`](schema.md#routes), with `lastmod` from `updatedAt`. One `<url>` per distinct path: with
  a per-locale route each locale path is its own `<url>`, and each lists the other locales as
  `xhtml:link` hreflang alternates plus `x-default`.

A hidden site gets an empty sitemap. Items are read in batches of 1000 and the XML is streamed.
Above 50,000 URLs, `/sitemap.xml` becomes a sitemap index of parts `/sitemap.xml?part=1`,
`?part=2`, ... (each part one source, at most 50,000 URLs). Responses carry
`Cache-Control: public, max-age=600, s-maxage=600`.

## `/robots.txt`

```
User-agent: *
Disallow: /cms/

Sitemap: https://example.com/sitemap.xml
```

The `Sitemap` line is there when a sitemap is served (ours or a sitemap module). A hidden site
gets `Disallow: /` only.

## Turning them off

```ts
cms: {
   site: { url: 'https://example.com' },
   seo: { sitemap: true, robots: true },
}
```

Both default to on, unless the build finds another provider: `@nuxtjs/sitemap` (or
`nuxt-simple-sitemap`) or a `public/sitemap.xml` for the sitemap, `@nuxtjs/robots` (or
`nuxt-simple-robots`) or a `public/robots.txt` for robots. Then that route stays off and the build
logs a warning; set the switch to `true` or `false` to choose and silence it (`true` keeps ours and
warns that both answer). `useCmsSeo` does not depend on these switches. Unknown keys and
non-boolean values fail the build.
