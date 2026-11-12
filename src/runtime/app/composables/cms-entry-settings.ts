import type { CmsEntry, CmsFormLayout } from '#nuxt-cms'
import type { TabItem } from '@xleddyl/443-components-vue'
import { toast, useRouteState } from '@xleddyl/443-components-vue'
import { computed, toValue, useState } from '#imports'
import type { MaybeRefOrGetter } from 'vue'
import cmsConfig from '#cms-config'
import { errorMessage } from '../utils/ui'
import { useCmsPermissions } from './cms-permissions'
import { useCmsRuntime } from './cms-runtime'
import {
   entryFields,
   entryFormLayout,
   entryListColumns,
   listExtraColumns,
   useCmsSettings,
} from './cms-settings'

export type CmsEntrySettingsStatus = 'idle' | 'saving' | 'saved' | 'error'

export type CmsEntrySettingsPart = 'columns' | 'layout'

export const CMS_ENTRY_SETTINGS_TAB = 'layouttab'

export const CMS_ENTRY_SETTINGS_PANEL = 'cms-entry-settings-panel'

export const ENTRY_SETTINGS_STATUS_LABELS: Record<CmsEntrySettingsStatus, string> = {
   idle: 'Changes save automatically',
   saving: 'Saving…',
   saved: 'Saved',
   error: 'Not saved',
}

const KIND_LABELS: Record<CmsEntry['kind'], string> = {
   collection: 'Collection',
   single: 'Single',
   page: 'Pages',
   content: 'Content',
}

export const CMS_ENTRY_KIND_ICONS: Record<CmsEntry['kind'], string> = {
   collection: 'square-3-stack-3d',
   single: 'document-text',
   page: 'window',
   content: 'newspaper',
}

function configEntries() {
   return Object.entries(cmsConfig as Record<string, CmsEntry>)
}

export function useCmsSettingsEntries() {
   const { can } = useCmsPermissions()
   return computed(() =>
      can('settings.manage')
         ? configEntries()
              .filter(([name]) => can(`${name}.read`))
              .map(([name, entry]) => ({
                 name,
                 label: entry.label,
                 kind: KIND_LABELS[entry.kind],
                 icon: entry.icon ?? CMS_ENTRY_KIND_ICONS[entry.kind],
              }))
         : []
   )
}

export function entrySettingsParts(name: string): TabItem[] {
   const entry = (cmsConfig as Record<string, CmsEntry>)[name]
   if (!entry) return []
   return [
      ...(entry.kind === 'collection' || entry.kind === 'content'
         ? [{ value: 'columns', label: 'Table columns' }]
         : []),
      { value: 'layout', label: 'Form layout' },
   ]
}

export function useCmsEntrySettings(nameSource: MaybeRefOrGetter<string | undefined>) {
   const { settings, save, reset } = useCmsSettings()
   const { i18n } = useCmsRuntime()
   const status = useState<CmsEntrySettingsStatus>('cms-entry-settings-status', () => 'idle')
   const tab = useRouteState(CMS_ENTRY_SETTINGS_TAB, { location: 'hash', history: 'replace' })

   const name = computed(() => toValue(nameSource) ?? '')
   const entry = computed(() => (cmsConfig as Record<string, CmsEntry>)[name.value])
   const parts = computed(() => entrySettingsParts(name.value))
   const part = computed<CmsEntrySettingsPart>({
      get: () => {
         const wanted = tab.value
         return (parts.value.find((item) => item.value === wanted)?.value ??
            parts.value[0]?.value ??
            'layout') as CmsEntrySettingsPart
      },
      set: (value) => {
         tab.value = value === parts.value[0]?.value ? undefined : value
      },
   })

   const fields = computed(() => entryFields(name.value))
   const columns = computed(() => entryListColumns(name.value, settings.value, i18n))
   const layout = computed(() => entryFormLayout(name.value, settings.value, fields.value))
   const extraColumns = computed(() => listExtraColumns(name.value, i18n))

   const isCustom = computed(() => {
      const saved = settings.value[name.value]
      return part.value === 'columns' ? !!saved?.columns : !!saved?.layout
   })

   function current() {
      const saved = settings.value[name.value] ?? {}
      return { columns: saved.columns, layout: saved.layout }
   }

   async function persist(next: { columns?: string[]; layout?: CmsFormLayout }) {
      status.value = 'saving'
      try {
         if (!next.columns && !next.layout) await reset(name.value)
         else await save(name.value, next)
         status.value = 'saved'
      } catch (error) {
         status.value = 'error'
         toast.error('Settings not saved', { description: errorMessage(error) })
      }
   }

   function saveColumns(value: string[]) {
      void persist({ ...current(), columns: value })
   }

   function saveLayout(value: CmsFormLayout) {
      void persist({ ...current(), layout: value })
   }

   function resetPart() {
      const next = current()
      if (part.value === 'columns') next.columns = undefined
      else next.layout = undefined
      void persist(next)
   }

   return {
      entry,
      parts,
      part,
      fields,
      columns,
      layout,
      extraColumns,
      isCustom,
      status,
      saveColumns,
      saveLayout,
      resetPart,
   }
}
