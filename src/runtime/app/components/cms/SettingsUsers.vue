<template>
   <CmsSettingsUserCreate v-if="isNew" @created="onCreated" />
   <CmsSettingsUserDetail
      v-else-if="page && current"
      :key="current.id"
      :account="current"
      @updated="store.upsert"
   />
   <KSkeletonForm v-else-if="page && !store.loaded.value" :fields="3" />
   <KRecordList
      v-else
      :items="items"
      :loading="!store.loaded.value"
      avatar
      label="Users"
      :empty-icon="cmsIcon('users')"
      empty-text="No users yet"
      empty-description="Add a user to give someone access to the panel."
      @row-click="(item) => open((item as UserItem).account)"
   >
      <template #leading="{ item }">
         <KAvatar :name="item.title" decorative />
      </template>
      <template #action="{ item }">
         <KButton
            :icon="cmsIcon(canManageUser((item as UserItem).account) ? 'pencil' : 'eye')"
            variant="ghost"
            tone="neutral"
            size="sm"
            square
            :aria-label="canManageUser((item as UserItem).account) ? 'Edit' : 'View'"
            @click="open((item as UserItem).account)"
         />
      </template>
      <template #empty-actions>
         <CmsSettingsEmptyAdd
            label="Add user"
            new-label="New user"
            icon="user-plus"
            @open="emit('open', $event)"
         />
      </template>
   </KRecordList>
   <KModal
      v-if="created"
      v-model:open="createdOpen"
      size="sm"
      title="User created"
      description="Share these credentials with the user. The password does not show again."
   >
      <KDescriptionList
         :items="[
            { key: 'email', label: 'Email', value: created.email },
            { key: 'password', label: 'Password', value: created.password },
         ]"
      >
         <template #value-password="{ item }">
            <span class="k-mono">{{ item.value }}</span>
         </template>
      </KDescriptionList>
      <template #footer>
         <KCopyButton
            variant="soft"
            tone="neutral"
            :value="`Email: ${created.email}\nPassword: ${created.password}`"
            label="Copy credentials"
            copied-label="Copied"
            show-label
         />
         <KButton variant="ghost" tone="neutral" @click="createdOpen = false">Done</KButton>
      </template>
   </KModal>
</template>

<script setup lang="ts">
import type { CmsAccount } from '#nuxt-cms'
import type { RecordListItem, SettingsModalPage } from '@xleddyl/443-components-vue'
import {
   Avatar as KAvatar,
   Button as KButton,
   CopyButton as KCopyButton,
   DescriptionList as KDescriptionList,
   Modal as KModal,
   RecordList as KRecordList,
   SkeletonForm as KSkeletonForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref } from '#imports'
import { CMS_NEW_RECORD } from '../../composables/cms-route'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { useCmsUsers } from '../../composables/cms-settings-stores'
import { cmsIcon } from '../../utils/ui'
import { lastSignIn, roleBadge } from '../../utils/users'

type UserItem = RecordListItem & { account: CmsAccount }

const props = defineProps<{ page?: SettingsModalPage }>()
const emit = defineEmits<{ open: [page: SettingsModalPage]; back: [] }>()

const store = useCmsUsers()
const { canManageUser } = store
const { roleOptions, roleLabel } = useCmsPermissions()

onMounted(store.load)

const isNew = computed(() => props.page?.id === CMS_NEW_RECORD)
const current = computed(() => store.find(props.page?.id))

const created = ref<{ email: string; password: string } | null>(null)
const createdOpen = ref(false)

function open(account: CmsAccount) {
   emit('open', { id: account.id, label: store.label(account) })
}

function onCreated(account: CmsAccount, password: string) {
   store.upsert(account)
   created.value = { email: account.email, password }
   createdOpen.value = true
   emit('back')
}

const items = computed<UserItem[]>(() =>
   store.items.value.map((account) => ({
      id: account.id,
      account,
      title: account.name || account.email,
      description: `${account.name ? `${account.email} · ` : ''}${lastSignIn(account)}`,
      badge: roleBadge(account.role, roleOptions, roleLabel),
   }))
)
</script>
