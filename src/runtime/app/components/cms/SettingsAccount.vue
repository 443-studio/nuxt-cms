<template>
   <KAlert v-if="isSuperAdmin" tone="neutral" title="Environment account">
      This account signs in with the credentials of the environment variables (NUXT_CMS_ADMIN_EMAIL
      and NUXT_CMS_ADMIN_PASSWORD). Change them there. It holds every permission and cannot be
      removed or locked out from the panel.
   </KAlert>

   <template v-else>
      <KSettingsGroup label="Profile" description="The name shows in the sidebar.">
         <template #actions>
            <KButton
               variant="soft"
               tone="neutral"
               type="submit"
               size="sm"
               :form="profileFormId"
               :loading="profileForm.submitting.value"
               :disabled="profile.name === (user?.name ?? '')"
            >
               Save
            </KButton>
         </template>
         <KForm :id="profileFormId" :form="profileForm">
            <KGrid :columns="{ base: 1, sm: 2 }">
               <KFormField label="Name" name="name">
                  <KInput v-model="profile.name" placeholder="Your name" autocomplete="name" />
               </KFormField>
               <KFormField label="Email">
                  <KInput :model-value="email" type="email" disabled />
               </KFormField>
            </KGrid>
         </KForm>
      </KSettingsGroup>

      <KSettingsGroup
         label="Password"
         :description="`At least ${MIN_PASSWORD_LENGTH} characters. Use the generate button to create one.`"
      >
         <template #actions>
            <KButton
               variant="soft"
               tone="neutral"
               type="submit"
               size="sm"
               :form="passwordFormId"
               :loading="passwordForm.submitting.value"
            >
               Change password
            </KButton>
         </template>
         <KForm :id="passwordFormId" :form="passwordForm">
            <KFormField label="Current password" name="currentPassword" required>
               <KPasswordInput
                  v-model="password.currentPassword"
                  autocomplete="current-password"
                  placeholder="••••••••"
               />
            </KFormField>
            <KFormField label="New password" name="newPassword" required>
               <KPasswordInput
                  v-model="password.newPassword"
                  autocomplete="new-password"
                  :generate="generatePassword"
                  copy
               />
            </KFormField>
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
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { ref, useId, watch } from '#imports'
import { generatePassword, useCmsAccount } from '../../composables/cms-account'
import { cmsApi } from '../../utils/api'

const { user, email, isSuperAdmin, refresh } = useCmsAccount()
const profileFormId = useId()
const passwordFormId = useId()

const profile = ref({ name: user.value?.name ?? '' })

const profileForm = useForm({
   values: profile,
   schema: { name: { maxLength: 120 } },
   onSubmit: async (values) => {
      await cmsApi('/api/cms/account', { method: 'PUT', body: { name: values.name || null } })
      await refresh()
      toast.success('Profile saved')
   },
})

watch(
   () => user.value?.name,
   (name) => profileForm.reset({ name: name ?? '' })
)

const password = ref({ currentPassword: '', newPassword: '' })

const passwordForm = useForm({
   values: password,
   schema: {
      currentPassword: { required: true },
      newPassword: { required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 256 },
   },
   onSubmit: async (values) => {
      await cmsApi('/api/cms/account/password', { method: 'PUT', body: values })
      passwordForm.reset({ currentPassword: '', newPassword: '' })
      toast.success('Password changed')
   },
})
</script>
