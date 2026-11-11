import { createApp, h } from 'vue'
import { defineNuxtPlugin } from '#imports'
import CmsPreviewBanner from '../preview/CmsPreviewBanner.vue'
import { useCmsPreviewState } from '../composables/cms-preview-mode'

export default defineNuxtPlugin({
   name: 'nuxt-cms:preview-banner',
   dependsOn: ['nuxt-cms:preview'],
   setup(nuxtApp) {
      const state = useCmsPreviewState()
      nuxtApp.hook('app:mounted', () => {
         const host = document.createElement('div')
         host.setAttribute('data-cms-preview-banner', '')
         document.body.appendChild(host)
         createApp({
            render: () => (state.value ? h(CmsPreviewBanner, { mode: state.value }) : null),
         }).mount(host)
      })
   },
})
