<template>
   <KRichTextEditor
      :model-value="model"
      :headings="[2, 3]"
      :toolbar="TOOLBAR"
      min-height="9rem"
      @update:model-value="(value) => (model = typeof value === 'string' ? value : null)"
   />
</template>

<script setup lang="ts">
import type { EditorToolbar } from '@xleddyl/443-components-vue/editor'
import { RichTextEditor as KRichTextEditor } from '@xleddyl/443-components-vue/editor'

const TOOLBAR: EditorToolbar = [
   'bold',
   'italic',
   'strike',
   '|',
   'headings',
   '|',
   'bulletList',
   'orderedList',
   'blockquote',
   'link',
   '|',
   'undo',
   'redo',
]

const model = defineModel<string | null>({ required: true })
</script>
