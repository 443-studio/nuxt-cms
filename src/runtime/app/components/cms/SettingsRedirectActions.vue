<template>
   <CmsSettingsRecordActions v-bind="$attrs">
      <template #list>
         <KDropdownMenu :items="menuItems" placement="bottom-end" label="Import and export">
            <KButton
               icon="ellipsis-horizontal"
               variant="ghost"
               tone="neutral"
               size="sm"
               square
               aria-label="Import and export"
               :loading="store.importing.value"
            />
         </KDropdownMenu>
      </template>
   </CmsSettingsRecordActions>
</template>

<script setup lang="ts">
import type { MenuEntry } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   DropdownMenu as KDropdownMenu,
   useFileDialog,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { useCmsRedirects } from '../../composables/cms-settings-stores'
import { cmsIcon } from '../../utils/ui'
import CmsSettingsRecordActions from './SettingsRecordActions.vue'

defineOptions({ inheritAttrs: false })

const store = useCmsRedirects()
const fileDialog = useFileDialog({ accept: '.csv,.json,text/csv,application/json' })

async function importFile() {
   const [file] = await fileDialog.open()
   if (file) await store.importFile(file)
}

const empty = computed(() => !store.items.value.length)

const menuItems = computed<MenuEntry[]>(() => [
   {
      label: 'Import CSV or JSON',
      icon: cmsIcon('arrow-up-tray'),
      onSelect: () => void importFile(),
   },
   { type: 'separator' },
   {
      label: 'Export CSV',
      icon: cmsIcon('arrow-down-tray'),
      disabled: empty.value,
      disabledReason: 'No redirects to export',
      onSelect: store.exportCsv,
   },
   {
      label: 'Export JSON',
      icon: cmsIcon('arrow-down-tray'),
      disabled: empty.value,
      disabledReason: 'No redirects to export',
      onSelect: store.exportJson,
   },
])
</script>
