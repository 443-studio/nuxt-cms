<template>
   <span v-if="!value" class="cms-media-thumb-empty">
      <KIcon :name="cmsIcon('minus')" />
      <span class="k-visually-hidden">No media</span>
   </span>

   <KTooltip v-else :text="filename">
      <KThumbnail :src="url ?? undefined" :kind="kind" :alt="filename" size="sm" />
   </KTooltip>
</template>

<script setup lang="ts">
import { computed } from '#imports'
import {
   Icon as KIcon,
   Thumbnail as KThumbnail,
   Tooltip as KTooltip,
} from '@xleddyl/443-components-vue'
import { mediaFilename, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{ value?: string | null }>()

const { mediaBaseUrl } = useCmsRuntime()

const kind = computed(() => (props.value ? mediaTypeForKey(props.value) : 'file'))
const url = computed(() => (props.value ? mediaPublicUrl(mediaBaseUrl, props.value) : null))
const filename = computed(() => (props.value ? mediaFilename(props.value) : ''))
</script>
