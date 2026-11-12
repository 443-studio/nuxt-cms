import { defineNuxtPlugin, useRequestURL, useRouter } from '#imports'
import type { CmsPreviewMode } from '../../shared/index'
import { PREVIEW_HEADER, PREVIEW_QUERY_PARAM, previewTokenFrom } from '../../shared/index'
import { useCmsPreviewState } from '../composables/cms-preview-mode'

export default defineNuxtPlugin({
   name: 'nuxt-cms:preview',
   async setup(nuxtApp) {
      const state = useCmsPreviewState()
      const initial = previewTokenFrom(useRequestURL().searchParams.get(PREVIEW_QUERY_PARAM))
      let current: string | null = null

      async function load(token: string | null) {
         if (token === current) return
         current = token
         if (!token) {
            state.value = null
            return
         }
         const mode = await $fetch<CmsPreviewMode | null>('/api/cms/preview', {
            headers: { [PREVIEW_HEADER]: token },
         }).catch(() => null)
         if (current === token) state.value = mode
      }

      if (import.meta.server || !nuxtApp.payload.serverRendered) await load(initial)
      else current = initial

      if (import.meta.client)
         useRouter().afterEach((to) => load(previewTokenFrom(to.query[PREVIEW_QUERY_PARAM])))
   },
})
