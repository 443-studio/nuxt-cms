<template>
   <KFormModal
      v-model:open="open"
      :title="title"
      size="sm"
      :form="form"
      :submit-label="submitLabel"
      :submit-icon="cmsIcon(CMS_PRESET_ICON)"
      creating
      nested
   >
      <div class="cms-stack">
         <p v-if="hint" class="cms-hint">{{ hint }}</p>
         <KFormField label="Name" name="name" required>
            <KInput
               v-model="draft.name"
               :maxlength="CMS_PRESET_NAME_MAX"
               placeholder="Article intro"
               autocomplete="off"
            />
         </KFormField>
         <KFormField label="Description" name="description">
            <KTextarea
               v-model="draft.description"
               :maxlength="CMS_PRESET_DESCRIPTION_MAX"
               :rows="3"
               placeholder="Optional"
            />
         </KFormField>
      </div>
   </KFormModal>
</template>

<script setup lang="ts">
import {
   FormField as KFormField,
   FormModal as KFormModal,
   Input as KInput,
   Textarea as KTextarea,
   useForm,
} from '@xleddyl/443-components-vue'
import { ref, watch } from '#imports'
import type { CmsPresetDetails } from '../../../shared/presets'
import {
   CMS_PRESET_DESCRIPTION_MAX,
   CMS_PRESET_ICON,
   CMS_PRESET_NAME_MAX,
} from '../../../shared/presets'
import { cmsIcon } from '../../utils/ui'

const props = withDefaults(
   defineProps<{
      title: string
      submitLabel?: string
      hint?: string
      save: (details: CmsPresetDetails) => Promise<void>
   }>(),
   { submitLabel: 'Save', hint: undefined }
)

const open = defineModel<boolean>('open', { default: false })

const draft = ref({ name: '', description: '' })

const form = useForm({
   values: draft,
   schema: {
      name: { required: true, maxLength: CMS_PRESET_NAME_MAX },
      description: { maxLength: CMS_PRESET_DESCRIPTION_MAX },
   },
   onSubmit: async (values) => {
      const description = values.description.trim()
      await props.save({ name: values.name.trim(), ...(description ? { description } : {}) })
      open.value = false
   },
})

watch(open, (value) => {
   if (value) form.reset({ name: '', description: '' })
})
</script>
