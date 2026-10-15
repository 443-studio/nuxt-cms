<template>
   <div class="cms-media-folder-picker">
      <KFieldBoundary v-if="folders.length > 8" auxiliary>
         <KInput
            v-model="query"
            size="sm"
            :icon="cmsIcon('magnifying-glass')"
            placeholder="Find a folder…"
            aria-label="Find a folder"
            clearable
         />
      </KFieldBoundary>
      <div class="cms-media-folder-picker-list">
         <KTree
            v-model:selected="selected"
            v-model:expanded="expanded"
            :nodes="nodes"
            :bordered="false"
            :label="label"
            size="sm"
            checkmark
            empty-text="No matching folders"
         />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { TreeNode } from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'
import {
   FieldBoundary as KFieldBoundary,
   Input as KInput,
   Tree as KTree,
} from '@xleddyl/443-components-vue'
import { isWithinMediaFolder, mediaFolderName, mediaFolderParent } from '#nuxt-cms'
import { cmsIcon } from '../../utils/ui'

const ROOT_ID = ':root'

const props = defineProps<{
   folders: string[]
   exclude?: string | null
   label?: string
}>()

const model = defineModel<string | null>({ default: null })

const query = ref('')
const term = computed(() => query.value.trim().toLowerCase())

const visible = computed(() =>
   term.value ? props.folders.filter((folder) => folder.includes(term.value)) : props.folders
)

function isDisabled(folder: string) {
   return !!props.exclude && isWithinMediaFolder(folder, props.exclude)
}

function folderNode(folder: string, label: string, children?: TreeNode[]): TreeNode {
   return {
      id: folder,
      label,
      icon: cmsIcon(model.value === folder ? 'folder-open' : 'folder'),
      disabled: isDisabled(folder),
      children: children?.length ? children : undefined,
   }
}

const nodes = computed<TreeNode[]>(() => {
   if (term.value) return visible.value.map((folder) => folderNode(folder, folder))
   const build = (parent: string | null): TreeNode[] =>
      props.folders
         .filter((folder) => mediaFolderParent(folder) === parent)
         .map((folder) => folderNode(folder, mediaFolderName(folder), build(folder)))
   return [{ id: ROOT_ID, label: 'Library root', icon: cmsIcon('home'), children: build(null) }]
})

const parentIds = computed(() => {
   const ids: TreeNode['id'][] = []
   const walk = (list: TreeNode[]) => {
      for (const node of list) {
         if (!node.children) continue
         ids.push(node.id)
         walk(node.children)
      }
   }
   walk(nodes.value)
   return ids
})

const collapsed = ref<TreeNode['id'][]>([])

const expanded = computed<TreeNode['id'][]>({
   get: () => parentIds.value.filter((id) => !collapsed.value.includes(id)),
   set: (ids) => {
      collapsed.value = parentIds.value.filter((id) => !ids.includes(id))
   },
})

const selected = computed<TreeNode['id'] | null>({
   get: () => (model.value === null ? ROOT_ID : model.value),
   set: (id) => {
      if (id === null) return
      model.value = id === ROOT_ID ? null : String(id)
   },
})
</script>
