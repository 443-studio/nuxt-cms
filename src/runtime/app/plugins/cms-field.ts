import { defineNuxtPlugin } from '#imports'
import { vCmsField } from '../preview/field-marker'

export default defineNuxtPlugin({
   name: 'nuxt-cms:field',
   setup(nuxtApp) {
      nuxtApp.vueApp.directive('cms-field', vCmsField)
   },
})
