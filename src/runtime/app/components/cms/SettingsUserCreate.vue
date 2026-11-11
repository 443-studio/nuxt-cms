<template>
   <KForm :id="formId" :form="form">
      <KGrid :columns="{ base: 1, sm: 2 }">
         <KFormField label="Email" name="email" required>
            <KInput
               v-model="draft.email"
               type="email"
               placeholder="name@example.com"
               autocomplete="off"
            />
         </KFormField>
         <KFormField label="Name" name="name">
            <KInput v-model="draft.name" placeholder="Optional" autocomplete="off" />
         </KFormField>
      </KGrid>
      <KFormField label="Role" name="role" required :description="roleDescription">
         <KSelect v-model="draft.role" :options="grantableOptions" />
      </KFormField>
      <KFormField label="Password" name="password" required>
         <KPasswordInput
            v-model="draft.password"
            autocomplete="new-password"
            :generate="generatePassword"
            copy
         />
      </KFormField>
   </KForm>
</template>

<script setup lang="ts">
import type { CmsAccount } from '#nuxt-cms'
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import {
   Form as KForm,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   PasswordInput as KPasswordInput,
   Select as KSelect,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'
import { generatePassword } from '../../composables/cms-account'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsSettingsForm } from '../../composables/cms-settings-form'
import { cmsApi } from '../../utils/api'

const emit = defineEmits<{ created: [account: CmsAccount, password: string] }>()

const { roleOptions, canGrant } = useCmsPermissions()

const grantableOptions = computed(() =>
   roleOptions
      .filter((option) => canGrant(option.key))
      .map((option) => ({ value: option.key, label: option.label }))
)

const draft = ref({
   email: '',
   name: '',
   role: grantableOptions.value[0]?.value ?? '',
   password: generatePassword(),
})

const roleDescription = computed(
   () => roleOptions.find((option) => option.key === draft.value.role)?.description ?? undefined
)

const form = useForm({
   values: draft,
   schema: {
      email: { required: true, maxLength: 254 },
      name: { maxLength: 120 },
      role: { required: true },
      password: { required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 256 },
   },
   onSubmit: async (values) => {
      const account = await cmsApi<CmsAccount>('/api/cms/users', {
         method: 'POST',
         body: {
            email: values.email.trim(),
            name: values.name.trim() || null,
            role: values.role,
            password: values.password,
         },
      })
      emit('created', account, values.password)
   },
})

const formId = useCmsSettingsForm({ creating: true, submitting: form.submitting })
</script>
