import { toast } from '@xleddyl/443-components-vue'

export interface CmsToast {
   id: number
   title: string
   description?: string
   color?: 'success' | 'error'
}

export function useCmsToast() {
   function add(input: Omit<CmsToast, 'id'>) {
      const show =
         input.color === 'error' ? toast.error : input.color === 'success' ? toast.success : toast
      return { id: show(input.title, { description: input.description }) }
   }

   function remove(id: string | number) {
      toast.dismiss(id)
   }

   return { add, remove }
}
