import type { FieldConfig } from '#nuxt-cms'
import type { MenuEntry } from '@xleddyl/443-components-vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, toValue } from '#imports'
import {
   clearTranslations,
   copyTranslations,
   hasTranslatableContent,
} from '../../shared/translations'
import { cmsIcon } from '../utils/ui'
import { useCmsConfirm } from './cms-confirm'
import { useCmsRuntime } from './cms-runtime'
import { useCmsToast } from './cms-toast'

type Values = Record<string, unknown>

export interface CmsTranslationActionsOptions {
   fields: MaybeRefOrGetter<Record<string, FieldConfig>>
   state: Ref<Values>
   locale?: MaybeRefOrGetter<string | null | undefined>
   disabled?: MaybeRefOrGetter<boolean | null | undefined>
   apply?: (values: Values) => void
}

function code(locale: string) {
   return locale.toUpperCase()
}

function valuesLabel(count: number) {
   return `${count} ${count === 1 ? 'value' : 'values'}`
}

export function useCmsTranslationActions(options: CmsTranslationActionsOptions) {
   const { i18n } = useCmsRuntime()
   const confirmAction = useCmsConfirm()
   const toast = useCmsToast()

   function commit(values: Values) {
      if (options.apply) options.apply(values)
      else options.state.value = values
   }

   function copy(from: string, to: string, overwrite: boolean) {
      const result = copyTranslations(toValue(options.fields), options.state.value, i18n, {
         from,
         to,
         overwrite,
      })
      if (!result.count) return
      commit(result.values)
      toast.add({
         title: `Copied ${valuesLabel(result.count)} from ${code(from)} to ${code(to)}`,
         color: 'success',
      })
   }

   async function replace(from: string, to: string) {
      const confirmed = await confirmAction(
         `Every ${code(to)} value that has a ${code(
            from
         )} version is overwritten. The change stays unsaved until you save.`,
         { title: `Replace ${code(to)} with ${code(from)}?`, confirmLabel: 'Replace' }
      )
      if (confirmed) copy(from, to, true)
   }

   async function clear(locale: string) {
      const confirmed = await confirmAction(
         `The ${code(locale)} values are removed and the site shows the ${code(
            i18n.defaultLocale
         )} text instead. The change stays unsaved until you save.`,
         { title: `Clear ${code(locale)}?`, confirmLabel: 'Clear' }
      )
      if (!confirmed) return
      const result = clearTranslations(toValue(options.fields), options.state.value, i18n, locale)
      commit(result.values)
      toast.add({
         title: `Cleared ${valuesLabel(result.count)} in ${code(locale)}`,
         color: 'success',
      })
   }

   function copyItem(fields: Record<string, FieldConfig>, from: string, to: string): MenuEntry {
      const values = options.state.value
      const empty = copyTranslations(fields, values, i18n, { from, to }).count
      const all = copyTranslations(fields, values, i18n, { from, to, overwrite: true }).count
      return {
         label: `Copy ${code(from)} into ${code(to)}`,
         icon: cmsIcon('language'),
         disabled: !all,
         disabledReason: `Nothing in ${code(from)} to copy`,
         children: [
            {
               label: 'Fill empty values',
               description: empty
                  ? `${valuesLabel(empty)}, keeps what ${code(to)} has`
                  : `No empty ${code(to)} values`,
               disabled: !empty,
               onSelect: () => copy(from, to, false),
            },
            {
               label: 'Replace all values…',
               description: `${valuesLabel(all)}, overwrites ${code(to)}`,
               onSelect: () => void replace(from, to),
            },
         ],
      }
   }

   function clearItem(fields: Record<string, FieldConfig>, locale: string): MenuEntry {
      const count = clearTranslations(fields, options.state.value, i18n, locale).count
      return {
         label: `Clear ${code(locale)}…`,
         icon: cmsIcon('backspace'),
         tone: 'danger',
         description: count
            ? `${valuesLabel(count)}, falls back to ${code(i18n.defaultLocale)}`
            : undefined,
         disabled: !count,
         disabledReason: `No ${code(locale)} values`,
         onSelect: () => void clear(locale),
      }
   }

   const items = computed<MenuEntry[]>(() => {
      if (toValue(options.disabled) || i18n.locales.length < 2) return []
      const fields = toValue(options.fields)
      if (!hasTranslatableContent(fields)) return []
      const active = toValue(options.locale)
      const targets =
         active && i18n.locales.includes(active)
            ? [active]
            : i18n.locales.filter((locale) => locale !== i18n.defaultLocale)
      return [
         { type: 'label', label: 'Translations' },
         ...targets.flatMap((target) => [
            ...i18n.locales
               .filter((source) => source !== target)
               .map((source) => copyItem(fields, source, target)),
            ...(target === i18n.defaultLocale ? [] : [clearItem(fields, target)]),
         ]),
      ]
   })

   return { items }
}
