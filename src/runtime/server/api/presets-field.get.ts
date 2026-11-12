import { defineEventHandler } from 'h3'
import type { CmsBlockPreset } from '../../shared/presets'
import { presetFits, presetReadable, sortPresets } from '../../shared/presets'
import { can } from '../../shared/roles'
import { presetBlocksField, readPresets, requirePresetAccess } from '../utils/presets'

export default defineEventHandler(async (event): Promise<CmsBlockPreset[]> => {
   const { access } = await requirePresetAccess(event, 'use')
   const { source, field } = presetBlocksField(event)
   return sortPresets(
      (await readPresets()).filter(
         (preset) =>
            presetFits(preset, field, source) &&
            presetReadable(preset, (permission) => can(access, permission))
      )
   )
})
