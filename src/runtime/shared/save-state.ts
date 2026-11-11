type State = Record<string, unknown>

function sameValue(a: unknown, b: unknown): boolean {
   return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

export function cloneState<T extends State>(state: T): T {
   return JSON.parse(JSON.stringify(state)) as T
}

export interface CmsSavedState {
   state: State
   clean: boolean
}

export function mergeSavedState(submitted: State, current: State, saved: State): CmsSavedState {
   if (sameValue(current, submitted)) return { state: { ...saved }, clean: true }
   const state: State = {}
   for (const key of new Set([...Object.keys(saved), ...Object.keys(current)])) {
      const edited = Object.hasOwn(current, key) && !sameValue(current[key], submitted[key])
      state[key] = edited || !Object.hasOwn(saved, key) ? current[key] : saved[key]
   }
   return { state, clean: sameValue(state, saved) }
}
