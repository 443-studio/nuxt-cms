import { z } from 'zod'
import type { CmsI18n, FieldConfig } from './index'
import type { CmsClipboardNotice, CmsPasteResult } from './clipboard'
import { pasteBlocks, skippedText } from './clipboard'
import { blockSignature, blockSignatures } from './block-signature'
import type { CmsBlockValue } from './preview'

export const CMS_PRESET_KEY_PREFIX = 'cms:presets:'

export const CMS_PRESET_NAME_MAX = 80

export const CMS_PRESET_DESCRIPTION_MAX = 300

export const CMS_PRESET_MAX_ITEMS = 100

export const CMS_PRESET_MAX_BYTES = 1_000_000

export const CMS_PRESET_MAX_COUNT = 500

export type CmsPresetAction = 'use' | 'manage'

export function presetPermission(action: CmsPresetAction, entry: string): string {
   return action === 'use' ? `${entry}.update` : 'settings.manage'
}

export interface CmsBlockPreset {
   id: string
   name: string
   description?: string
   source: string
   types: string[]
   signatures?: Record<string, string>
   items: CmsBlockValue[]
   createdAt: string
   updatedAt: string
}

const name = z.string().trim().min(1, 'Give the preset a name').max(CMS_PRESET_NAME_MAX)

const description = z.string().trim().max(CMS_PRESET_DESCRIPTION_MAX)

const item = z
   .record(z.string(), z.unknown())
   .refine(
      (value) => typeof value.type === 'string' && value.type !== '',
      'Every block needs a type'
   )

export const presetCreateSchema = z
   .object({
      name,
      description: description.optional(),
      items: z.array(item).min(1, 'A preset needs at least one block').max(CMS_PRESET_MAX_ITEMS),
   })
   .strict()

export const presetUpdateSchema = z.object({ name, description: description.optional() }).strict()

export interface CmsPresetDetails {
   name: string
   description?: string
}

export type CmsPresetCreate = z.infer<typeof presetCreateSchema>

export type CmsPresetUpdate = z.infer<typeof presetUpdateSchema>

const storedSchema = z.object({
   id: z.string().min(1),
   name: z.string().min(1),
   description: z.string().optional(),
   source: z.string(),
   types: z.array(z.string()),
   signatures: z.record(z.string(), z.string()).optional(),
   items: z.array(z.record(z.string(), z.unknown())),
   createdAt: z.string(),
   updatedAt: z.string(),
})

export function presetKey(id: string): string {
   return `${CMS_PRESET_KEY_PREFIX}${id}`
}

export function presetTypes(items: readonly CmsBlockValue[]): string[] {
   return [...new Set(items.map((value) => String(value.type)))].sort()
}

export function presetFits(
   preset: Pick<CmsBlockPreset, 'types' | 'signatures' | 'source'>,
   field: Pick<FieldConfig, 'blocks'>,
   source: string
): boolean {
   const blocks = field.blocks ?? {}
   if (!preset.types.length || !preset.types.every((type) => Object.hasOwn(blocks, type)))
      return false
   const signatures = preset.signatures
   if (!signatures) return preset.source === source
   return preset.types.every(
      (type) =>
         Object.hasOwn(signatures, type) && signatures[type] === blockSignature(blocks[type]!)
   )
}

export function presetSourceEntry(preset: Pick<CmsBlockPreset, 'source'>): string {
   return preset.source.split('.')[0] ?? ''
}

export function presetReadable(
   preset: Pick<CmsBlockPreset, 'source'>,
   canRead: (permission: string) => boolean
): boolean {
   const entry = presetSourceEntry(preset)
   return !!entry && canRead(`${entry}.read`)
}

export function parseStoredPreset(raw: string): CmsBlockPreset | null {
   try {
      const parsed = storedSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) return null
      const { description: text, ...rest } = parsed.data
      return { ...rest, ...(text ? { description: text } : {}) }
   } catch {
      return null
   }
}

export function sortPresets(presets: readonly CmsBlockPreset[]): CmsBlockPreset[] {
   return [...presets].sort(
      (a, b) =>
         a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
         a.createdAt.localeCompare(b.createdAt)
   )
}

export type CmsPresetBuild = { preset: CmsBlockPreset } | { error: string }

export function buildPreset(
   input: CmsPresetCreate,
   field: Pick<FieldConfig, 'blocks'>,
   i18n: CmsI18n,
   meta: { id: string; source: string; now: string }
): CmsPresetBuild {
   const result = pasteBlocks([], 0, input.items, { blocks: field.blocks }, i18n)
   if (result.unknown.length)
      return {
         error: `Not a block of this field: ${[...new Set(result.unknown)].join(', ')}`,
      }
   const types = presetTypes(result.list)
   const preset: CmsBlockPreset = {
      id: meta.id,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      source: meta.source,
      types,
      signatures: blockSignatures(field.blocks, types),
      items: result.list,
      createdAt: meta.now,
      updatedAt: meta.now,
   }
   if (JSON.stringify(preset).length > CMS_PRESET_MAX_BYTES)
      return { error: 'The preset is too large' }
   return { preset }
}

export function renamePreset(
   preset: CmsBlockPreset,
   input: CmsPresetUpdate,
   now: string
): CmsBlockPreset {
   const { description: _description, ...rest } = preset
   return {
      ...rest,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      updatedAt: now,
   }
}

export function presetBlockCount(count: number): string {
   return `${count} ${count === 1 ? 'block' : 'blocks'}`
}

export function presetInsertNotice(
   result: CmsPasteResult,
   field: Pick<FieldConfig, 'max'>,
   preset: Pick<CmsBlockPreset, 'name'>
): CmsClipboardNotice {
   const description = skippedText(result, field)
   if (!result.pasted) return { title: 'Nothing inserted', description, color: 'error' }
   return {
      title: `${preset.name} inserted`,
      description: description ?? presetBlockCount(result.pasted),
      color: description ? undefined : 'success',
   }
}

export const CMS_PRESET_PICKER_GROUP = 'Presets'

export const CMS_PRESET_ICON = 'bookmark'

export interface CmsPresetPickerItem {
   id: string
   label: string
   description: string
   keywords: string[]
}

export function presetPickerItem(preset: CmsBlockPreset): CmsPresetPickerItem {
   const count = presetBlockCount(preset.items.length)
   return {
      id: preset.id,
      label: preset.name,
      description: preset.description ? `${count} · ${preset.description}` : count,
      keywords: [CMS_PRESET_PICKER_GROUP, ...preset.types],
   }
}
