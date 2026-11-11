import { describe, expect, it } from 'vitest'
import type { CmsEntry, CmsRedirectLink } from '../src/runtime/shared/index'
import {
   contentItemMoves,
   contentPathMoves,
   findRedirectLoop,
   isContentItemLive,
   normalizeRedirectInput,
   normalizeRedirectPath,
   planRedirectMoves,
   redirectApplies,
   redirectErrors,
   redirectFromErrors,
   redirectLocation,
   redirectRowsFromTable,
   redirectTargetMap,
   redirectTargetPath,
   redirectToErrors,
   redirectsToTable,
   retargetRedirect,
} from '../src/runtime/shared/index'

const NOW = new Date('2026-06-01T00:00:00.000Z')

function targets(pairs: [string, string][]) {
   return redirectTargetMap(pairs.map(([from, to]) => ({ from, to })))
}

describe('normalizeRedirectPath', () => {
   it('drops the trailing slash, empty segments, the query and the hash', () => {
      expect(normalizeRedirectPath('/old/')).toBe('/old')
      expect(normalizeRedirectPath('//old//page/?a=1#top')).toBe('/old/page')
      expect(normalizeRedirectPath('/')).toBe('/')
      expect(normalizeRedirectPath('')).toBe('/')
   })

   it('is case sensitive', () => {
      expect(normalizeRedirectPath('/Old')).toBe('/Old')
      expect(normalizeRedirectPath('/Old')).not.toBe(normalizeRedirectPath('/old'))
   })

   it('gives one spelling to encoded and raw characters', () => {
      expect(normalizeRedirectPath('/caff%C3%A8')).toBe(normalizeRedirectPath('/caffè'))
      expect(normalizeRedirectPath('/a b')).toBe('/a%20b')
      expect(normalizeRedirectPath('/a:b')).toBe(normalizeRedirectPath('/a%3Ab'))
      expect(normalizeRedirectPath('/bad%E0%A4%A')).toBe('/bad%E0%A4%A')
   })
})

describe('redirect validation', () => {
   it('accepts a site path as from', () => {
      expect(redirectFromErrors('/old-page')).toEqual([])
      expect(redirectFromErrors('/')).toEqual([])
      expect(redirectFromErrors('/cmsx')).toEqual([])
   })

   it('rejects a from with a host, a query or under a reserved prefix', () => {
      expect(redirectFromErrors('')).toEqual(['From is required'])
      expect(redirectFromErrors('old')).toEqual([
         'From must be a path starting with /, without a host',
      ])
      expect(redirectFromErrors('https://example.com/a')[0]).toContain('without a host')
      expect(redirectFromErrors('//example.com/a')[0]).toContain('without a host')
      expect(redirectFromErrors('/a?b=1')).toEqual(['From cannot hold a query or a hash'])
      expect(redirectFromErrors('/a b')).toEqual(['From cannot hold spaces or backslashes'])
      expect(redirectFromErrors('/cms')).toEqual(['From cannot be under /cms'])
      expect(redirectFromErrors('/cms/news')).toEqual(['From cannot be under /cms'])
      expect(redirectFromErrors('/api/x')).toEqual(['From cannot be under /api'])
      expect(redirectFromErrors('/_nuxt/x.js')).toEqual(['From cannot be under /_nuxt'])
   })

   it('accepts a path or an absolute http(s) url as to', () => {
      expect(redirectToErrors('/new?x=1#top')).toEqual([])
      expect(redirectToErrors('https://example.com/a?b=1')).toEqual([])
      expect(redirectToErrors('HTTP://example.com')).toEqual([])
   })

   it('rejects other targets', () => {
      expect(redirectToErrors('')).toEqual(['To is required'])
      expect(redirectToErrors('javascript:alert(1)')[0]).toContain('absolute http(s) URL')
      expect(redirectToErrors('//evil.com')[0]).toContain('absolute http(s) URL')
      expect(redirectToErrors('new-page')[0]).toContain('absolute http(s) URL')
      expect(redirectToErrors('https://user:pass@example.com')).toEqual([
         'To cannot hold credentials',
      ])
      expect(redirectToErrors('https://')).toEqual(['To must be a valid URL'])
   })

   it('normalizes the input with defaults', () => {
      expect(normalizeRedirectInput({ from: ' /Old/ ', to: ' /new ' })).toEqual({
         from: '/Old',
         to: '/new',
         status: 301,
         keepQuery: true,
      })
   })

   it('refuses a self redirect, a duplicate and a bad status', () => {
      expect(redirectErrors({ from: '/a/', to: '/a?x=1' }, new Map())).toEqual([
         'A redirect cannot point to itself',
      ])
      expect(redirectErrors({ from: '/a/', to: '/b' }, targets([['/a', '/c']]))).toEqual([
         'A redirect from /a already exists',
      ])
      expect(redirectErrors({ from: '/a', to: '/b', status: 303 as never }, new Map())).toEqual([
         'Status must be one of 301, 302, 307, 308',
      ])
   })
})

