import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import {
   computed,
   toValue,
   useCmsSite,
   useHead,
   useRequestURL,
   useRoute,
   useRuntimeConfig,
   useSeoMeta,
} from '#imports'
import type {
   CmsI18n,
   CmsSeoMeta,
   CmsSeoOverrides,
   CmsSeoSource,
   CmsSite,
} from '../../shared/index'
import { normalizeSiteUrl, resolveSeoMeta } from '../../shared/index'

export type CmsSeoOptions = {
   [K in keyof CmsSeoOverrides]?: MaybeRefOrGetter<CmsSeoOverrides[K]>
} & {
   locale?: string
}

export interface CmsSeoResult {
   site: Ref<CmsSite | null>
   meta: ComputedRef<CmsSeoMeta>
}

export function useCmsSeo(
   item?: MaybeRefOrGetter<CmsSeoSource | null | undefined>,
   options: CmsSeoOptions = {}
): CmsSeoResult {
   const { locale, ...overrides } = options
   const config = useRuntimeConfig().public
   const { i18n } = (config.cms ?? {}) as { i18n?: CmsI18n }
   const siteUrl =
      normalizeSiteUrl((config as { siteUrl?: string }).siteUrl) || useRequestURL().origin
   const route = useRoute()
   const { data: site } = useCmsSite({ locale })

   const meta = computed(() =>
      resolveSeoMeta(
         toValue(item),
         site.value,
         { siteUrl, path: route.path, defaultLocale: i18n?.defaultLocale ?? 'en' },
         Object.fromEntries(
            Object.entries(overrides).map(([key, value]) => [key, toValue(value)])
         ) as CmsSeoOverrides
      )
   )
   const image = () => meta.value.image
   const article = () => meta.value.type === 'article'

   useHead({
      title: () => meta.value.title,
      titleTemplate: null,
      link: () => [
         { key: 'cms-canonical', rel: 'canonical', href: meta.value.canonical },
         ...meta.value.alternates.map((alternate) => ({
            key: `cms-alternate-${alternate.hreflang}`,
            rel: 'alternate',
            hreflang: alternate.hreflang,
            href: alternate.href,
         })),
      ],
   })

   useSeoMeta({
      description: () => meta.value.description ?? undefined,
      robots: () => meta.value.robots ?? undefined,
      ogTitle: () => meta.value.pageTitle ?? meta.value.title,
      ogDescription: () => meta.value.description ?? undefined,
      ogUrl: () => meta.value.canonical,
      ogType: () => meta.value.type,
      ogSiteName: () => meta.value.siteName ?? undefined,
      ogImage: () => image()?.url,
      ogImageAlt: () => image()?.alt ?? undefined,
      ogImageWidth: () => image()?.width ?? undefined,
      ogImageHeight: () => image()?.height ?? undefined,
      ogImageType: () =>
         (image()?.type ?? undefined) as 'image/jpeg' | 'image/png' | 'image/gif' | undefined,
      articlePublishedTime: () => (article() ? meta.value.publishedTime ?? undefined : undefined),
      articleModifiedTime: () => (article() ? meta.value.modifiedTime ?? undefined : undefined),
      twitterCard: () => (image() ? 'summary_large_image' : 'summary'),
      twitterTitle: () => meta.value.pageTitle ?? meta.value.title,
      twitterDescription: () => meta.value.description ?? undefined,
      twitterImage: () => image()?.url,
      twitterImageAlt: () => image()?.alt ?? undefined,
   })

   return { site: site as Ref<CmsSite | null>, meta }
}
