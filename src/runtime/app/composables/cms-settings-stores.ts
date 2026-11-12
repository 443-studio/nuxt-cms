import type { CmsAccount, CmsEntry, CmsRedirect, CmsRedirectInput } from '#nuxt-cms'
import {
   REDIRECT_IMPORT_MAX_ROWS,
   entryFieldsFor,
   normalizeRedirectPath,
   redirectRowsFromTable,
   redirectsToTable,
} from '#nuxt-cms'
import { toast, useConfirm } from '@xleddyl/443-components-vue'
import { ref, useState } from '#imports'
import cmsConfig from '#cms-config'
import type { CmsBlockPreset } from '../../shared/presets'
import { presetBlockCount } from '../../shared/presets'
import { encodeCsv, parseCsv } from '../../shared/transfer'
import { cmsApi } from '../utils/api'
import { errorMessage } from '../utils/ui'
import { useCmsAccount } from './cms-account'
import { useCmsPermissions } from './cms-permissions'
import { useCmsRecordList } from './cms-record-list'

export function useCmsUsers() {
   const { user } = useCmsAccount()
   const { canManage } = useCmsPermissions()
   const list = useCmsRecordList<CmsAccount>({
      key: 'users',
      url: '/api/cms/users',
      label: (account) => account.name || account.email,
      loadError: 'Could not load users',
      confirmDelete: (account) => ({
         title: `Delete ${account.email}?`,
         description: 'They lose access to the panel.',
      }),
      deleted: 'User deleted',
      deleteError: 'User not deleted',
   })

   function canManageUser(account: CmsAccount) {
      return canManage(account.role)
   }

   function isSelf(account: CmsAccount) {
      return account.id === user.value?.id
   }

   return { ...list, canManageUser, isSelf }
}

export function useCmsRedirects() {
   const confirm = useConfirm()
   const importing = ref(false)
   const list = useCmsRecordList<CmsRedirect>({
      key: 'redirects',
      url: '/api/cms/redirects',
      label: (redirect) => redirect.from,
      compare: (a, b) => a.from.localeCompare(b.from),
      loadError: 'Could not load redirects',
      confirmDelete: (redirect) => ({
         title: 'Delete this redirect?',
         description: `Visitors of ${redirect.from} are not sent to ${redirect.to} anymore.`,
      }),
      deleted: 'Redirect deleted',
      deleteError: 'Redirect not deleted',
   })

   function download(content: string, type: string, extension: string) {
      const url = URL.createObjectURL(new Blob([content], { type }))
      const link = document.createElement('a')
      link.href = url
      link.download = `redirects.${extension}`
      link.click()
      URL.revokeObjectURL(url)
   }

   function exportCsv() {
      download(encodeCsv(redirectsToTable(list.items.value)), 'text/csv', 'csv')
   }

   function exportJson() {
      const rows = list.items.value.map(({ from, to, status, keepQuery }) => ({
         from,
         to,
         status,
         keepQuery,
      }))
      download(`${JSON.stringify(rows, null, 2)}\n`, 'application/json', 'json')
   }

   function parseImport(name: string, text: string): CmsRedirectInput[] {
      if (name.toLowerCase().endsWith('.json') || text.trim().startsWith('[')) {
         const rows = JSON.parse(text) as unknown
         if (!Array.isArray(rows)) throw new Error('The JSON file must hold an array of redirects')
         return rows as CmsRedirectInput[]
      }
      return redirectRowsFromTable(parseCsv(text))
   }

   async function importFile(file: File) {
      importing.value = true
      try {
         const rows = parseImport(file.name, await file.text())
         if (!rows.length) throw new Error('The file holds no redirects')
         if (rows.length > REDIRECT_IMPORT_MAX_ROWS)
            throw new Error(`Import at most ${REDIRECT_IMPORT_MAX_ROWS} redirects at a time`)
         const updates = rows.filter((row) =>
            list.items.value.some(
               (redirect) => redirect.from === normalizeRedirectPath(String(row.from ?? ''))
            )
         ).length
         const confirmed = await confirm({
            title: `Import ${rows.length} redirects?`,
            description: updates
               ? `${updates} replace a redirect with the same From.`
               : 'They are added to the list.',
            confirmLabel: 'Import',
         })
         if (!confirmed) return
         const result = await cmsApi<{ created: number; updated: number }>(
            '/api/cms/redirects/import',
            { method: 'POST', body: { redirects: rows } }
         )
         await list.load()
         toast.success('Redirects imported', {
            description: `${result.created} added, ${result.updated} updated.`,
         })
      } catch (error) {
         toast.error('Import failed', { description: errorMessage(error) })
      } finally {
         importing.value = false
      }
   }

   return { ...list, importing, exportCsv, exportJson, importFile }
}

function presetSourceLabel(source: string) {
   const [entryName = '', fieldKey = ''] = source.split('.')
   const entry = Object.hasOwn(cmsConfig, entryName)
      ? (cmsConfig as Record<string, CmsEntry>)[entryName]
      : undefined
   if (!entry) return source
   const field = entryFieldsFor(entry)[fieldKey]
   return field ? `${entry.label}, ${field.label}` : entry.label
}

export function presetMeta(preset: CmsBlockPreset) {
   return `${presetBlockCount(preset.items.length)} · Saved from ${presetSourceLabel(
      preset.source
   )}`
}

export function useCmsPresetStore() {
   const fieldCache = useState<Record<string, CmsBlockPreset[]>>('cms-presets', () => ({}))
   const list = useCmsRecordList<CmsBlockPreset>({
      key: 'presets',
      url: '/api/cms/presets',
      label: (preset) => preset.name,
      loadError: 'Could not load presets',
      confirmDelete: (preset) => ({
         title: `Delete the preset "${preset.name}"?`,
         description: 'Blocks already inserted from it stay as they are.',
      }),
      deleted: 'Preset deleted',
      deleteError: 'Preset not deleted',
   })

   async function remove(preset: CmsBlockPreset) {
      const removed = await list.remove(preset)
      if (removed) fieldCache.value = {}
      return removed
   }

   function saved(preset: CmsBlockPreset) {
      list.upsert(preset)
      fieldCache.value = {}
   }

   return { ...list, remove, saved }
}
