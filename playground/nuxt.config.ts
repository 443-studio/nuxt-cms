import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
   modules: ['@xleddyl/nuxt-cms'],
   devtools: { enabled: true },
   compatibilityDate: '2025-07-15',
   css: ['~/assets/css/main.css'],
   vite: {
      plugins: [tailwindcss()],
   },
   cms: {
      admin: {
         title: 'Lakeside Anglers',
         subtitle: 'Club editors',
         logo: '~/assets/logo.svg',
      },
      database: {
         driver: 'sqlite',
         path: 'data/cms.db',
      },
      i18n: {
         locales: ['en', 'it'],
         defaultLocale: 'en',
      },
      media:
         process.env.PLAYGROUND_MEDIA_STORAGE === 'filesystem'
            ? { storage: 'filesystem' }
            : { storage: 'local', publicBaseUrl: '/images' },
      graphql: {
         maxDepth: 8,
      },
      preview: {
         path: '/cms/preview',
         component: 'NewsArticle',
      },
      roles: {
         editor: {
            label: 'Editor',
            description: 'Writes and publishes news, drafts events, uploads media.',
            can: [
               'news.*',
               'events.read',
               'events.create',
               'events.update',
               '*.read',
               'media.write',
            ],
         },
      },
      seo: {
         sitemap: true,
         robots: true,
      },
   },
})
