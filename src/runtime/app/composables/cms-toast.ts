import { toast } from '@xleddyl/443-components-vue'

export interface CmsNotice {
   title: string
   description?: string
   color?: 'success' | 'error'
}

export function showCmsNotice(notice: CmsNotice) {
   const show =
      notice.color === 'error' ? toast.error : notice.color === 'success' ? toast.success : toast
   return show(notice.title, { description: notice.description })
}
