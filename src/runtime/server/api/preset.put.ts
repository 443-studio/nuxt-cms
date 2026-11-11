import { createError, defineEventHandler } from 'h3'
import type { CmsBlockPreset } from '../../shared/presets'
import { presetUpdateSchema, renamePreset } from '../../shared/presets'
import {
   presetIdParam,
   readPreset,
   readPresetBody,
   requirePresetAccess,
   writePreset,
} from '../utils/presets'

export default defineEventHandler(async (event): Promise<CmsBlockPreset> => {
   await requirePresetAccess(event, 'manage')
   const id = presetIdParam(event)
   const parsed = presetUpdateSchema.safeParse(await readPresetBody(event))
   if (!parsed.success) {
      throw createError({
         statusCode: 400,
         statusMessage: parsed.error.issues[0]?.message ?? 'Invalid preset',
      })
   }
   const preset = renamePreset(await readPreset(id), parsed.data, new Date().toISOString())
   await writePreset(preset)
   return preset
})
