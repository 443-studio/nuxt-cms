<template>
   <KAlert
      v-if="created"
      tone="accent"
      role="status"
      :icon="cmsIcon('key')"
      :title="created.title"
      class="cms-credentials-alert"
   >
      <p>Share these credentials with the user. The password does not show again.</p>
      <KDescriptionList
         :items="[
            { key: 'email', label: 'Email', value: created.email },
            { key: 'password', label: 'Password', value: created.password },
         ]"
         :divided="false"
         class="cms-credentials-items"
      >
         <template #value-password="{ item }">
            <span class="k-mono">{{ item.value }}</span>
         </template>
      </KDescriptionList>
      <template #actions>
         <KCopyButton
            :value="`Email: ${created.email}\nPassword: ${created.password}`"
            label="Copy credentials"
            copied-label="Copied"
            show-label
            variant="soft"
            tone="accent"
         />
         <KButton label="Done" size="sm" @click="created = null" />
      </template>
   </KAlert>

   <KCard v-if="creating" variant="subtle" title="New user" class="cms-user-create">
      <KForm :form="draft">
         <KGrid :columns="2">
            <KFormField label="Email" name="email" required>
               <KInput
                  v-model="draft.values.email"
                  type="email"
                  :icon="cmsIcon('envelope')"
                  placeholder="name@example.com"
                  autocomplete="off"
               />
            </KFormField>
            <KFormField label="Name" name="name">
               <KInput v-model="draft.values.name" placeholder="Optional" autocomplete="off" />
            </KFormField>
         </KGrid>
         <KFormField
            label="Role"
            name="role"
            required
            :description="roleDescription(String(draft.values.role ?? ''))"
         >
            <KSelect v-model="draft.values.role" :options="grantableOptions" />
         </KFormField>
         <KFormField label="Password" name="password" required>
            <KPasswordInput
               v-model="draft.values.password"
               icon="key"
               autocomplete="new-password"
               :generate="generatePassword"
               copy
            />
         </KFormField>
         <KStack direction="row" justify="end" gap="sm">
            <KButton label="Cancel" variant="ghost" tone="neutral" size="sm" @click="cancel" />
            <KButton
               type="submit"
               label="Create user"
               size="sm"
               :disabled="
                  !draft.values.email ||
                  !draft.values.role ||
                  (draft.values.password ?? '').length < MIN_PASSWORD_LENGTH
               "
            />
         </KStack>
      </KForm>
   </KCard>

   <KSpinner v-if="loading" />

   <ul v-else-if="users.length" class="cms-user-list">
      <li v-for="account in users" :key="account.id" class="cms-user-row">
         <div class="cms-user-main">
            <KAvatar :name="account.name || account.email" size="sm" decorative />
            <div class="cms-user-text">
               <span class="cms-user-name">{{ account.name || account.email }}</span>
               <span class="cms-user-meta">
                  {{ account.name ? `${account.email} · ` : '' }}{{ lastLogin(account) }}
               </span>
            </div>
            <KSelect
               v-if="canManage(account.role) && account.id !== user?.id"
               :model-value="account.role"
               :options="roleOptionsFor(account)"
               size="sm"
               :invalid="!isKnownRole(account.role)"
               :aria-label="`Role of ${account.email}`"
               class="cms-user-role"
               @update:model-value="(role) => role && changeRole(account, String(role))"
            />
            <KBadge
               v-else
               :tone="isKnownRole(account.role) ? 'neutral' : 'warning'"
               :label="roleText(account.role)"
               :title="isKnownRole(account.role) ? undefined : UNKNOWN_ROLE_HINT"
            />
            <KStack v-if="canManage(account.role)" direction="row" gap="none">
               <KButton
                  :icon="cmsIcon('key')"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  title="Set a new password"
                  aria-label="Set a new password"
                  @click="startReset(account)"
               />
               <KButton
                  v-if="account.id !== user?.id"
                  :icon="cmsIcon('trash')"
                  variant="ghost"
                  tone="danger"
                  size="sm"
                  title="Delete user"
                  aria-label="Delete user"
                  @click="remove(account)"
               />
            </KStack>
         </div>
         <KForm v-if="resetting === account.id" :form="reset" class="cms-user-reset">
            <KFormField label="New password" name="password">
               <KPasswordInput
                  v-model="reset.values.password"
                  icon="key"
                  autocomplete="new-password"
                  :generate="generatePassword"
                  copy
               />
            </KFormField>
            <KStack direction="row" justify="end" gap="sm">
               <KButton
                  label="Cancel"
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  @click="resetting = null"
               />
               <KButton
                  type="submit"
                  label="Set password"
                  size="sm"
                  :disabled="(reset.values.password ?? '').length < MIN_PASSWORD_LENGTH"
               />
            </KStack>
         </KForm>
      </li>
   </ul>

   <KEmptyState
      v-else-if="!creating"
      :icon="cmsIcon('users')"
      title="No users yet"
      description="Add a user to give someone access to the panel."
   />
</template>

