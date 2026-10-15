<template>
   <KAlert v-if="isSuperAdmin" tone="neutral" title="Environment account">
      This account signs in with the credentials of the environment variables (NUXT_CMS_ADMIN_EMAIL
      and NUXT_CMS_ADMIN_PASSWORD). Change them there. Only this account can manage users.
   </KAlert>

   <template v-else>
      <KSettingsGroup label="Profile" description="The name shows in the sidebar.">
         <KForm :form="profile">
            <KGrid :columns="2">
               <KFormField label="Name" name="name">
                  <KInput
                     v-model="profile.values.name"
                     placeholder="Your name"
                     autocomplete="name"
                  />
               </KFormField>
               <KFormField label="Email">
                  <KInput :model-value="email" disabled />
               </KFormField>
            </KGrid>
            <KStack direction="row" justify="end" gap="sm">
               <KButton
                  type="submit"
                  label="Save profile"
                  size="sm"
                  :disabled="profile.values.name === (user?.name ?? '')"
               />
            </KStack>
         </KForm>
      </KSettingsGroup>

      <KSettingsGroup
         label="Password"
         :description="`At least ${MIN_PASSWORD_LENGTH} characters. Use the generate button to create one.`"
      >
         <KForm :form="password">
            <KFormField label="Current password" name="current">
               <KPasswordInput
                  v-model="password.values.current"
                  icon="key"
                  autocomplete="current-password"
                  placeholder="••••••••"
               />
            </KFormField>
            <KFormField label="New password" name="next">
               <KPasswordInput
                  v-model="password.values.next"
                  icon="key"
                  autocomplete="new-password"
                  :generate="generatePassword"
                  copy
               />
            </KFormField>
            <KStack direction="row" justify="end" gap="sm">
               <KButton
                  type="submit"
                  label="Change password"
                  size="sm"
                  :disabled="
                     !password.values.current ||
                     (password.values.next ?? '').length < MIN_PASSWORD_LENGTH
                  "
               />
            </KStack>
         </KForm>
      </KSettingsGroup>
   </template>
</template>

<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import {
   Alert as KAlert,
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   PasswordInput as KPasswordInput,
   SettingsGroup as KSettingsGroup,
   Stack as KStack,
   useForm,
} from '@xleddyl/443-components-vue'
import { watch } from '#imports'
import { generatePassword, useCmsAccount } from '../../composables/cms-account'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const { user, email, isSuperAdmin, refresh } = useCmsAccount()
const toast = useCmsToast()

const profile = useForm({
   schema: { name: { initial: (): string => user.value?.name ?? '' } },
   onSubmit: saveProfile,
})

watch(
   () => user.value?.name,
   (name) => profile.reset({ name: name ?? '' })
)

async function saveProfile(values: { name: string }) {
   try {
      await cmsApi('/api/cms/account', {
         method: 'PUT',
         body: { name: values.name || null },
      })
      await refresh()
      toast.add({ title: 'Profile saved', color: 'success' })
   } catch (error) {
      toast.add({ title: 'Profile not saved', description: errorMessage(error), color: 'error' })
   }
}

const password = useForm({
   schema: {
      current: { initial: (): string | null | undefined => '' },
      next: { initial: (): string | null | undefined => '' },
   },
   onSubmit: savePassword,
})

async function savePassword(values: {
   current: string | null | undefined
   next: string | null | undefined
}) {
   try {
      await cmsApi('/api/cms/account/password', {
         method: 'PUT',
         body: { currentPassword: values.current, newPassword: values.next },
      })
      password.reset()
      toast.add({ title: 'Password changed', color: 'success' })
   } catch (error) {
      password.setError('', errorMessage(error) ?? 'Password not changed.')
   }
}
</script>
