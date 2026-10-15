<template>
   <KFileInput
      :accept="acceptAttr"
      accept-mode="hint"
      :multiple="multiple"
      :directory="directories ? 'drop' : false"
      :list="false"
      :loading="uploading"
      :icon="cmsIcon('cloud-arrow-up')"
      size="lg"
      skip-hidden
      @add="onAdd"
   >
      <template #title>
         {{
            uploading
               ? `Uploading ${Math.min(done + 1, total)} of ${total}…`
               : multiple
                 ? 'Drop files here or click to browse'
                 : 'Drop a file here or click to browse'
         }}
      </template>
      <template v-if="!uploading" #hint>
         <span class="cms-media-dropzone-hint">
            <KIcon :name="cmsIcon(folder ? 'folder' : 'circle-stack')" />
            {{ folder ?? 'Library root' }}
         </span>
      </template>
      <template v-if="directories && multiple && !uploading" #actions="{ browseDirectory }">
         <KButton
            label="Upload a folder"
            :icon="cmsIcon('folder-arrow-down')"
            variant="ghost"
            tone="neutral"
            size="sm"
            @click="browseDirectory"
         />
      </template>
   </KFileInput>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { mediaTypeAccept } from '#nuxt-cms'
import { computed } from '#imports'
import type { FileAddDetail } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   FileInput as KFileInput,
   Icon as KIcon,
} from '@xleddyl/443-components-vue'
import { cmsIcon } from '../../utils/ui'
import { uploadTreeFromEntries, useCmsMediaUploader } from '../../composables/cms-media-uploader'

const props = withDefaults(
   defineProps<{
      multiple?: boolean
      mediaType?: MediaType | MediaType[]
      accept?: string[]
      folder?: string | null
      directories?: boolean
   }>(),
   { mediaType: 'file', folder: null }
)

const emit = defineEmits<{ uploaded: [items: MediaItem[]] }>()

const { upload, uploading, done, total } = useCmsMediaUploader()

const acceptAttr = computed(
   () => (props.accept?.length ? props.accept : mediaTypeAccept(props.mediaType))?.join(',')
)

async function onAdd(_files: File[], detail: FileAddDetail) {
   const tree = uploadTreeFromEntries(detail.entries, props.directories ? detail.directories : [])
   const items = await upload(tree, {
      folder: props.folder,
      accept: acceptAttr.value,
      multiple: props.multiple,
   })
   if (items.length || tree.directories.length) emit('uploaded', items)
}
</script>
