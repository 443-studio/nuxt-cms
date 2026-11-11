<template>
   <KFormModal
      :open="open"
      size="sm"
      :title="`Welcome to ${cmsBrand.title}`"
      description="You signed in with a password that someone shared with you. Set your own password now, or keep this one. You can change it later in Settings, Account."
      :form="form"
      :guard="false"
      @update:open="(value: boolean) => !value && keep()"
   >
      <KFormField label="New password" name="password" required>
         <KPasswordInput
            v-model="draft.password"
            autocomplete="new-password"
            :generate="generatePassword"
            copy
         />
      </KFormField>
      <template #footer="{ submit }">
         <KButton variant="ghost" tone="neutral" :disabled="form.submitting.value" @click="keep">
            Keep current password
         </KButton>
         <KButton :loading="form.submitting.value" @click="submit">Set password</KButton>
      </template>
   </KFormModal>
</template>

<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import { cmsBrand } from '#cms-brand'
import {
   Button as KButton,
   FormField as KFormField,
   FormModal as KFormModal,
   PasswordInput as KPasswordInput,
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'
import { generatePassword, useCmsAccount } from '../../composables/cms-account'
import { cmsApi } from '../../utils/api'

const { user, refresh } = useCmsAccount()

const dismissed = ref(false)
const open = computed(() => !!user.value?.firstLogin && !dismissed.value)

const draft = ref({ password: '' })

const form = useForm({
   values: draft,
   schema: { password: { required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 256 } },
   guard: false,
   onSubmit: async (values) => {
      await cmsApi('/api/cms/account/password', {
         method: 'PUT',
         body: { newPassword: values.password },
      })
      dismissed.value = true
      await refresh()
      toast.success('Password set')
   },
})

async function keep() {
   dismissed.value = true
   await cmsApi('/api/cms/account/welcome', { method: 'POST' }).catch(() => undefined)
   await refresh()
}
</script>
