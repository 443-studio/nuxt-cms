<template>
   <div class="cms-page">
      <KPageHeader
         title="Media"
         :icon="cmsIcon('photo')"
         description="Images, videos and files used across your content."
      >
         <template #badge>
            <KBadge :label="runtime.mediaStorage" size="sm" class="cms-code-badge" />
         </template>
      </KPageHeader>

      <CmsMediaGallery v-model:folder="folder" />
   </div>
</template>

<script setup lang="ts">
import { Badge as KBadge, PageHeader as KPageHeader } from '@xleddyl/443-components-vue'
import { computed, definePageMeta, navigateTo, useRoute } from '#imports'
import { normalizeMediaFolder } from '#nuxt-cms'
import { useCmsRuntime } from '../composables/cms-runtime'
import { cmsIcon } from '../utils/ui'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })

const runtime = useCmsRuntime()
const route = useRoute()

const folder = computed<string | null>({
   get: () => {
      const value = route.query.folder
      return normalizeMediaFolder(typeof value === 'string' ? value : null)
   },
   set: (value) => {
      const { folder: _folder, ...query } = route.query
      void navigateTo({ query: value ? { ...query, folder: value } : query })
   },
})
</script>