describe('loop detection', () => {
   it('finds a loop through existing redirects', () => {
      const map = targets([
         ['/b', '/c'],
         ['/c', '/a?ref=1'],
      ])
      expect(findRedirectLoop(map, '/a', '/b')).toEqual(['/a', '/b', '/c', '/a'])
      expect(redirectErrors({ from: '/a', to: '/b' }, map)).toEqual([
         'This redirect makes a loop: /a → /b → /c → /a',
      ])
   })

   it('lets chains that end elsewhere or outside the site through', () => {
      expect(findRedirectLoop(targets([['/b', '/c']]), '/a', '/b')).toBeNull()
      expect(findRedirectLoop(targets([['/b', 'https://example.com/a']]), '/a', '/b')).toBeNull()
      expect(findRedirectLoop(new Map(), '/a', 'https://example.com/a')).toBeNull()
   })

   it('stops on a loop that does not involve the new redirect', () => {
      const map = targets([
         ['/b', '/c'],
         ['/c', '/b'],
      ])
      expect(findRedirectLoop(map, '/a', '/b')).toBeNull()
   })
})

describe('redirect runtime', () => {
   it('applies to site paths only', () => {
      expect(redirectApplies('/old')).toBe(true)
      expect(redirectApplies('/old?x=1')).toBe(true)
      expect(redirectApplies('/cms/news')).toBe(false)
      expect(redirectApplies('/api/cms/graphql')).toBe(false)
      expect(redirectApplies('/_nuxt/app.js')).toBe(false)
      expect(redirectApplies('/__nuxt_error')).toBe(false)
   })

   it('keeps the query after the query of the target', () => {
      expect(redirectLocation('/new', 'ref=x', true)).toBe('/new?ref=x')
      expect(redirectLocation('/new', '?ref=x', true)).toBe('/new?ref=x')
      expect(redirectLocation('/new?a=1', 'ref=x', true)).toBe('/new?a=1&ref=x')
      expect(redirectLocation('/new?', 'ref=x', true)).toBe('/new?ref=x')
      expect(redirectLocation('/new#top', 'ref=x', true)).toBe('/new?ref=x#top')
      expect(redirectLocation('https://example.com/a', 'ref=x', true)).toBe(
         'https://example.com/a?ref=x'
      )
   })

   it('drops the query when asked to, or when there is none', () => {
      expect(redirectLocation('/new', 'ref=x', false)).toBe('/new')
      expect(redirectLocation('/new?a=1', '', true)).toBe('/new?a=1')
   })

   it('reads the internal path of a target', () => {
      expect(redirectTargetPath('/new/?a=1')).toBe('/new')
      expect(redirectTargetPath('https://example.com/new')).toBeNull()
      expect(redirectTargetPath('//example.com/new')).toBeNull()
   })
})

