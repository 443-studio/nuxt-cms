import { getCurrentScope, onScopeDispose, readonly, ref, watch } from '#imports'
import type { CmsHistoryOptions } from '../../shared/history'
import { createCmsHistory } from '../../shared/history'

export function useCmsHistory(options: Omit<CmsHistoryOptions, 'onUpdate'>) {
   const canUndo = ref(false)
   const canRedo = ref(false)
   const history = createCmsHistory({
      ...options,
      onUpdate: (status) => {
         canUndo.value = status.canUndo
         canRedo.value = status.canRedo
      },
   })

   watch(options.state, history.observe)

   if (getCurrentScope()) onScopeDispose(history.dispose)

   return {
      canUndo: readonly(canUndo),
      canRedo: readonly(canRedo),
      change: history.change,
      release: history.release,
      undo: history.undo,
      redo: history.redo,
      reset: history.reset,
   }
}
