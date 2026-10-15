<template>
   <span v-if="!value" class="cms-media-thumb-empty">
      <KIcon :name="cmsIcon('minus')" />
      <span class="k-visually-hidden">No media</span>
   </span>

   <img
      v-else-if="kind === 'image' && url"
      :src="url"
      :alt="filename"
      :title="filename"
      loading="lazy"
      class="cms-media-thumb"
   />

   <video
      v-else-if="kind === 'video' && url"
      :src="url"
      :title="filename"
      muted
      playsinline
      preload="metadata"
      class="cms-media-thumb"
   />

   <span v-else :title="filename" class="cms-media-thumb is-fallback">
      <KIcon :name="cmsIcon(icon)" />
   </span>
</template>

<script setup lang="ts">
import { computed } from '#imports'
import { Icon as KIcon } from '@xleddyl/443-components-vue'
import { mediaFilename, mediaIconFor, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{ value?: string | null }>()

const { mediaBaseUrl } = useCmsRuntime()

const kind = computed(() => (props.value ? mediaTypeForKey(props.value) : 'file'))
const url = computed(() => (props.value ? mediaPublicUrl(mediaBaseUrl, props.value) : null))
const filename = computed(() => (props.value ? mediaFilename(props.value) : ''))
const icon = computed(() => mediaIconFor(kind.value))
</script>
