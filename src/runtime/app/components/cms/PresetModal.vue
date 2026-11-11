<template>
   <KModal v-model:open="open" :title="title" size="sm">
      <KForm :id="formId" :form="form">
         <KStack gap="md">
            <p v-if="hint" class="cms-field-hint">{{ hint }}</p>
            <KFormField label="Name" name="name" required>
               <KInput
                  v-model="form.values.name"
                  :maxlength="CMS_PRESET_NAME_MAX"
                  placeholder="Article intro"
                  autocomplete="off"
               />
            </KFormField>
            <KFormField label="Description" name="description">
               <KTextarea
                  v-model="form.values.description"
                  :maxlength="CMS_PRESET_DESCRIPTION_MAX"
                  :rows="3"
                  placeholder="Optional"
               />
            </KFormField>
         </KStack>
      </KForm>
      <template #footer>
         <KStack direction="row" justify="end" gap="sm">
            <KButton label="Cancel" variant="ghost" tone="neutral" @click="open = false" />
            <KButton
               type="submit"
               :form="formId"
               :label="submitLabel"
               :loading="saving"
               :disabled="!String(form.values.name ?? '').trim()"
            />
         </KStack>
      </template>
   </KModal>
</template>

<script setup lang="ts">
import {
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Input as KInput,
   Modal as KModal,
   Stack as KStack,
   Textarea as KTextarea,
   useForm,
} from '@xleddyl/443-components-vue'
import { ref, useId, watch } from '#imports'
import type { CmsPresetDetails } from '../../../shared/presets'
import { CMS_PRESET_DESCRIPTION_MAX, CMS_PRESET_NAME_MAX } from '../../../shared/presets'
import { errorMessage } from '../../utils/ui'

const props = withDefaults(
   defineProps<{
      title: string
      submitLabel?: string
      hint?: string
      initial?: CmsPresetDetails | null
      save: (details: CmsPresetDetails) => Promise<void>
   }>(),
   { submitLabel: 'Save', hint: undefined, initial: null }
)

const open = defineModel<boolean>('open', { default: false })

const formId = `${useId()}-preset`
const saving = ref(false)

const form = useForm({
   schema: {
      name: { initial: (): string | null | undefined => '' },
      description: { initial: (): string | null | undefined => '' },
   },
   onSubmit: submit,
})

watch(
   open,
   (value) => {
      if (value)
         form.reset({
            name: props.initial?.name ?? '',
            description: props.initial?.description ?? '',
         })
   },
   { immediate: true }
)

async function submit(values: {
   name: string | null | undefined
   description: string | null | undefined
}) {
   const name = String(values.name ?? '').trim()
   const description = String(values.description ?? '').trim()
   if (!name) return
   saving.value = true
   try {
      await props.save({ name, ...(description ? { description } : {}) })
      open.value = false
   } catch (error) {
      form.setError('', errorMessage(error) ?? 'Preset not saved.')
   } finally {
      saving.value = false
   }
}
</script>
