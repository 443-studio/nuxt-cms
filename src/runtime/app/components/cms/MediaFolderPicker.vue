<template>
   <KTreeSelect
      v-model="selected"
      :nodes="nodes"
      :icon="cmsIcon(model === null ? 'home' : 'folder')"
      :aria-label="label"
      search-placeholder="Find a folder…"
      empty-text="No matching folders"
   />
</template>

<script setup lang="ts">
import type { TreeNode } from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import { TreeSelect as KTreeSelect } from '@xleddyl/443-components-vue'
import { isWithinMediaFolder, mediaFolderName, mediaFolderParent } from '#nuxt-cms'
import { cmsIcon } from '../../utils/ui'

const ROOT_ID = ':root'

const props = defineProps<{
   folders: string[]
   exclude?: string | null
   label?: string
}>()

const model = defineModel<string | null>({ default: null })

function folderNodes(parent: string | null): TreeNode[] {
   return props.folders
      .filter((folder) => mediaFolderParent(folder) === parent)
      .map((folder) => {
         const children = folderNodes(folder)
         return {
            id: folder,
            label: mediaFolderName(folder),
            icon: cmsIcon('folder'),
            disabled: !!props.exclude && isWithinMediaFolder(folder, props.exclude),
            children: children.length ? children : undefined,
         }
      })
}

const nodes = computed<TreeNode[]>(() => [
   { id: ROOT_ID, label: 'Library root', icon: cmsIcon('home') },
   ...folderNodes(null),
])

const selected = computed<TreeNode['id'] | null>({
   get: () => (model.value === null ? ROOT_ID : model.value),
   set: (id) => {
      if (id === null || id === undefined) return
      model.value = id === ROOT_ID ? null : String(id)
   },
})
</script>