<script setup lang="ts">
import type { CmsAccount } from '#nuxt-cms'
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import {
   Alert as KAlert,
   Avatar as KAvatar,
   Badge as KBadge,
   Button as KButton,
   Card as KCard,
   CopyButton as KCopyButton,
   DescriptionList as KDescriptionList,
   EmptyState as KEmptyState,
   Form as KForm,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   PasswordInput as KPasswordInput,
   Select as KSelect,
   Spinner as KSpinner,
   Stack as KStack,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref, watch } from '#imports'
import { generatePassword, useCmsAccount } from '../../composables/cms-account'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { cmsIcon, errorMessage } from '../../utils/ui'

const toast = useCmsToast()
const confirmAction = useCmsConfirm()

const creating = defineModel<boolean>('creating', { default: false })

const UNKNOWN_ROLE_HINT =
   'This role is not in cms.roles anymore, so the account has no access. Pick a new role.'

const { user } = useCmsAccount()
const { roleOptions, roleLabel, canGrant, canManage } = useCmsPermissions()

const grantableOptions = computed(() =>
   roleOptions
      .filter((option) => canGrant(option.key))
      .map((option) => ({ value: option.key, label: option.label }))
)

function isKnownRole(role: string) {
   return roleOptions.some((option) => option.key === role)
}

function roleText(role: string) {
   return isKnownRole(role) ? roleLabel(role) : `Unknown role: ${role}`
}

function roleDescription(role: string) {
   return roleOptions.find((option) => option.key === role)?.description ?? undefined
}

function roleOptionsFor(account: CmsAccount) {
   const options = grantableOptions.value
   if (options.some((option) => option.value === account.role)) return options
   return [{ value: account.role, label: `${account.role} (removed)`, disabled: true }, ...options]
}

async function changeRole(account: CmsAccount, role: string) {
   if (role === account.role) return
   try {
      const updated = await cmsApi<CmsAccount>(`/api/cms/users/${account.id}`, {
         method: 'PUT',
         body: { role },
      })
      users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
      toast.add({ title: `${updated.email} is now ${roleLabel(updated.role)}`, color: 'success' })
   } catch (error) {
      toast.add({ title: 'Role not changed', description: errorMessage(error), color: 'error' })
   }
}

const users = ref<CmsAccount[]>([])
const loading = ref(true)

async function load() {
   try {
      users.value = await cmsApi<CmsAccount[]>('/api/cms/users')
   } catch (error) {
      toast.add({ title: 'Could not load users', description: errorMessage(error), color: 'error' })
   } finally {
      loading.value = false
   }
}

onMounted(load)

function lastLogin(account: CmsAccount) {
   if (!account.lastLoginAt) return 'Never signed in'
   return `Last sign-in ${new Date(account.lastLoginAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
   })}`
}

const created = ref<{ title: string; email: string; password: string } | null>(null)

const draft = useForm({
   schema: {
      email: { initial: (): string | number | null | undefined => '' },
      name: { initial: (): string | number | null | undefined => '' },
      role: { initial: (): string | number | null | undefined => '' },
      password: { initial: (): string | null | undefined => '' },
   },
   onSubmit: create,
})

watch(
   creating,
   (value) => {
      if (!value) return
      created.value = null
      draft.reset({
         email: '',
         name: '',
         role: grantableOptions.value[0]?.value ?? '',
         password: generatePassword(),
      })
   },
   { immediate: true }
)

function cancel() {
   creating.value = false
}

async function create() {
   const password = draft.values.password ?? ''
   try {
      const account = await cmsApi<CmsAccount>('/api/cms/users', {
         method: 'POST',
         body: {
            email: String(draft.values.email ?? ''),
            name: draft.values.name ? String(draft.values.name) : null,
            role: String(draft.values.role ?? ''),
            password,
         },
      })
      users.value = [...users.value, account]
      created.value = { title: 'User created', email: account.email, password }
      creating.value = false
   } catch (error) {
      draft.setError('', errorMessage(error) ?? 'User not created.')
   }
}

const resetting = ref<string | null>(null)

const reset = useForm({
   schema: { password: { initial: (): string | null | undefined => '' } },
   onSubmit: () => {
      const account = users.value.find((candidate) => candidate.id === resetting.value)
      return account ? saveReset(account) : undefined
   },
})

function startReset(account: CmsAccount) {
   reset.reset({ password: generatePassword() })
   resetting.value = resetting.value === account.id ? null : account.id
}

async function saveReset(account: CmsAccount) {
   const password = reset.values.password ?? ''
   try {
      const updated = await cmsApi<CmsAccount>(`/api/cms/users/${account.id}`, {
         method: 'PUT',
         body: { password },
      })
      users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
      created.value = { title: 'Password changed', email: account.email, password }
      resetting.value = null
   } catch (error) {
      toast.add({ title: 'Password not changed', description: errorMessage(error), color: 'error' })
   }
}

async function remove(account: CmsAccount) {
   if (!(await confirmAction(`Delete ${account.email}? They lose access to the panel.`))) return
   try {
      await cmsApi(`/api/cms/users/${account.id}`, { method: 'DELETE' })
      users.value = users.value.filter((u) => u.id !== account.id)
      toast.add({ title: 'User deleted', color: 'success' })
   } catch (error) {
      toast.add({ title: 'User not deleted', description: errorMessage(error), color: 'error' })
   }
}
</script>
