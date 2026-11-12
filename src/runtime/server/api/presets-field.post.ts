import { createError, defineEventHandler } from 'h3'
import type { CmsBlockPreset } from '../../shared/presets'
import { CMS_PRESET_MAX_COUNT, buildPreset, presetCreateSchema } from '../../shared/presets'
import { customId } from '../utils/custom-id'
import {
   presetBlocksField,
   readPresetBody,
   readPresets,
   requirePresetAccess,
   writePreset,
} from '../utils/presets'
import { getContentI18n } from '../utils/registry'

export default defineEventHandler(async (event): Promise<CmsBlockPreset> => {
   await requirePresetAccess(event, 'use')
   const { source, field } = presetBlocksField(event)
   const parsed = presetCreateSchema.safeParse(await readPresetBody(event))
   if (!parsed.success) {
      throw createError({
         statusCode: 400,
         statusMessage: parsed.error.issues[0]?.message ?? 'Invalid preset',
      })
   }
   if ((await readPresets()).length >= CMS_PRESET_MAX_COUNT) {
      throw createError({
         statusCode: 409,
         statusMessage: `There are already ${CMS_PRESET_MAX_COUNT} presets, delete one first`,
      })
   }
   const built = buildPreset(parsed.data, field, getContentI18n(), {
      id: customId('preset'),
      source,
      now: new Date().toISOString(),
   })
   if ('error' in built) throw createError({ statusCode: 400, statusMessage: built.error })
   await writePreset(built.preset)
   return built.preset
})
