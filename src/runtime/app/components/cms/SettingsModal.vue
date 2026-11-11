<template>
   <KSettingsModal
      v-model:open="open"
      v-model:section="section"
      :sections="sections"
      :account="account"
      :presets="false"
      :route="CMS_SETTINGS_QUERY"
      hide-session
      close-label="Close settings"
      :on-sign-out="signOut"
   >
      <template #section-appearance>
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

      <template #section-site>
         <CmsSettingsSite />
      </template>

      <template #actions-redirects>
         <KButton
            v-if="!redirectsCreating"
            label="Add redirect"
            :icon="cmsIcon('plus')"
            size="sm"
            @click="redirectsCreating = true"
         />
      </template>
      <template #section-redirects>
         <CmsSettingsRedirects v-model:creating="redirectsCreating" />
      </template>

      <template v-if="hasBlocks" #section-presets>
         <CmsSettingsPresets />
      </template>

      <template v-for="item in visibleEntries" :key="item.key" #[`actions-${item.key}`]>
         <span class="cms-settings-status" :class="`is-${entryStatus}`" aria-live="polite">
            {{ STATUS_LABELS[entryStatus] }}
         </span>
      </template>
      <template v-for="item in visibleEntries" :key="item.key" #[`section-${item.key}`]>
         <CmsSettingsEntry v-model:status="entryStatus" :name="item.name" />
      </template>
   </KSettingsModal>
</template>

<script setup lang="ts">
import type { CmsEntry, CmsEntryKind } from '#nuxt-cms'
import { entryFieldsFor } from '#nuxt-cms'
import type { SettingsModalSection } from '@xleddyl/443-components-vue'
import {
   AppearanceSettings as KAppearanceSettings,
   Button as KButton,
   SettingsModal as KSettingsModal,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import { CMS_PRESET_ICON } from '../../../shared/presets'
import { useCmsAccount } from '../../composables/cms-account'
import { useCmsPermissions } from '../../composables/cms-permissions'
import { CMS_SETTINGS_QUERY, cmsIcon } from '../../utils/ui'

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

const { displayName, email } = useCmsAccount()
const { can, role, roleLabel } = useCmsPermissions()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ logout: [] }>()

const entries = Object.entries(cmsConfig as Record<string, CmsEntry>).map(([name, entry]) => ({
   name,
   key: `${ENTRY_PREFIX}${name}`,
   label: entry.label,
   kind: entry.kind,
   icon: entry.icon ?? KIND_ICONS[entry.kind],
}))

const hasBlocks = Object.values(cmsConfig as Record<string, CmsEntry>).some((entry) =>
   Object.values(entryFieldsFor(entry)).some((field) => field.type === 'blocks')
)

const account = computed(() => ({
   name: displayName.value,
   email: email.value,
   role: roleLabel(role.value),
}))

const visibleEntries = computed(() =>
   can('settings.manage') ? entries.filter((item) => can(`${item.name}.read`)) : []
)

const sections = computed<SettingsModalSection[]>(() => [
   {
      id: 'account',
      label: 'Account',
      icon: cmsIcon('user-circle'),
      description: 'Your profile and your password.',
   },
   { id: 'appearance', label: 'Appearance', icon: cmsIcon('swatch') },
   ...(can('users.manage')
      ? [
           {
              id: 'users',
              label: 'Users',
              icon: cmsIcon('users'),
              description: 'Accounts that can sign in to the panel, and what their role allows.',
           },
        ]
      : []),
   ...(can('settings.manage')
      ? [
           {
              id: 'site',
              label: 'Site',
              icon: cmsIcon('globe-alt'),
              description: 'Site name, search engines and sharing.',
           },
        ]
      : []),
   ...(can('redirects.manage')
      ? [
           {
              id: 'redirects',
              label: 'Redirects',
              icon: cmsIcon('arrow-uturn-right'),
              description: 'Send visitors from old paths to new ones.',
           },
        ]
      : []),
   ...(hasBlocks
      ? [
           {
              id: 'presets',
              label: 'Block presets',
              icon: cmsIcon(CMS_PRESET_ICON),
              description: 'Saved copies of blocks, inserted from the block picker.',
           },
        ]
      : []),
   ...visibleEntries.value.map((item) => ({
      id: item.key,
      label: item.label,
      icon: cmsIcon(item.icon),
      group: 'Content',
      description: KIND_LABELS[item.kind],
   })),
])

const section = ref('account')
const usersCreating = ref(false)
const redirectsCreating = ref(false)
const entryStatus = ref<EntryStatus>('idle')

watch(section, () => {
   usersCreating.value = false
   redirectsCreating.value = false
   entryStatus.value = 'idle'
})

function signOut() {
   emit('logout')
}
</script>
