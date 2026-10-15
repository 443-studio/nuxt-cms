<template>
   <KDrawer
      :open="!!item"
      :title="shown ? mediaFilename(shown.key) : ''"
      size="lg"
      @update:open="(value) => !value && emit('close')"
   >
      <div v-if="shown" class="cms-media-detail">
         <div class="cms-media-detail-preview">
            <img
               v-if="shown.type === 'image' && shown.url"
               :src="shown.url"
               :alt="shown.alt ?? ''"
            />
            <video
               v-else-if="shown.type === 'video' && shown.url"
               :src="shown.url"
               controls
               preload="metadata"
               playsinline
            />
            <KIcon v-else :name="cmsIcon(mediaIconFor(shown.type))" />
         </div>

         <KStack direction="row" gap="sm" align="center" wrap>
            <template v-if="absoluteUrl">
               <KCopyButton
                  :value="absoluteUrl"
                  label="Copy URL"
                  copied-label="Copied"
                  show-label
                  variant="soft"
                  tone="neutral"
                  size="sm"
               />
               <KButton
                  :href="shown.url ?? undefined"
                  target="_blank"
                  label="Open"
                  :icon="cmsIcon('arrow-top-right-on-square')"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
               />
            </template>
            <KButton
               :href="downloadHref"
               download
               label="Download"
               :icon="cmsIcon('arrow-down-tray')"
               variant="ghost"
               tone="neutral"
               size="sm"
            />
         </KStack>

         <div class="cms-media-detail-facts">
            <KDescriptionList :items="facts">
               <template #value="{ item: fact }">
                  <span
                     class="cms-media-detail-fact"
                     :class="{ 'k-mono': fact.key === 'key' }"
                     :title="fact.value == null ? undefined : String(fact.value)"
                     >{{ fact.value }}</span
                  >
               </template>
            </KDescriptionList>
         </div>

         <KStack gap="md">
            <KFormField label="Alt text">
               <KInput
                  v-model="alt"
                  placeholder="Describe the image for screen readers"
                  @keydown.enter.prevent="save"
               />
            </KFormField>
            <KFormField v-if="!readOnly" label="Folder">
               <CmsMediaFolderPicker v-model="folder" :folders="folders" />
            </KFormField>
         </KStack>

         <section class="cms-media-detail-usage">
            <h3 class="cms-media-section-title">Used in</h3>
            <div v-if="usageLoading" class="cms-media-loading">
               <KSpinner size="sm" />
            </div>
            <p v-else-if="usageList === null" class="cms-media-hint">
               Could not check where this file is used.
            </p>
            <p v-else-if="!usageList.length" class="cms-media-hint">Not used in any entry.</p>
            <ul v-else class="cms-media-usage-list">
               <li v-for="(entry, index) in usageList" :key="index">
                  <NuxtLink
                     :to="usageLink(entry)"
                     class="cms-media-usage-link"
                     @click="emit('close')"
                  >
                     <span class="cms-media-usage-title">{{ entry.title ?? entry.label }}</span>
                     <span class="cms-media-usage-meta">{{ entry.label }} · {{ entry.field }}</span>
                  </NuxtLink>
               </li>
            </ul>
         </section>
      </div>

      <template #footer>
         <KButton
            v-if="!readOnly"
            label="Delete"
            :icon="cmsIcon('trash')"
            variant="ghost"
            tone="danger"
            @click="item && emit('delete', item)"
         />
         <span v-else />
         <KStack direction="row" gap="sm" align="center">
            <KButton label="Close" variant="ghost" tone="neutral" @click="emit('close')" />
            <KButton label="Save" :loading="saving" :disabled="!dirty" @click="save" />
         </KStack>
      </template>
   </KDrawer>
</template>

<script setup lang="ts">
import type { MediaItem, MediaUsage } from '#nuxt-cms'
import { computed, ref, useRequestURL, watch } from '#imports'
import {
   Button as KButton,
   CopyButton as KCopyButton,
   DescriptionList as KDescriptionList,
   Drawer as KDrawer,
   FormField as KFormField,
   Icon as KIcon,
   Input as KInput,
   Spinner as KSpinner,
   Stack as KStack,
} from '@xleddyl/443-components-vue'
import { formatFileSize, mediaFilename, mediaIconFor } from '#nuxt-cms'
import type { CmsMediaLibrary } from '../../composables/cms-media-library'
import { usageLink } from '../../composables/cms-media-library'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{
   item: MediaItem | null
   library: CmsMediaLibrary
   readOnly: boolean
}>()

const emit = defineEmits<{ close: []; delete: [item: MediaItem] }>()

const folders = computed(() => props.library.folders.value)

const alt = ref('')
const folder = ref<string | null>(null)
const saving = ref(false)
const usageList = ref<MediaUsage[] | null>([])
const usageLoading = ref(false)
const requestUrl = useRequestURL()
const lastItem = ref<MediaItem | null>(props.item)

watch(
   () => props.item,
   (value) => {
      if (value) lastItem.value = value
   }
)

const shown = computed(() => props.item ?? lastItem.value)

watch(
   () => props.item?.key,
   async (key) => {
      if (!props.item || !key) return
      alt.value = props.item.alt ?? ''
      folder.value = props.item.folder ?? null
      usageLoading.value = true
      const usage = await props.library.usage([key])
      if (props.item?.key !== key) return
      usageList.value = usage ? usage[key] ?? [] : null
      usageLoading.value = false
   },
   { immediate: true }
)

const dirty = computed(() => {
   if (!props.item) return false
   return (
      (alt.value.trim() || null) !== (props.item.alt ?? null) ||
      (!props.readOnly && folder.value !== (props.item.folder ?? null))
   )
})

const downloadHref = computed(() =>
   shown.value ? `/api/cms/admin/media/download?key=${encodeURIComponent(shown.value.key)}` : ''
)

const absoluteUrl = computed(() =>
   shown.value?.url ? new URL(shown.value.url, requestUrl.origin).toString() : null
)

const facts = computed(() => {
   const item = shown.value
   if (!item) return []
   const list: { key: string; label: string; value: string }[] = [
      { key: 'folder', label: 'Folder', value: item.folder ?? 'Library root' },
      { key: 'type', label: 'Type', value: item.mime ?? item.type },
   ]
   if (item.size != null) {
      list.push({ key: 'size', label: 'Size', value: formatFileSize(item.size) })
   }
   if (item.width && item.height) {
      list.push({ key: 'dimensions', label: 'Dimensions', value: `${item.width} × ${item.height}` })
   }
   if (item.createdAt) {
      list.push({
         key: 'uploaded',
         label: 'Uploaded',
         value: new Date(item.createdAt).toLocaleString(),
      })
   }
   list.push({ key: 'key', label: 'Key', value: item.key })
   return list
})

async function save() {
   if (!props.item || !dirty.value || saving.value) return
   saving.value = true
   const ok = await props.library.updateItem(props.item.key, {
      alt: alt.value.trim() || null,
      ...(props.readOnly ? {} : { folder: folder.value }),
   })
   saving.value = false
   if (ok) emit('close')
}
</script>
