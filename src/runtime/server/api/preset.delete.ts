import { defineEventHandler } from 'h3'
import { deletePreset, presetIdParam, readPreset, requirePresetAccess } from '../utils/presets'

export default defineEventHandler(async (event) => {
   await requirePresetAccess(event, 'manage')
   const id = presetIdParam(event)
   await readPreset(id)
   await deletePreset(id)
   return { ok: true }
})
