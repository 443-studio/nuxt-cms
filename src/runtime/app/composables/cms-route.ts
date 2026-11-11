import { ROUTE_LOCATION_KEY, useRouteState } from '@xleddyl/443-components-vue'
import { computed, provide, useState } from '#imports'

export const CMS_NEW_RECORD = 'new'

export function provideCmsRouteLocation() {
   provide(ROUTE_LOCATION_KEY, 'hash')
}

export function useCmsNavigationPending() {
   return useState<boolean>('k-navigation-pending', () => false)
}

export function useCmsRouteFlag(key: string, value = 'open') {
   const param = useRouteState(key, { location: 'hash' })
   return computed({
      get: () => param.value === value,
      set: (open: boolean) => {
         param.value = open ? value : undefined
      },
   })
}

export function useCmsPageQuery(key: string) {
   const param = useRouteState(key, { location: 'query', history: 'replace' })
   return computed({
      get: () => param.value ?? '',
      set: (value: string) => {
         param.value = value.trim() ? value : undefined
      },
   })
}
