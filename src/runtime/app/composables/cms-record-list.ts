import { toast, useConfirm } from '@xleddyl/443-components-vue'
import { computed, ref, useState } from '#imports'
import { cmsApi } from '../utils/api'
import { errorMessage } from '../utils/ui'

export interface CmsListRecord {
   id: string
}

export interface CmsRecordListOptions<T> {
   key: string
   url: string
   label: (item: T) => string
   compare?: (a: T, b: T) => number
   loadError: string
   confirmDelete?: (item: T) => { title: string; description?: string }
   deleted?: string
   deleteError?: string
}

export function useCmsRecordList<T extends CmsListRecord>(options: CmsRecordListOptions<T>) {
   const confirm = useConfirm()
   const items = useState<T[]>(`cms-list-${options.key}`, () => [])
   const loaded = useState<boolean>(`cms-list-${options.key}-loaded`, () => false)
   const loading = ref(false)
   let pending: Promise<void> | null = null

   const sorted = computed(() =>
      options.compare ? [...items.value].sort(options.compare) : items.value
   )

   function load() {
      pending ??= (async () => {
         loading.value = true
         try {
            items.value = await cmsApi<T[]>(options.url)
            loaded.value = true
         } catch (error) {
            toast.error(options.loadError, { description: errorMessage(error) })
         } finally {
            loading.value = false
            pending = null
         }
      })()
      return pending
   }

   async function ensureLoaded() {
      if (!loaded.value) await load()
   }

   function find(id: string | null | undefined) {
      return id == null ? undefined : items.value.find((item) => item.id === id)
   }

   function upsert(record: T) {
      const exists = items.value.some((item) => item.id === record.id)
      items.value = exists
         ? items.value.map((item) => (item.id === record.id ? record : item))
         : [...items.value, record]
   }

   function removeLocal(id: string) {
      items.value = items.value.filter((item) => item.id !== id)
   }

   async function resolveLabel(id: string) {
      await ensureLoaded()
      const record = find(id)
      return record ? options.label(record) : undefined
   }

   async function remove(record: T) {
      const question = options.confirmDelete?.(record)
      if (
         question &&
         !(await confirm.delete(question.title, { description: question.description }))
      )
         return false
      try {
         await cmsApi(`${options.url}/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
         removeLocal(record.id)
         if (options.deleted) toast.success(options.deleted)
         return true
      } catch (error) {
         toast.error(options.deleteError ?? 'Not deleted', { description: errorMessage(error) })
         return false
      }
   }

   return {
      items,
      sorted,
      loaded,
      loading,
      load,
      ensureLoaded,
      find,
      upsert,
      removeLocal,
      resolveLabel,
      remove,
      label: options.label,
   }
}

export type CmsRecordList<T extends CmsListRecord> = ReturnType<typeof useCmsRecordList<T>>
