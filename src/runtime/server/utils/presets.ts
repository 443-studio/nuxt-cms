import type { H3Event } from 'h3'
import { createError, getRequestHeader, getRouterParam, readRawBody } from 'h3'
import { eq, like } from 'drizzle-orm'
import { useDb } from '#cms-db'
import { cms_settings } from '#cms-tables'
import type { CmsSessionUser, FieldConfig } from '../../shared/index'
import { entryFieldsFor } from '../../shared/index'
import type { CmsBlockPreset, CmsPresetAction } from '../../shared/presets'
import {
   CMS_PRESET_KEY_PREFIX,
   CMS_PRESET_MAX_BYTES,
   parseStoredPreset,
   presetKey,
   presetPermission,
} from '../../shared/presets'
import { getRegistryEntry } from './registry'
import { assertCmsPermission, requireCmsAccess } from './permissions'

const PRESET_ID = /^preset_[A-Za-z0-9]{1,64}$/

export async function requirePresetAccess(
   event: H3Event,
   action: CmsPresetAction
): Promise<CmsSessionUser> {
   const { user, access } = await requireCmsAccess(event)
   assertCmsPermission(access, presetPermission(action, getRouterParam(event, 'collection') ?? ''))
   return user
}

export function presetBlocksField(event: H3Event): { source: string; field: FieldConfig } {
   const { name, entry } = getRegistryEntry(event)
   const key = getRouterParam(event, 'field') ?? ''
   const fields = entryFieldsFor(entry)
   const field = Object.hasOwn(fields, key) ? fields[key] : undefined
   if (!field || field.type !== 'blocks') {
      throw createError({ statusCode: 404, statusMessage: `Unknown blocks field: ${key}` })
   }
   return { source: `${name}.${key}`, field }
}

export function presetIdParam(event: H3Event): string {
   const id = getRouterParam(event, 'id') ?? ''
   if (!PRESET_ID.test(id)) throw createError({ statusCode: 404, statusMessage: 'Unknown preset' })
   return id
}

export async function readPresetBody(event: H3Event): Promise<unknown> {
   const tooLarge = () => createError({ statusCode: 413, statusMessage: 'The preset is too large' })
   if (Number(getRequestHeader(event, 'content-length') ?? 0) > CMS_PRESET_MAX_BYTES)
      throw tooLarge()
   const text = (await readRawBody(event, 'utf8')) ?? ''
   if (new TextEncoder().encode(text).length > CMS_PRESET_MAX_BYTES) throw tooLarge()
   try {
      return JSON.parse(text)
   } catch {
      throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
   }
}

export async function readPresets(): Promise<CmsBlockPreset[]> {
   const rows = await useDb()
      .select()
      .from(cms_settings)
      .where(like(cms_settings.key, `${CMS_PRESET_KEY_PREFIX}%`))
   return rows.flatMap((row) => {
      const preset = parseStoredPreset(row.value)
      return preset && presetKey(preset.id) === row.key ? [preset] : []
   })
}

export async function readPreset(id: string): Promise<CmsBlockPreset> {
   const [row] = await useDb()
      .select()
      .from(cms_settings)
      .where(eq(cms_settings.key, presetKey(id)))
   const preset = row ? parseStoredPreset(row.value) : null
   if (!preset) throw createError({ statusCode: 404, statusMessage: 'Unknown preset' })
   return preset
}

export async function writePreset(preset: CmsBlockPreset): Promise<void> {
   const key = presetKey(preset.id)
   const value = JSON.stringify(preset)
   const updatedAt = preset.updatedAt
   await useDb()
      .insert(cms_settings)
      .values({ key, value, updatedAt })
      .onConflictDoUpdate({ target: cms_settings.key, set: { value, updatedAt } })
}

export async function deletePreset(id: string): Promise<void> {
   await useDb()
      .delete(cms_settings)
      .where(eq(cms_settings.key, presetKey(id)))
}
