<template>
   <KForm :id="formId" :form="form">
      <KGrid :columns="{ base: 1, sm: 2 }">
         <KFormField label="From" name="from" required>
            <KInput v-model="draft.from" placeholder="/old-page" autocomplete="off" />
         </KFormField>
         <KFormField label="To" name="to" required>
            <KInput
               v-model="draft.to"
               placeholder="/new-page or https://example.com"
               autocomplete="off"
            />
         </KFormField>
      </KGrid>
      <KGrid :columns="{ base: 1, sm: 2 }">
         <KFormField label="Status" name="status">
            <KSelect v-model="draft.status" :options="REDIRECT_STATUS_OPTIONS" />
         </KFormField>
         <KFormField label="Query string" name="keepQuery">
            <KSwitch v-model="draft.keepQuery" label="Keep the visitor's query" />
         </KFormField>
      </KGrid>
   </KForm>
</template>

<script setup lang="ts">
import type { CmsRedirect, CmsRedirectStatus } from '#nuxt-cms'
import { redirectFromErrors, redirectToErrors } from '#nuxt-cms'
import {
   Form as KForm,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   Select as KSelect,
   Switch as KSwitch,
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { ref } from '#imports'
import { useCmsSettingsForm } from '../../composables/cms-settings-form'
import { cmsApi } from '../../utils/api'
import { REDIRECT_STATUS_OPTIONS } from '../../utils/redirects'

const props = defineProps<{ redirect?: CmsRedirect }>()
const emit = defineEmits<{ saved: [redirect: CmsRedirect] }>()

const draft = ref({
   from: props.redirect?.from ?? '',
   to: props.redirect?.to ?? '',
   status: (props.redirect?.status ?? 301) as CmsRedirectStatus,
   keepQuery: props.redirect?.keepQuery ?? true,
})

const form = useForm({
   values: draft,
   schema: {
      from: { required: true, validate: (value: string) => redirectFromErrors(value.trim())[0] },
      to: { required: true, validate: (value: string) => redirectToErrors(value.trim())[0] },
   },
   onSubmit: async (values) => {
      const creating = !props.redirect
      const saved = await cmsApi<CmsRedirect>(
         creating ? '/api/cms/redirects' : `/api/cms/redirects/${props.redirect!.id}`,
         {
            method: creating ? 'POST' : 'PUT',
            body: {
               from: values.from.trim(),
               to: values.to.trim(),
               status: values.status,
               keepQuery: values.keepQuery,
            },
         }
      )
      toast.success(creating ? 'Redirect added' : 'Redirect saved')
      emit('saved', saved)
   },
})

const formId = useCmsSettingsForm({ creating: () => !props.redirect, submitting: form.submitting })
</script>
