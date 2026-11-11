import { computed, useState } from '#imports'
import type { CmsBlockPreset } from '../../shared/presets'
import type { CmsBlockValue } from '../../shared/preview'
import { cmsApi } from '../utils/api'

const PRESETS_ENDPOINT = '/api/cms/presets'

function usePresetCache() {
   return useState<Record<string, CmsBlockPreset[]>>('cms-presets', () => ({}))
}

function fieldEndpoint(entryName: string, fieldKey: string) {
   return `${PRESETS_ENDPOINT}/${encodeURIComponent(entryName)}/${encodeURIComponent(fieldKey)}`
}

export function useCmsPresets(
   entryName: () => string | undefined,
   fieldKey: () => string | undefined
) {
   const cache = usePresetCache()

   const scope = computed(() => {
      const entry = entryName()
      const field = fieldKey()
      return entry && field ? { entry, field, key: `${entry}.${field}` } : null
   })

   const presets = computed(() => (scope.value ? cache.value[scope.value.key] ?? [] : []))

   async function load() {
      const current = scope.value
      if (!current) return
      try {
         const list = await cmsApi<CmsBlockPreset[]>(fieldEndpoint(current.entry, current.field))
         cache.value = { ...cache.value, [current.key]: list }
      } catch {
         cache.value = { ...cache.value, [current.key]: cache.value[current.key] ?? [] }
      }
   }

   async function create(input: { name: string; description?: string; items: CmsBlockValue[] }) {
      const current = scope.value
      if (!current) throw new Error('This field cannot hold presets')
      const preset = await cmsApi<CmsBlockPreset>(fieldEndpoint(current.entry, current.field), {
         method: 'POST',
         body: input,
      })
      cache.value = {}
      await load()
      return preset
   }

   return { presets, load, create }
}

export function useCmsPresetLibrary() {
   const cache = usePresetCache()

   async function list() {
      return cmsApi<CmsBlockPreset[]>(PRESETS_ENDPOINT)
   }

   async function update(id: string, input: { name: string; description?: string }) {
      const preset = await cmsApi<CmsBlockPreset>(`${PRESETS_ENDPOINT}/${id}`, {
         method: 'PUT',
         body: input,
      })
      cache.value = {}
      return preset
   }

   async function remove(id: string) {
      await cmsApi(`${PRESETS_ENDPOINT}/${id}`, { method: 'DELETE' })
      cache.value = {}
   }

   return { list, update, remove }
}
