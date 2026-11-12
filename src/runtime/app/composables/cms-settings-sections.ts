import type { CmsEntry } from '#nuxt-cms'
import { entryFieldsFor } from '#nuxt-cms'
import type { SettingsModalPage, SettingsModalSection } from '@xleddyl/443-components-vue'
import type { Component } from 'vue'
import { computed, nextTick } from '#imports'
import cmsConfig from '#cms-config'
import { CMS_PRESET_ICON } from '../../shared/presets'
import CmsSettingsEntries from '../components/cms/SettingsEntries.vue'
import CmsSettingsEntryActions from '../components/cms/SettingsEntryActions.vue'
import CmsSettingsEntryTabs from '../components/cms/SettingsEntryTabs.vue'
import CmsSettingsFormAction from '../components/cms/SettingsFormAction.vue'
import CmsSettingsPresets from '../components/cms/SettingsPresets.vue'
import CmsSettingsRecordActions from '../components/cms/SettingsRecordActions.vue'
import CmsSettingsRedirectActions from '../components/cms/SettingsRedirectActions.vue'
import CmsSettingsRedirects from '../components/cms/SettingsRedirects.vue'
import CmsSettingsSite from '../components/cms/SettingsSite.vue'
import CmsSettingsUsers from '../components/cms/SettingsUsers.vue'
import { cmsIcon } from '../utils/ui'
import { useCmsSettingsEntries } from './cms-entry-settings'
import { useCmsPermissions } from './cms-permissions'
import type { CmsListRecord } from './cms-record-list'
import { CMS_NEW_RECORD } from './cms-route'
import { useCmsPresetStore, useCmsRedirects, useCmsUsers } from './cms-settings-stores'

export interface CmsSettingsSlot {
   page?: SettingsModalPage
   pages: SettingsModalPage[]
   openPage: (page: SettingsModalPage) => Promise<boolean>
   back: () => Promise<boolean>
   goTo: (depth: number) => Promise<boolean>
}

type SlotBinding = (slot: CmsSettingsSlot) => Record<string, unknown>

export interface CmsSettingsSectionView extends SettingsModalSection {
   component?: Component
   bind?: SlotBinding
   actions?: Component
   bindActions?: SlotBinding
   tabs?: Component
   resolvePage?: (id: string, parents: SettingsModalPage[]) => Promise<string | undefined>
}

interface RecordStore<T extends CmsListRecord> {
   loaded: { value: boolean }
   items: { value: T[] }
   find: (id: string | null | undefined) => T | undefined
   remove: (record: T) => Promise<boolean>
   resolveLabel: (id: string) => Promise<string | undefined>
}

interface RecordSectionOptions<T> {
   addLabel?: string
   addIcon?: string
   newLabel?: string
   creatable?: boolean
   deletable?: (record: T) => boolean
   locked?: (record: T) => boolean
   lockHint?: string
   actions?: Component
}

const GROUPS = { account: 'Account', access: 'Access', site: 'Site', content: 'Content' }

function pageBinding({ page, openPage, back }: CmsSettingsSlot) {
   return { page, onOpen: openPage, onBack: back }
}

function hasBlockFields() {
   return Object.values(cmsConfig as Record<string, CmsEntry>).some((entry) =>
      Object.values(entryFieldsFor(entry)).some((field) => field.type === 'blocks')
   )
}

