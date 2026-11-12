export const CMS_EDITOR_PANES = {
   left: { min: 260, max: 440, initial: 288 },
   right: { min: 300, max: 560, initial: 360 },
} as const

export const CMS_PREVIEW_DEVICE_WIDTHS = {
   desktop: null,
   tablet: 768,
   mobile: 390,
} as const

export type CmsPreviewDevice = keyof typeof CMS_PREVIEW_DEVICE_WIDTHS
