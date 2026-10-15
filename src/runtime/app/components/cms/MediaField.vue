<template>
   <KCard
      v-if="model"
      variant="outline"
      padding="none"
      class="cms-media-single"
      :class="{ 'is-missing': missing }"
   >
      <button
         type="button"
         class="cms-media-single-preview"
         aria-label="Replace media"
         @click="openGallery"
      >
         <img v-if="kind === 'image' && url" :src="url" alt="" loading="lazy" />
         <video
            v-else-if="kind === 'video' && url"
            :src="url"
            preload="metadata"
            muted
            playsinline
         />
         <KIcon v-else :name="cmsIcon(icon)" />
      </button>
      <div class="cms-media-single-bar">
         <span class="cms-media-single-name" :title="model">{{ mediaFilename(model) }}</span>
         <KStack direction="row" gap="none" align="center">
            <KButton
               :icon="cmsIcon('arrow-path')"
               size="xs"
               variant="ghost"
               tone="neutral"
               aria-label="Replace"
               @click="openGallery"
            />
            <KButton
               :icon="cmsIcon('trash')"
               size="xs"
               variant="ghost"
               tone="danger"
               aria-label="Remove"
               @click="clear"
            />
         </KStack>
      </div>
   </KCard>

   <button v-else type="button" class="cms-media-single-add" @click="openGallery">
      <KIcon :name="cmsIcon('photo')" />
      <span>Choose</span>
   </button>

   <p v-if="missing" class="cms-media-missing">
      <KIcon :name="cmsIcon('exclamation-triangle')" />
      <span>Not found in the media library</span>
   </p>

   <KModal v-model:open="galleryOpen" title="Media" size="lg">
      <CmsMediaGallery
         v-model:folder="pickerFolder"
         selectable
         :media-type="mediaType"
         :accept="accept"
         @select="onSelect"
      />
   </KModal>
</template>

<script setup lang="ts">
import type { MediaType } from '#nuxt-cms'
import { computed, ref, useState } from '#imports'
import {
   Button as KButton,
   Card as KCard,
   Icon as KIcon,
   Modal as KModal,
   Stack as KStack,
} from '@xleddyl/443-components-vue'
import { mediaFilename, mediaIconFor, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsMediaKeys } from '../../composables/cms-media-keys'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

defineProps<{
   mediaType?: MediaType | MediaType[]
   accept?: string[]
}>()

const model = defineModel<string | null>({ required: true })

const { mediaBaseUrl } = useCmsRuntime()
const mediaKeys = useCmsMediaKeys()

const galleryOpen = ref(false)
const pickerFolder = useState<string | null>('cms-media-picker-folder', () => null)

function onSelect(item: { key: string }) {
   mediaKeys.remember(item.key)
   model.value = item.key
   galleryOpen.value = false
}

function openGallery() {
   galleryOpen.value = true
}

function clear() {
   model.value = null
}

const missing = computed(() => mediaKeys.isMissing(model.value))
const url = computed(() => (model.value ? mediaPublicUrl(mediaBaseUrl, model.value) : null))
const kind = computed(() => (model.value ? mediaTypeForKey(model.value) : 'file'))
const icon = computed(() => mediaIconFor(kind.value))
</script>
