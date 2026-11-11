<template>
   <KDropdownMenu v-if="items.length" :items="items" placement="bottom-end">
      <KButton
         :icon="cmsIcon('ellipsis-horizontal')"
         :size="size"
         variant="ghost"
         tone="neutral"
         aria-label="More actions"
         title="More actions"
      />
   </KDropdownMenu>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { Button as KButton, DropdownMenu as KDropdownMenu } from '@xleddyl/443-components-vue'
import { useCmsTranslationActions } from '../../composables/cms-translation-actions'
import { cmsIcon } from '../../utils/ui'

const props = defineProps<{
   fields: Record<string, FieldConfig>
   disabled?: boolean
   size?: 'sm' | 'md'
}>()

const state = defineModel<Record<string, unknown>>({ required: true })

const { items } = useCmsTranslationActions({
   fields: () => props.fields,
   state,
   disabled: () => props.disabled,
})
</script>
