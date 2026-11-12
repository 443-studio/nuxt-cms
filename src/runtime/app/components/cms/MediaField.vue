<template>
   <KCard
      v-if="model"
      variant="outline"
      padding="none"
      class="cms-media-single"
      :class="{ 'is-disabled': disabled }"
   >
      <button
         type="button"
         class="cms-tile-preview"
         aria-label="Replace media"
         :disabled="disabled || undefined"
         @click="openGallery"
      >
         <KThumbnail
            :src="url ?? undefined"
            :kind="kind"
            aspect="4/3"
            rounded="none"
            :missing="missing"
            missing-text="Not found in the media library"
         />
      </button>
      <div class="cms-tile-bar">
         <KTooltip :text="model">
            <span class="cms-tile-name">{{ mediaFilename(model) }}</span>
         </KTooltip>
         <KStack v-if="!disabled" direction="row" gap="none" align="center">
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

   <KCard
      v-else
      variant="dashed"
      as="button"
      :icon="cmsIcon('photo')"
      title="Choose"
      :disabled="disabled"
      class="cms-media-single-add"
      @click="openGallery"
   />

   <KFieldMessage v-if="missing" tone="warning" message="Not found in the media library" />

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
   FieldMessage as KFieldMessage,
   Modal as KModal,
   Stack as KStack,
   Thumbnail as KThumbnail,
   Tooltip as KTooltip,
   useFieldControl,
} from '@xleddyl/443-components-vue'
import { mediaFilename, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
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

const { disabled } = useFieldControl()

const galleryOpen = ref(false)
const pickerFolder = useState<string | null>('cms-media-picker-folder', () => null)

function onSelect(item: { key: string }) {
   mediaKeys.remember(item.key)
   model.value = item.key
   galleryOpen.value = false
}

function openGallery() {
   if (disabled.value) return
   galleryOpen.value = true
}

function clear() {
   if (disabled.value) return
   model.value = null
}

const missing = computed(() => mediaKeys.isMissing(model.value))
const url = computed(() => (model.value ? mediaPublicUrl(mediaBaseUrl, model.value) : null))
const kind = computed(() => (model.value ? mediaTypeForKey(model.value) : 'file'))
</script>
