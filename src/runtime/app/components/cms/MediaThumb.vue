<template>
   <span v-if="!value" class="cms-media-thumb-empty">
      <KIcon :name="cmsIcon('minus')" />
      <span class="k-visually-hidden">No media</span>
   </span>

   <KTooltip v-else :text="filename">
      <img
         v-if="kind === 'image' && url"
         :src="url"
         :alt="filename"
         loading="lazy"
         class="cms-media-thumb"
      />
      <video
         v-else-if="kind === 'video' && url"
         :src="url"
         :aria-label="filename"
         muted
         playsinline
         preload="metadata"
         class="cms-media-thumb"
      />
      <span v-else class="cms-media-thumb is-fallback">
         <KIcon :name="cmsIcon(icon)" :label="filename" />
      </span>
   </KTooltip>
</template>

<script setup lang="ts">
import { computed } from '#imports'
import { Icon as KIcon, Tooltip as KTooltip } from '@xleddyl/443-components-vue'
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
