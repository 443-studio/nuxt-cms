import { defineEventHandler } from 'h3'
import type { CmsBlockPreset } from '../../shared/presets'
import { presetFits, sortPresets } from '../../shared/presets'
import { presetBlocksField, readPresets, requirePresetAccess } from '../utils/presets'

export default defineEventHandler(async (event): Promise<CmsBlockPreset[]> => {
   await requirePresetAccess(event, 'use')
   const { field } = presetBlocksField(event)
   return sortPresets((await readPresets()).filter((preset) => presetFits(preset, field)))
})
