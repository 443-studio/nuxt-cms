<template>
   <KStack gap="sm">
      <KTree
         v-if="rows.length"
         :nodes="nodes"
         :selectable="false"
         size="sm"
         :label="field.label"
         @select="(node: TreeNode) => emit('select', Number(node.id))"
      >
         <template #meta="{ node }">
            <KIcon
               v-if="rows[Number(node.id)]?.hidden"
               :name="cmsIcon('eye-slash')"
               label="Hidden"
            />
         </template>
      </KTree>
      <div v-if="!readonly">
         <KButton
            :icon="cmsIcon('plus')"
            label="Add a block"
            size="sm"
            variant="soft"
            tone="neutral"
            aria-haspopup="dialog"
            :disabled="!canAdd"
            :tooltip="canAdd ? undefined : full"
            @click="(event: MouseEvent) => emit('insert', event.currentTarget as HTMLElement)"
         />
      </div>
      <KFieldMessage v-else-if="!rows.length" tone="neutral" :icon="false" message="No blocks." />
   </KStack>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { canAddBlock, isHiddenBlock } from '#nuxt-cms'
import type { TreeNode } from '@xleddyl/443-components-vue'
import {
   Button as KButton,
   FieldMessage as KFieldMessage,
   Icon as KIcon,
   Stack as KStack,
   Tree as KTree,
} from '@xleddyl/443-components-vue'
import { computed } from '#imports'
import type { CmsBlockValue } from '../../../shared/preview'
import { blockSummary } from '../../../shared/preview'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{
   field: FieldConfig
   items: unknown
   locale: string
   invalid: (index: number) => boolean
   readonly?: boolean
}>()

const emit = defineEmits<{ select: [index: number]; insert: [anchor: HTMLElement] }>()

const { i18n } = useCmsRuntime()

const list = computed(() => (Array.isArray(props.items) ? (props.items as CmsBlockValue[]) : []))

const rows = computed(() =>
   list.value.map((item, index) => {
      const block = props.field.blocks?.[String(item.type)]
      return {
         index,
         label: block?.label ?? String(item.type),
         icon: block?.icon ?? 'rectangle-stack',
         summary: blockSummary(block, item, props.locale, i18n.defaultLocale, 60),
         hidden: isHiddenBlock(item),
         invalid: props.invalid(index),
      }
   })
)

const nodes = computed<TreeNode[]>(() =>
   rows.value.map((row) => ({
      id: row.index,
      label: row.label,
      description: row.summary || undefined,
      descriptionVariant: 'text',
      icon: cmsIcon(row.icon),
      invalid: row.invalid,
   }))
)

const canAdd = computed(() => canAddBlock(props.field, list.value.length))

const full = computed(() => {
   const max = props.field.max ?? 0
   return `This field holds at most ${max} ${max === 1 ? 'block' : 'blocks'}.`
})
</script>
