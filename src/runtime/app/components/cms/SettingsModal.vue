<template>
   <KSettingsModal
      v-model:open="open"
      v-model:section="section"
      :sections="sections"
      :account="account"
      :presets="false"
      hide-session
      close-label="Close settings"
      :on-sign-out="signOut"
   >
      <template #section-general>
         <KAppearanceSettings
            :presets="false"
            theme-label="Theme"
            theme-text="Choose how the panel looks. System follows your device."
         />
      </template>

      <template #account-fields>
         <CmsSettingsAccount />
      </template>

      <template #actions-users>
         <KButton
            v-if="!usersCreating"
            label="Add user"
            :icon="cmsIcon('user-plus')"
            size="sm"
            @click="usersCreating = true"
         />
      </template>
      <template #section-users>
         <CmsSettingsUsers v-model:creating="usersCreating" />
      </template>

      <template v-for="item in entries" :key="item.key" #[`actions-${item.key}`]>
         <span class="cms-settings-status" :class="`is-${entryStatus}`" aria-live="polite">
            {{ STATUS_LABELS[entryStatus] }}
         </span>
      </template>
      <template v-for="item in entries" :key="item.key" #[`section-${item.key}`]>
         <CmsSettingsEntry v-model:status="entryStatus" :name="item.name" />
      </template>
   </KSettingsModal>
</template>

<script setup lang="ts">
import type { CmsEntry, CmsEntryKind } from '#nuxt-cms'
import type { SettingsModalSection } from '@xleddyl/443-components-vue'
import {
   AppearanceSettings as KAppearanceSettings,
   Button as KButton,
   SettingsModal as KSettingsModal,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import { useCmsAccount } from '../../composables/cms-account'
import { cmsIcon } from '../../utils/ui'

type EntryStatus = 'idle' | 'saving' | 'saved' | 'error'

const KIND_ICONS: Record<CmsEntryKind, string> = {
   collection: 'square-3-stack-3d',
   single: 'document-text',
   page: 'window',
   content: 'newspaper',
}

const KIND_LABELS: Record<CmsEntryKind, string> = {
   collection: 'Collection',
   single: 'Single',
   page: 'Pages',
   content: 'Content',
}

const STATUS_LABELS: Record<EntryStatus, string> = {
   idle: 'Changes save automatically',
   saving: 'Saving…',
   saved: 'Saved',
   error: 'Not saved',
}

const ENTRY_PREFIX = 'entry:'

const { isSuperAdmin, displayName, email } = useCmsAccount()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ logout: [] }>()

const entries = Object.entries(cmsConfig as Record<string, CmsEntry>).map(([name, entry]) => ({
   name,
   key: `${ENTRY_PREFIX}${name}`,
   label: entry.label,
   kind: entry.kind,
   icon: entry.icon ?? KIND_ICONS[entry.kind],
}))

const account = computed(() => ({
   name: displayName.value,
   email: email.value,
   role: isSuperAdmin.value ? 'Super admin' : 'Admin',
}))

const sections = computed<SettingsModalSection[]>(() => [
   { id: 'general', label: 'General', icon: cmsIcon('cog-6-tooth') },
   {
      id: 'account',
      label: 'Account',
      icon: cmsIcon('user-circle'),
      description: 'Your profile and your password.',
   },
   ...(isSuperAdmin.value
      ? [
           {
              id: 'users',
              label: 'Users',
              icon: cmsIcon('users'),
              description: 'Users can do everything in the panel, except manage users.',
           },
        ]
      : []),
   ...entries.map((item) => ({
      id: item.key,
      label: item.label,
      icon: cmsIcon(item.icon),
      group: 'Content',
      description: KIND_LABELS[item.kind],
   })),
])

const section = ref('general')
const usersCreating = ref(false)
const entryStatus = ref<EntryStatus>('idle')

watch(section, () => {
   usersCreating.value = false
   entryStatus.value = 'idle'
})

function signOut() {
   emit('logout')
}
</script>
