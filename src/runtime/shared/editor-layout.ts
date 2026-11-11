export type CmsEditorPanelName = 'tree' | 'inspector'

export interface CmsEditorPanelState {
   width: number
   collapsed: boolean
}

export type CmsEditorLayout = Record<CmsEditorPanelName, CmsEditorPanelState>

export interface CmsEditorPanelLimits {
   min: number
   max: number
   initial: number
}

export const CMS_EDITOR_LAYOUT_KEY = 'nuxt-cms:editor-layout'

export const CMS_EDITOR_COMPACT_QUERY = '(max-width: 1023px)'

export const CMS_EDITOR_PANEL_LIMITS: Record<CmsEditorPanelName, CmsEditorPanelLimits> = {
   tree: { min: 260, max: 440, initial: 288 },
   inspector: { min: 300, max: 560, initial: 360 },
}

export const CMS_EDITOR_RESIZE_STEP = 16

export const CMS_PREVIEW_DEVICE_WIDTHS = {
   desktop: null,
   tablet: 768,
   mobile: 390,
} as const

export type CmsPreviewDevice = keyof typeof CMS_PREVIEW_DEVICE_WIDTHS

export function clampPanelWidth(width: number, limits: CmsEditorPanelLimits): number {
   if (!Number.isFinite(width)) return limits.initial
   return Math.round(Math.min(Math.max(width, limits.min), limits.max))
}

export function defaultEditorLayout(): CmsEditorLayout {
   return {
      tree: { width: CMS_EDITOR_PANEL_LIMITS.tree.initial, collapsed: false },
      inspector: { width: CMS_EDITOR_PANEL_LIMITS.inspector.initial, collapsed: false },
   }
}

function parsePanel(value: unknown, name: CmsEditorPanelName): CmsEditorPanelState {
   const limits = CMS_EDITOR_PANEL_LIMITS[name]
   const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
   return {
      width:
         typeof record.width === 'number' ? clampPanelWidth(record.width, limits) : limits.initial,
      collapsed: record.collapsed === true,
   }
}

export function parseEditorLayout(raw: string | null | undefined): CmsEditorLayout {
   if (!raw) return defaultEditorLayout()
   let data: unknown
   try {
      data = JSON.parse(raw)
   } catch {
      return defaultEditorLayout()
   }
   const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
   return {
      tree: parsePanel(record.tree, 'tree'),
      inspector: parsePanel(record.inspector, 'inspector'),
   }
}

export function panelWidthForKey(
   key: string,
   width: number,
   limits: CmsEditorPanelLimits,
   grows: 'right' | 'left'
): number | null {
   if (key === 'Home') return limits.min
   if (key === 'End') return limits.max
   if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
   const towardGrowth = (key === 'ArrowRight') === (grows === 'right')
   return clampPanelWidth(
      width + (towardGrowth ? CMS_EDITOR_RESIZE_STEP : -CMS_EDITOR_RESIZE_STEP),
      limits
   )
}
