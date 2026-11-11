<template>
   <div ref="root" class="cms-picker" @keydown="onKeydown">
      <KInput
         v-model="query"
         :icon="cmsIcon('magnifying-glass')"
         size="sm"
         placeholder="Search blocks"
         aria-label="Search blocks"
         role="combobox"
         aria-autocomplete="list"
         aria-expanded="true"
         :aria-controls="listId"
         :aria-activedescendant="activeId"
         autofocus
         no-autofill
      />
      <p v-if="disabledReason" class="cms-field-hint">{{ disabledReason }}</p>
      <div :id="listId" ref="list" class="cms-picker-list" role="listbox" :aria-label="label">
         <div
            v-for="group in sections"
            :key="group.id"
            role="group"
            class="cms-picker-group"
            :aria-labelledby="group.label ? `${listId}-${group.id}` : undefined"
         >
            <div v-if="group.label" :id="`${listId}-${group.id}`" class="cms-picker-heading">
               {{ group.label }}
            </div>
            <div
               v-for="option in group.options"
               :id="optionId(option.index)"
               :key="option.key"
               role="option"
               class="cms-picker-item"
               :class="{ 'is-active': option.index === active, 'is-paste': option.paste }"
               :aria-selected="option.index === active ? 'true' : 'false'"
               :aria-disabled="option.disabled ? 'true' : undefined"
               @pointermove="option.disabled || (active = option.index)"
               @click="choose(option.index)"
            >
               <span class="cms-picker-icon">
                  <KIcon :name="cmsIcon(option.icon)" />
               </span>
               <span class="cms-picker-text">
                  <span class="cms-picker-label">{{ option.label }}</span>
                  <span v-if="option.description" class="cms-picker-description">
                     {{ option.description }}
                  </span>
               </span>
            </div>
         </div>
         <p v-if="!options.length" class="cms-picker-empty">No block matches "{{ query }}".</p>
      </div>
   </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '#nuxt-cms'
import { Icon as KIcon, Input as KInput } from '@xleddyl/443-components-vue'
import { computed, nextTick, onMounted, ref, useId, watch } from '#imports'
import { blockPickerGroups, nextPickerIndex } from '../../../shared/block-picker'
import { cmsIcon } from '../../utils/ui'

interface Option {
   key: string
   index: number
   type: string | null
   paste: boolean
   label: string
   description?: string
   icon: string
   disabled: boolean
}

const props = withDefaults(
   defineProps<{
      blocks: Record<string, BlockConfig>
      disabledReason?: string
      pasteCount?: number
      label?: string
   }>(),
   { disabledReason: undefined, pasteCount: 0, label: 'Available blocks' }
)

const emit = defineEmits<{ pick: [type: string]; paste: [] }>()

const listId = `${useId()}-blocks`
const root = ref<HTMLElement | null>(null)
const list = ref<HTMLElement | null>(null)
const query = ref('')
const active = ref(-1)

const sections = computed(() => {
   const disabled = !!props.disabledReason
   const result: { id: string; label: string | null; options: Option[] }[] = []
   let index = 0
   if (props.pasteCount > 0 && !query.value.trim()) {
      const count = props.pasteCount
      result.push({
         id: 'clipboard',
         label: null,
         options: [
            {
               key: 'paste',
               index: index++,
               type: null,
               paste: true,
               label: `Paste ${count} ${count === 1 ? 'block' : 'blocks'}`,
               description: 'From the clipboard',
               icon: 'clipboard',
               disabled,
            },
         ],
      })
   }
   for (const group of blockPickerGroups(props.blocks, query.value, () => disabled)) {
      result.push({
         id: `group-${group.id}`,
         label: group.label,
         options: group.items.map((item) => ({
            key: item.type,
            index: index++,
            type: item.type,
            paste: false,
            label: item.label,
            description: item.description,
            icon: item.icon,
            disabled: item.disabled,
         })),
      })
   }
   return result
})

const options = computed(() => sections.value.flatMap((section) => section.options))

const activeId = computed(() => (active.value >= 0 ? optionId(active.value) : undefined))

function optionId(index: number) {
   return `${listId}-option-${index}`
}

function firstEnabled() {
   return nextPickerIndex(options.value, -1, 1)
}

watch(options, () => {
   const current = options.value[active.value]
   if (!current || current.disabled) active.value = firstEnabled()
})

watch(query, () => {
   active.value = firstEnabled()
})

watch(active, async (index) => {
   await nextTick()
   const option = index >= 0 ? document.getElementById(optionId(index)) : null
   if (option && list.value?.contains(option)) option.scrollIntoView({ block: 'nearest' })
})

function choose(index: number) {
   const option = options.value[index]
   if (!option || option.disabled) return
   if (option.paste) emit('paste')
   else if (option.type) emit('pick', option.type)
}

function onKeydown(event: KeyboardEvent) {
   if (event.key === 'Escape') return
   event.stopPropagation()
   if (event.isComposing) return
   if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = nextPickerIndex(options.value, active.value, event.key === 'ArrowDown' ? 1 : -1)
      if (next !== -1) active.value = next
   } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(active.value)
   }
}

onMounted(async () => {
   active.value = firstEnabled()
   await nextTick()
   root.value?.querySelector('input')?.focus({ preventScroll: true })
})
</script>
