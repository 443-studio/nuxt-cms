<template>
   <KModal
      :open="open"
      size="sm"
      :title="`Welcome to ${cmsBrand.title}`"
      @update:open="(value) => !value && keep()"
   >
      <KForm :form="form">
         <p class="cms-settings-hint">
            You signed in with a password that someone shared with you. Set your own password now,
            or keep this one. You can change it later in Settings, Account.
         </p>
         <KFormField label="New password" name="password">
            <KPasswordInput
               v-model="form.values.password"
               icon="key"
               autocomplete="new-password"
               :generate="generatePassword"
               copy
            />
         </KFormField>
         <KStack direction="row" justify="end" gap="sm" wrap>
            <KButton
               label="Keep current password"
               variant="ghost"
               tone="neutral"
               :disabled="form.submitting.value"
               @click="keep"
            />
            <KButton
               type="submit"
               label="Set password"
               :disabled="(form.values.password ?? '').length < MIN_PASSWORD_LENGTH"
            />
         </KStack>
      </KForm>
   </KModal>
</template>

<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import { cmsBrand } from '#cms-brand'
import {
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Modal as KModal,
   PasswordInput as KPasswordInput,
   Stack as KStack,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'
import { generatePassword, useCmsAccount } from '../../composables/cms-account'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const { user, refresh } = useCmsAccount()
const toast = useCmsToast()

const dismissed = ref(false)
const open = computed(() => !!user.value?.firstLogin && !dismissed.value)

const form = useForm({
   schema: { password: { initial: (): string | null | undefined => '' } },
   onSubmit: save,
})

async function keep() {
   dismissed.value = true
   await cmsApi('/api/cms/account/welcome', { method: 'POST' }).catch(() => undefined)
   await refresh()
}

async function save(values: { password: string | null | undefined }) {
   try {
      await cmsApi('/api/cms/account/password', {
         method: 'PUT',
         body: { newPassword: values.password },
      })
      dismissed.value = true
      await refresh()
      toast.add({ title: 'Password set', color: 'success' })
   } catch (e) {
      form.setError('', errorMessage(e) ?? 'Password not set.')
   }
}
</script>
