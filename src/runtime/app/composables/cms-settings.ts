import type { CmsEntry, CmsEntrySettings, CmsFormLayout, CmsI18n, CmsSettingsMap } from '#nuxt-cms'
import {
   isCollectionKind,
   layoutFromConfig,
   pageAllFields,
   resolveFormLayout,
   resolveListColumns,
} from '#nuxt-cms'
import { useFetch, useState } from '#imports'
import cmsConfig from '#cms-config'
import { TRANSLATIONS_COLUMN, hasTranslationsColumn } from '../../shared/translations'
import { cmsApi } from '../utils/api'

const SETTINGS_ENDPOINT = '/api/cms/admin/settings'

export function useCmsSettingsState() {
   return useState<CmsSettingsMap>('cms-settings', () => ({}))
}

export async function loadCmsSettings() {
   const state = useCmsSettingsState()
   const { data } = await useFetch<CmsSettingsMap>(SETTINGS_ENDPOINT, { key: 'cms-settings' })
   if (data.value) state.value = data.value
}

export function useCmsSettings() {
   const settings = useCmsSettingsState()

   async function save(name: string, value: CmsEntrySettings) {
      const saved = await cmsApi<CmsEntrySettings>(`${SETTINGS_ENDPOINT}/${name}`, {
         method: 'PUT',
         body: value,
      })
      settings.value = { ...settings.value, [name]: saved }
   }

   async function reset(name: string) {
      await cmsApi(`${SETTINGS_ENDPOINT}/${name}`, { method: 'DELETE' })
      const next = { ...settings.value }
      delete next[name]
      settings.value = next
   }

   return { settings, save, reset }
}

function entryOf(name: string): CmsEntry | undefined {
   return (cmsConfig as Record<string, CmsEntry>)[name]
}

export function entryFields(name: string) {
   const entry = entryOf(name)
   if (!entry) return {}
   return entry.kind === 'page' ? pageAllFields(entry) : entry.fields
}

function defaultFormLayout(name: string, fields = entryFields(name)): CmsFormLayout {
   return resolveFormLayout(fields, layoutFromConfig(entryOf(name)?.layout))
}

export function entryFormLayout(
   name: string,
   settings: CmsSettingsMap,
   fields = entryFields(name)
): CmsFormLayout {
   const saved = settings[name]?.layout
   return saved ? resolveFormLayout(fields, saved) : defaultFormLayout(name, fields)
}

export function listExtraColumns(name: string, i18n?: CmsI18n): string[] {
   const entry = entryOf(name)
   if (!entry || !isCollectionKind(entry)) return []
   return [
      ...(entry.drafts ? ['status'] : []),
      ...(i18n && hasTranslationsColumn(entry, i18n) ? [TRANSLATIONS_COLUMN] : []),
   ]
}

export function entryListColumns(name: string, settings: CmsSettingsMap, i18n?: CmsI18n): string[] {
   const entry = entryOf(name)
   if (!entry) return []
   const extra = listExtraColumns(name, i18n)
   const saved = settings[name]?.columns
   const columns = resolveListColumns(entry.fields, saved, entry.list, extra)
   const customized = !!saved?.some(
      (key) => Object.hasOwn(entry.fields, key) || extra.includes(key)
   )
   return customized ||
      !extra.includes(TRANSLATIONS_COLUMN) ||
      columns.includes(TRANSLATIONS_COLUMN)
      ? columns
      : [...columns, TRANSLATIONS_COLUMN]
}
