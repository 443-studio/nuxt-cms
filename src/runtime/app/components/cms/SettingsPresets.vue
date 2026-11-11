<template>
   <KSpinner v-if="loading" />

   <ul v-else-if="presets.length" class="cms-preset-list">
      <li v-for="preset in presets" :key="preset.id" class="cms-preset-row">
         <div class="cms-preset-main">
            <KIcon :name="cmsIcon(CMS_PRESET_ICON)" class="cms-settings-item-icon" />
            <div class="cms-preset-text">
               <span class="cms-preset-name">{{ preset.name }}</span>
               <span class="cms-preset-meta">{{ metaOf(preset) }}</span>
               <span v-if="preset.description" class="cms-preset-meta">
                  {{ preset.description }}
               </span>
            </div>
            <KStack direction="row" gap="none">
               <KButton
                  :icon="cmsIcon('pencil-square')"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  title="Rename preset"
                  :aria-label="`Rename ${preset.name}`"
                  @click="editing = preset"
               />
               <KButton
                  :icon="cmsIcon('trash')"
                  variant="ghost"
                  tone="danger"
                  size="sm"
                  title="Delete preset"
                  :aria-label="`Delete ${preset.name}`"
                  @click="remove(preset)"
               />
            </KStack>
         </div>
      </li>
   </ul>

   <KEmptyState
      v-else
      :icon="cmsIcon(CMS_PRESET_ICON)"
      title="No presets yet"
      description="Use Save as preset in the menu of a block to keep a copy of it here."
   />

   <CmsPresetModal
      :open="!!editing"
      title="Rename preset"
      :initial="editing"
      :save="rename"
      @update:open="(value: boolean) => value || (editing = null)"
   />
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { entryFieldsFor } from '#nuxt-cms'
import {
   Button as KButton,
   EmptyState as KEmptyState,
   Icon as KIcon,
   Spinner as KSpinner,
   Stack as KStack,
} from '@xleddyl/443-components-vue'
import { onMounted, ref } from '#imports'
import cmsConfig from '#cms-config'
import type { CmsBlockPreset, CmsPresetDetails } from '../../../shared/presets'
import { CMS_PRESET_ICON, presetBlockCount } from '../../../shared/presets'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsPresetLibrary } from '../../composables/cms-presets'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsIcon, errorMessage } from '../../utils/ui'

const toast = useCmsToast()
const confirmAction = useCmsConfirm()
const library = useCmsPresetLibrary()

const presets = ref<CmsBlockPreset[]>([])
const loading = ref(true)
const editing = ref<CmsBlockPreset | null>(null)

async function load() {
   try {
      presets.value = await library.list()
   } catch (error) {
      toast.add({
         title: 'Could not load presets',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      loading.value = false
   }
}

onMounted(load)

function sourceLabel(source: string) {
   const [entryName = '', fieldKey = ''] = source.split('.')
   const entry = Object.hasOwn(cmsConfig, entryName)
      ? (cmsConfig as Record<string, CmsEntry>)[entryName]
      : undefined
   if (!entry) return source
   const field = entryFieldsFor(entry)[fieldKey]
   return field ? `${entry.label}, ${field.label}` : entry.label
}

function metaOf(preset: CmsBlockPreset) {
   return `${presetBlockCount(preset.items.length)} · Saved from ${sourceLabel(preset.source)}`
}

async function rename(details: CmsPresetDetails) {
   const current = editing.value
   if (!current) return
   const updated = await library.update(current.id, details)
   presets.value = presets.value.map((preset) => (preset.id === updated.id ? updated : preset))
   toast.add({ title: 'Preset renamed', color: 'success' })
}

async function remove(preset: CmsBlockPreset) {
   const confirmed = await confirmAction(
      `Delete the preset "${preset.name}"? Blocks already inserted from it stay as they are.`,
      { confirmLabel: 'Delete' }
   )
   if (!confirmed) return
   try {
      await library.remove(preset.id)
      presets.value = presets.value.filter((candidate) => candidate.id !== preset.id)
      toast.add({ title: 'Preset deleted', color: 'success' })
   } catch (error) {
      toast.add({ title: 'Preset not deleted', description: errorMessage(error), color: 'error' })
   }
}
</script>