export function useCmsSettingsSections() {
   const { can } = useCmsPermissions()
   const users = useCmsUsers()
   const redirects = useCmsRedirects()
   const presets = useCmsPresetStore()
   const entries = useCmsSettingsEntries()
   const blocks = hasBlockFields()

   function recordSection<T extends CmsListRecord>(
      section: SettingsModalSection,
      component: Component,
      store: RecordStore<T>,
      options: RecordSectionOptions<T> = {}
   ): CmsSettingsSectionView {
      const creatable = options.creatable ?? true
      const newLabel = options.newLabel ?? 'New'
      return {
         ...section,
         component,
         bind: pageBinding,
         actions: options.actions ?? CmsSettingsRecordActions,
         bindActions: ({ page, openPage, back }) => {
            const record = store.find(page?.id)
            return {
               page,
               addLabel: options.addLabel ?? 'Add',
               addIcon: options.addIcon,
               newLabel,
               hideAdd: !creatable || !(store.loaded.value && store.items.value.length),
               deletable: !!record && (options.deletable?.(record) ?? true),
               deleteDisabled: !!record && !!options.locked?.(record),
               deleteHint: options.lockHint,
               onOpen: openPage,
               onDelete: async () => {
                  if (!record || !(await store.remove(record))) return
                  await nextTick()
                  void back()
               },
            }
         },
         resolvePage: async (id) => {
            if (id === CMS_NEW_RECORD) return creatable ? newLabel : undefined
            return store.resolveLabel(id)
         },
      }
   }

   const sections = computed<CmsSettingsSectionView[]>(() => [
      {
         id: 'account',
         label: 'Account',
         icon: cmsIcon('user-circle'),
         description: 'Your profile and your password.',
         group: GROUPS.account,
      },
      {
         id: 'appearance',
         label: 'Appearance',
         icon: cmsIcon('swatch'),
         description: 'Choose how the panel looks. System follows your device.',
         group: GROUPS.account,
      },
      ...(can('users.manage')
         ? [
              recordSection(
                 {
                    id: 'users',
                    label: 'Users',
                    icon: cmsIcon('users'),
                    description:
                       'Accounts that can sign in to the panel, and what their role allows.',
                    group: GROUPS.access,
                 },
                 CmsSettingsUsers,
                 users,
                 {
                    addLabel: 'Add user',
                    addIcon: 'user-plus',
                    newLabel: 'New user',
                    deletable: users.canManageUser,
                    locked: users.isSelf,
                    lockHint: 'You cannot delete your own account',
                 }
              ),
           ]
         : []),
      ...(can('settings.manage')
         ? [
              {
                 id: 'site',
                 label: 'Site',
                 icon: cmsIcon('globe-alt'),
                 description: 'Site name, search engines and sharing.',
                 group: GROUPS.site,
                 component: CmsSettingsSite,
                 actions: CmsSettingsFormAction,
              },
           ]
         : []),
      ...(can('redirects.manage')
         ? [
              recordSection(
                 {
                    id: 'redirects',
                    label: 'Redirects',
                    icon: cmsIcon('arrow-uturn-right'),
                    description: 'Send visitors from old paths to new ones.',
                    group: GROUPS.site,
                 },
                 CmsSettingsRedirects,
                 redirects,
                 {
                    addLabel: 'Add redirect',
                    newLabel: 'New redirect',
                    actions: CmsSettingsRedirectActions,
                 }
              ),
           ]
         : []),
      ...(entries.value.length
         ? [
              {
                 id: 'layout',
                 label: 'Layout',
                 icon: cmsIcon('view-columns'),
                 description: 'Table columns and form layout of each content type.',
                 group: GROUPS.content,
                 component: CmsSettingsEntries,
                 bind: pageBinding,
                 actions: CmsSettingsEntryActions,
                 bindActions: ({ page }: CmsSettingsSlot) => ({ page }),
                 tabs: CmsSettingsEntryTabs,
                 resolvePage: async (id: string) =>
                    entries.value.find((entry) => entry.name === id)?.label,
              },
           ]
         : []),
      ...(blocks && can('settings.manage')
         ? [
              recordSection(
                 {
                    id: 'presets',
                    label: 'Block presets',
                    icon: cmsIcon(CMS_PRESET_ICON),
                    description: 'Saved copies of blocks, inserted from the block picker.',
                    group: GROUPS.content,
                 },
                 CmsSettingsPresets,
                 presets,
                 { creatable: false }
              ),
           ]
         : []),
   ])

   const views = computed(() => sections.value.filter((section) => section.component))

   const actionViews = computed(() => sections.value.filter((section) => section.actions))

   const tabViews = computed(() => sections.value.filter((section) => section.tabs))

   const navigation = computed<SettingsModalSection[]>(() =>
      sections.value.map(({ id, label, icon, description, group }) => ({
         id,
         label,
         icon,
         description,
         group,
      }))
   )

   function resolvePage(sectionId: string, id: string, parents: SettingsModalPage[]) {
      const section = sections.value.find((item) => item.id === sectionId)
      return section?.resolvePage ? section.resolvePage(id, parents) : undefined
   }

   return { navigation, views, actionViews, tabViews, resolvePage }
}
