export const CMS_HISTORY_MAX = 100
export const CMS_HISTORY_DELAY = 400

export interface CmsHistoryStatus {
   canUndo: boolean
   canRedo: boolean
}

export interface CmsHistoryOptions<S = number | null> {
   state: () => Record<string, unknown>
   selected: () => S
   restore: (state: Record<string, unknown>, selected: S) => void
   omit?: readonly string[]
   max?: number
   delay?: number
   onUpdate?: (status: CmsHistoryStatus) => void
}

interface Entry<S> {
   json: string
   selected: S
   before: S
}

interface Intent<S> {
   key: string | null
   before: S
   held: boolean
}

export function createCmsHistory<S = number | null>(options: CmsHistoryOptions<S>) {
   const max = options.max ?? CMS_HISTORY_MAX
   const delay = options.delay ?? CMS_HISTORY_DELAY
   const omitted = new Set(options.omit ?? [])

   const status: CmsHistoryStatus = { canUndo: false, canRedo: false }

   let entries: Entry<S>[] = []
   let index = 0
   let intent: Intent<S> | null = null
   let timer: ReturnType<typeof setTimeout> | undefined

   function serialize(): string {
      const state = options.state()
      return JSON.stringify(
         Object.fromEntries(Object.entries(state).filter(([key]) => !omitted.has(key)))
      )
   }

   function refresh() {
      const pending = !!intent && serialize() !== entries[index]!.json
      const canUndo = index > 0 || pending
      const canRedo = !pending && index < entries.length - 1
      if (canUndo === status.canUndo && canRedo === status.canRedo) return
      status.canUndo = canUndo
      status.canRedo = canRedo
      options.onUpdate?.({ ...status })
   }

   function clearTimer() {
      if (timer === undefined) return
      clearTimeout(timer)
      timer = undefined
   }

   function reset() {
      clearTimer()
      intent = null
      const selected = options.selected()
      entries = [{ json: serialize(), selected, before: selected }]
      index = 0
      refresh()
   }

   function flush() {
      clearTimer()
      const current = intent
      intent = null
      if (!current) return
      const json = serialize()
      if (json !== entries[index]!.json) {
         entries = entries.slice(0, index + 1)
         entries.push({ json, selected: options.selected(), before: current.before })
         if (entries.length > max + 1) entries = entries.slice(entries.length - max - 1)
         index = entries.length - 1
      }
      refresh()
   }

   function change(key?: string, hold = false) {
      const coalesce = key ?? null
      if (intent && (coalesce === null || intent.key !== coalesce)) flush()
      if (!intent) intent = { key: coalesce, before: options.selected(), held: false }
      if (hold && coalesce !== null) {
         intent.held = true
         clearTimer()
      }
   }

   function release() {
      if (intent?.held) flush()
   }

   function observe() {
      const json = serialize()
      const entry = entries[index]!
      if (json === entry.json) {
         if (intent && timer === undefined && !intent.held) intent = null
         refresh()
         return
      }
      if (!intent) {
         entry.json = json
         return
      }
      if (intent.key === null) {
         flush()
         return
      }
      if (intent.held) {
         refresh()
         return
      }
      clearTimer()
      timer = setTimeout(flush, delay)
      refresh()
   }

   function apply(entry: Entry<S>, selected: S) {
      const values = JSON.parse(entry.json) as Record<string, unknown>
      options.restore({ ...options.state(), ...values }, selected)
      refresh()
   }

   function undo() {
      flush()
      if (index === 0) return false
      const from = entries[index]!
      index--
      apply(entries[index]!, from.before)
      return true
   }

   function redo() {
      flush()
      if (index >= entries.length - 1) return false
      index++
      apply(entries[index]!, entries[index]!.selected)
      return true
   }

   reset()

   return {
      change,
      release,
      observe,
      undo,
      redo,
      reset,
      flush,
      dispose: clearTimer,
      canUndo: () => status.canUndo,
      canRedo: () => status.canRedo,
   }
}
