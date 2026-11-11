<template>
   <div class="cms-nested-blocks">
      <ul v-if="rows.length" class="cms-nested-blocks-list" role="list">
         <li v-for="row in rows" :key="row.index">
            <button
               type="button"
               class="cms-nested-block"
               :aria-label="`Edit ${row.label}${row.invalid ? ', has errors' : ''}`"
               @click="emit('select', row.index)"
            >
               <KIcon :name="cmsIcon(row.icon)" class="cms-nested-block-icon" />
               <span class="cms-nested-block-text" :class="{ 'is-hidden': row.hidden }">
                  <span class="cms-block-tree-label">{{ row.label }}</span>
                  <span v-if="row.summary" class="cms-block-tree-summary">{{ row.summary }}</span>
               </span>
               <span v-if="row.invalid" class="cms-nested-block-invalid" aria-hidden="true" />
               <KIcon
                  v-if="row.hidden"
                  :name="cmsIcon('eye-slash')"
                  class="cms-block-tree-hidden"
               />
               <KIcon :name="cmsIcon('chevron-right')" class="cms-nested-block-chevron" />
            </button>
         </li>
      </ul>
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
      <p v-else-if="!rows.length" class="cms-field-hint">No blocks.</p>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { canAddBlock, isHiddenBlock } from '#nuxt-cms'
import { Button as KButton, Icon as KIcon } from '@xleddyl/443-components-vue'
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

const canAdd = computed(() => canAddBlock(props.field, list.value.length))

const full = computed(() => {
   const max = props.field.max ?? 0
   return `This field holds at most ${max} ${max === 1 ? 'block' : 'blocks'}.`
})
</script>
