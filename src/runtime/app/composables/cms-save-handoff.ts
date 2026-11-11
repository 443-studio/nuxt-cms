import { useState } from '#imports'

export function useCmsSaveHandoff(entry: string) {
   const pending = useState<Record<string, Record<string, unknown>>>('cms:save-handoff', () => ({}))
   const keyOf = (id: string) => `${entry}/${id}`
   return {
      stash(id: string, state: Record<string, unknown>) {
         pending.value = { ...pending.value, [keyOf(id)]: state }
      },
      take(id: string): Record<string, unknown> | null {
         const key = keyOf(id)
         const state = pending.value[key] ?? null
         if (state) {
            const { [key]: _taken, ...rest } = pending.value
            pending.value = rest
         }
         return state
      },
   }
}
