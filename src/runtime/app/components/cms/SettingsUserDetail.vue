<template>
   <div class="cms-stack is-loose">
      <KSettingsGroup label="Profile">
         <template v-if="editable" #actions>
            <KButton
               variant="soft"
               tone="neutral"
               type="submit"
               size="sm"
               :form="profileFormId"
               :loading="profileForm.submitting.value"
               :disabled="profile.name === (account.name ?? '')"
            >
               Save
            </KButton>
         </template>
         <KForm :id="profileFormId" :form="profileForm" :disabled="!editable || undefined">
            <div class="cms-form-grid">
               <KFormField label="Name" name="name" :hint="lockReason">
                  <KInput v-model="profile.name" placeholder="Optional" autocomplete="off" />
               </KFormField>
               <KFormField label="Email">
                  <KInput :model-value="account.email" type="email" disabled />
               </KFormField>
            </div>
         </KForm>
      </KSettingsGroup>

      <KSettingsGroup label="Role">
         <template v-if="editable && !self" #actions>
            <KButton
               variant="soft"
               tone="neutral"
               type="submit"
               size="sm"
               :form="roleFormId"
               :loading="roleForm.submitting.value"
               :disabled="role.role === account.role"
            >
               Save
            </KButton>
         </template>
         <KForm :id="roleFormId" :form="roleForm" :disabled="!editable || self || undefined">
            <KFormField
               label="Role"
               name="role"
               :hint="roleHint"
               :description="roleDescription"
               :warning="known ? undefined : UNKNOWN_ROLE_HINT"
            >
               <KSelect v-model="role.role" :options="roleChoices" />
            </KFormField>
         </KForm>
      </KSettingsGroup>

      <KSettingsGroup v-if="editable" label="Password">
         <template v-if="!newPassword" #actions>
            <KButton
               variant="soft"
               tone="neutral"
               type="submit"
               size="sm"
               :form="passwordFormId"
               :loading="passwordForm.submitting.value"
            >
               Set password
            </KButton>
         </template>
         <CmsSettingsSecretCard
            v-if="newPassword"
            title="Password changed"
            description="Share these credentials with the user. The password does not show again."
            :items="[
               { label: 'Email', value: account.email },
               { label: 'Password', value: newPassword },
            ]"
            @done="newPassword = null"
         />
         <KForm v-else :id="passwordFormId" :form="passwordForm">
            <KFormField label="New password" name="password" required>
               <KPasswordInput
                  v-model="password.password"
                  autocomplete="new-password"
                  :generate="generatePassword"
                  copy
               />
            </KFormField>
         </KForm>
      </KSettingsGroup>
   </div>
</template>

<script setup lang="ts">
import type { CmsAccount } from '#nuxt-cms'
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import {
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Input as KInput,
   PasswordInput as KPasswordInput,
   Select as KSelect,
   SettingsGroup as KSettingsGroup,
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, ref, useId } from '#imports'
import { generatePassword } from '../../composables/cms-account'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsUsers } from '../../composables/cms-settings-stores'
import { cmsApi } from '../../utils/api'
import { UNKNOWN_ROLE_HINT, isKnownRole } from '../../utils/users'

const props = defineProps<{ account: CmsAccount }>()
const emit = defineEmits<{ updated: [account: CmsAccount] }>()

const profileFormId = useId()
const roleFormId = useId()
const passwordFormId = useId()

const { roleOptions, roleLabel, canGrant } = useCmsPermissions()
const { canManageUser, isSelf } = useCmsUsers()

const editable = computed(() => canManageUser(props.account))
const self = computed(() => isSelf(props.account))
const known = computed(() => isKnownRole(props.account.role, roleOptions))
const lockReason = computed(() =>
   editable.value ? undefined : 'Your role cannot manage this account.'
)
const roleHint = computed(() =>
   editable.value && self.value ? 'You cannot change your own role.' : lockReason.value
)

const roleChoices = computed(() => {
   const options = roleOptions
      .filter((option) => canGrant(option.key) || option.key === props.account.role)
      .map((option) => ({ value: option.key, label: option.label }))
   return known.value
      ? options
      : [
           { value: props.account.role, label: `${props.account.role} (removed)`, disabled: true },
           ...options,
        ]
})

const roleDescription = computed(
   () => roleOptions.find((option) => option.key === role.value.role)?.description ?? undefined
)

async function update(body: Record<string, unknown>) {
   const account = await cmsApi<CmsAccount>(`/api/cms/users/${props.account.id}`, {
      method: 'PUT',
      body,
   })
   emit('updated', account)
   return account
}

const profile = ref({ name: props.account.name ?? '' })
const profileForm = useForm({
   values: profile,
   schema: { name: { maxLength: 120 } },
   onSubmit: async (values) => {
      await update({ name: values.name.trim() || null })
      toast.success('Profile saved')
   },
})

const role = ref({ role: props.account.role })
const roleForm = useForm({
   values: role,
   schema: { role: { required: true } },
   onSubmit: async (values) => {
      const account = await update({ role: values.role })
      toast.success(`${account.email} is now ${roleLabel(account.role)}`)
   },
})

const password = ref({ password: generatePassword() })
const newPassword = ref<string | null>(null)
const passwordForm = useForm({
   values: password,
   schema: { password: { required: true, minLength: MIN_PASSWORD_LENGTH, maxLength: 256 } },
   onSubmit: async (values) => {
      await update({ password: values.password })
      newPassword.value = values.password
      passwordForm.reset({ password: generatePassword() })
   },
})
</script>
