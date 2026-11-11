import type { FieldConfig, FieldType } from './index'

export type ConditionValue = string | number | boolean

export interface FieldCondition {
   field: string
   eq?: ConditionValue
   neq?: ConditionValue
   in?: readonly ConditionValue[]
   notIn?: readonly ConditionValue[]
   gt?: number | string
   gte?: number | string
   lt?: number | string
   lte?: number | string
   empty?: boolean
   has?: string
}

export interface AllCondition {
   all: readonly ShowIfCondition[]
}

export interface AnyCondition {
   any: readonly ShowIfCondition[]
}

export interface NotCondition {
   not: ShowIfCondition
}

export type ShowIfCondition = FieldCondition | AllCondition | AnyCondition | NotCondition

export type CmsShowIf = ShowIfCondition | readonly ShowIfCondition[]

export const CONDITION_OPERATORS = [
   'eq',
   'neq',
   'in',
   'notIn',
   'gt',
   'gte',
   'lt',
   'lte',
   'empty',
   'has',
] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export const CONDITION_GROUPS = ['all', 'any', 'not'] as const

export type ConditionScope = Record<string, Pick<FieldConfig, 'type'>> | null | undefined

type Values = Record<string, unknown> | null | undefined

function isConditionList(value: unknown): value is readonly ShowIfCondition[] {
   return Array.isArray(value)
}

export function fieldConditions(field: FieldConfig): ShowIfCondition[] {
   const showIf = field.showIf
   if (!showIf) return []
   return isConditionList(showIf) ? [...showIf] : [showIf]
}

function isEmptyLinkTarget(link: Record<string, unknown>): boolean {
   return (
      isEmptyConditionValue(link.url) &&
      (isEmptyConditionValue(link.entry) || isEmptyConditionValue(link.id))
   )
}

export function isEmptyConditionValue(value: unknown, type?: FieldType): boolean {
   if (value == null) return true
   if (typeof value === 'string') return !value.trim()
   if (Array.isArray(value)) return !value.length
   if (typeof value === 'object') {
      if (type === 'json') return !Object.keys(value).length
      if (type === 'link') return isEmptyLinkTarget(value as Record<string, unknown>)
      return Object.values(value).every((entry) => isEmptyConditionValue(entry))
   }
   return false
}

function timeOf(value: string): number | null {
   const time = new Date(value).getTime()
   return Number.isNaN(time) ? null : time
}

function compareValues(value: unknown, expected: unknown, type?: FieldType): number | null {
   if (typeof value === 'number' && typeof expected === 'number') return value - expected
   if (typeof value !== 'string' || typeof expected !== 'string' || !value) return null
   if (type === 'datetime') {
      const a = timeOf(value)
      const b = timeOf(expected)
      return a === null || b === null ? null : a - b
   }
   return value < expected ? -1 : value > expected ? 1 : 0
}

function sameValue(value: unknown, expected: unknown, type?: FieldType): boolean {
   if (type === 'datetime') return compareValues(value, expected, type) === 0
   return value === expected
}

function sameItem(item: unknown, expected: unknown, type?: FieldType): boolean {
   if (type === 'tags' && typeof item === 'string' && typeof expected === 'string')
      return item.trim().toLowerCase() === expected.trim().toLowerCase()
   return item === expected
}

function ordered(test: (diff: number) => boolean) {
   return (value: unknown, expected: unknown, type?: FieldType) => {
      const diff = compareValues(value, expected, type)
      return diff !== null && test(diff)
   }
}

const OPERATORS: Record<
   ConditionOperator,
   (value: unknown, expected: unknown, type?: FieldType) => boolean
> = {
   eq: sameValue,
   neq: (value, expected, type) => !sameValue(value, expected, type),
   in: (value, expected, type) =>
      Array.isArray(expected) && expected.some((option) => sameValue(value, option, type)),
   notIn: (value, expected, type) =>
      Array.isArray(expected) && !expected.some((option) => sameValue(value, option, type)),
   gt: ordered((diff) => diff > 0),
   gte: ordered((diff) => diff >= 0),
   lt: ordered((diff) => diff < 0),
   lte: ordered((diff) => diff <= 0),
   empty: (value, expected, type) => isEmptyConditionValue(value, type) === expected,
   has: (value, expected, type) =>
      Array.isArray(value) && value.some((item) => sameItem(item, expected, type)),
}

function matchesFieldCondition(condition: FieldCondition, values: Values, scope: ConditionScope) {
   const value = values?.[condition.field]
   const type = scope?.[condition.field]?.type
   let matched = false
   for (const operator of CONDITION_OPERATORS) {
      const expected = condition[operator]
      if (expected === undefined) continue
      if (!OPERATORS[operator](value, expected, type)) return false
      matched = true
   }
   return matched
}

export function matchesShowIf(
   condition: ShowIfCondition,
   values: Values,
   scope?: ConditionScope
): boolean {
   if (!condition || typeof condition !== 'object') return false
   if ('all' in condition)
      return (
         isConditionList(condition.all) &&
         condition.all.every((c) => matchesShowIf(c, values, scope))
      )
   if ('any' in condition)
      return (
         isConditionList(condition.any) &&
         condition.any.some((c) => matchesShowIf(c, values, scope))
      )
   if ('not' in condition) return !matchesShowIf(condition.not, values, scope)
   return matchesFieldCondition(condition, values, scope)
}

export function isFieldVisible(
   field: FieldConfig,
   values: Values,
   scope?: ConditionScope
): boolean {
   return fieldConditions(field).every((condition) => matchesShowIf(condition, values, scope))
}
