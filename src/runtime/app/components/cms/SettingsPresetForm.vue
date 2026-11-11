<template>
   <KForm :id="formId" :form="form">
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
      <KFieldMessage tone="neutral" :icon="false" :message="presetMeta(preset)" />
   </KForm>
</template>

<script setup lang="ts">
import {
   FieldMessage as KFieldMessage,
   Form as KForm,
   FormField as KFormField,
   Input as KInput,
   Textarea as KTextarea,
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { ref } from '#imports'
import type { CmsBlockPreset } from '../../../shared/presets'
import { CMS_PRESET_DESCRIPTION_MAX, CMS_PRESET_NAME_MAX } from '../../../shared/presets'
import { presetMeta } from '../../composables/cms-settings-stores'
import { useCmsSettingsForm } from '../../composables/cms-settings-form'
import { cmsApi } from '../../utils/api'

const props = defineProps<{ preset: CmsBlockPreset }>()
const emit = defineEmits<{ saved: [preset: CmsBlockPreset] }>()

const draft = ref({ name: props.preset.name, description: props.preset.description ?? '' })

const form = useForm({
   values: draft,
   schema: {
      name: { required: true, maxLength: CMS_PRESET_NAME_MAX },
      description: { maxLength: CMS_PRESET_DESCRIPTION_MAX },
   },
   onSubmit: async (values) => {
      const description = values.description.trim()
      const saved = await cmsApi<CmsBlockPreset>(`/api/cms/presets/${props.preset.id}`, {
         method: 'PUT',
         body: { name: values.name.trim(), ...(description ? { description } : {}) },
      })
      toast.success('Preset saved')
      emit('saved', saved)
   },
})

const formId = useCmsSettingsForm({ submitting: form.submitting })
</script>
