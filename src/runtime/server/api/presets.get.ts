import { defineEventHandler } from 'h3'
import type { CmsBlockPreset } from '../../shared/presets'
import { sortPresets } from '../../shared/presets'
import { readPresets, requirePresetAccess } from '../utils/presets'

export default defineEventHandler(async (event): Promise<CmsBlockPreset[]> => {
   await requirePresetAccess(event, 'manage')
   return sortPresets(await readPresets())
})