describe('automatic redirects', () => {
   const blog: Pick<CmsEntry, 'kind' | 'route'> = {
      kind: 'content',
      route: { en: '/blog/[slug]', it: '/it/blog/[slug]' },
   }
   const dated: Pick<CmsEntry, 'kind' | 'route'> = {
      kind: 'content',
      route: '/news/[year]/[slug]',
   }
   const live = { status: 'published', publishedAt: '2026-05-01T08:00:00.000Z' }

   it('knows which items are live', () => {
      expect(isContentItemLive(live, NOW)).toBe(true)
      expect(isContentItemLive({ ...live, status: 'draft' }, NOW)).toBe(false)
      expect(isContentItemLive({ ...live, publishedAt: null }, NOW)).toBe(false)
      expect(isContentItemLive({ ...live, publishedAt: '2026-07-01T00:00:00.000Z' }, NOW)).toBe(
         false
      )
      expect(isContentItemLive({ ...live, publishedAt: '2026-05-01 08:00:00' }, NOW)).toBe(true)
   })

   it('moves every locale path when the slug changes', () => {
      expect(
         contentItemMoves(
            blog,
            { ...live, slug: 'old' },
            { ...live, slug: 'new' },
            ['en', 'it'],
            NOW
         )
      ).toEqual({
         moves: [
            { from: '/blog/old', to: '/blog/new' },
            { from: '/it/blog/old', to: '/it/blog/new' },
         ],
         livePaths: ['/blog/new', '/it/blog/new'],
      })
   })

   it('moves the path when the publish date changes a date placeholder', () => {
      const moves = contentItemMoves(
         dated,
         { ...live, slug: 'a' },
         { ...live, slug: 'a', publishedAt: '2025-05-01T08:00:00.000Z' },
         ['en'],
         NOW
      )
      expect(moves.moves).toEqual([{ from: '/news/2026/a', to: '/news/2025/a' }])
   })

   it('leaves no redirect for drafts, unpublished or unchanged items, or entries without a route', () => {
      const none = { moves: [], livePaths: [] }
      const old = { ...live, slug: 'old' }
      const next = { ...live, slug: 'new' }
      expect(contentItemMoves(blog, { ...old, status: 'draft' }, next, ['en'], NOW)).toEqual(none)
      expect(contentItemMoves(blog, old, { ...next, status: 'draft' }, ['en'], NOW)).toEqual(none)
      expect(contentItemMoves({ kind: 'content' }, old, next, ['en'], NOW)).toEqual(none)
      expect(contentItemMoves(blog, old, old, ['en'], NOW).moves).toEqual([])
   })

   it('never moves a path onto one that is live again', () => {
      expect(
         contentPathMoves(
            [
               { locale: 'en', path: '/a' },
               { locale: 'it', path: '/b' },
            ],
            [
               { locale: 'en', path: '/b' },
               { locale: 'it', path: '/c' },
            ]
         )
      ).toEqual({ moves: [{ from: '/a', to: '/b' }], livePaths: ['/b', '/c'] })
   })

   it('collapses chains into the new path', () => {
      const existing: CmsRedirectLink[] = [
         { id: '1', from: '/a', to: '/b' },
         { id: '2', from: '/x', to: '/b?ref=1#top' },
         { id: '3', from: '/y', to: 'https://example.com/b' },
      ]
      expect(planRedirectMoves(existing, [{ from: '/b', to: '/c' }], ['/c'])).toEqual({
         upserts: [{ from: '/b', to: '/c' }],
         retargets: [
            { id: '1', to: '/c' },
            { id: '2', to: '/c?ref=1#top' },
         ],
         deletes: [],
      })
   })

   it('drops the redirects of a path that is live again, so moving back makes no loop', () => {
      const existing: CmsRedirectLink[] = [
         { id: '1', from: '/a', to: '/b' },
         { id: '2', from: '/old', to: '/b' },
      ]
      expect(planRedirectMoves(existing, [{ from: '/b', to: '/a' }], ['/a'])).toEqual({
         upserts: [{ from: '/b', to: '/a' }],
         retargets: [{ id: '2', to: '/a' }],
         deletes: ['1'],
      })
   })

   it('replaces an existing redirect from the old path', () => {
      const existing: CmsRedirectLink[] = [{ id: '1', from: '/b', to: '/promo' }]
      expect(planRedirectMoves(existing, [{ from: '/b', to: '/c' }], ['/c'])).toEqual({
         upserts: [{ from: '/b', to: '/c' }],
         retargets: [],
         deletes: [],
      })
   })

   it('keeps the query and hash of a retargeted redirect', () => {
      expect(retargetRedirect('/b?x=1#h', '/c')).toBe('/c?x=1#h')
      expect(retargetRedirect('/b', '/c')).toBe('/c')
   })
})

describe('redirect import and export', () => {
   it('reads CSV rows by header name', () => {
      expect(
         redirectRowsFromTable([
            ['To', 'From', 'status', 'keepQuery'],
            ['/new', '/old', '302', 'false'],
            ['/x', '/y', '', ''],
         ])
      ).toEqual([
         { from: '/old', to: '/new', status: 302, keepQuery: false },
         { from: '/y', to: '/x' },
      ])
   })

   it('needs a from and a to column', () => {
      expect(() => redirectRowsFromTable([['from'], ['/a']])).toThrow('from and a to column')
      expect(redirectRowsFromTable([])).toEqual([])
   })

   it('writes the same columns back', () => {
      expect(
         redirectsToTable([{ from: '/old', to: '/new', status: 308, keepQuery: true }])
      ).toEqual([
         ['from', 'to', 'status', 'keepQuery'],
         ['/old', '/new', '308', 'true'],
      ])
   })
})
