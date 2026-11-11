<template>
   <div class="cms-page">
      <KEmptyState
         :icon="cmsIcon(access?.known === false ? 'exclamation-triangle' : 'lock-closed')"
         :title="access?.known === false ? 'Your role no longer exists' : 'Nothing to show yet'"
         :description="
            access?.known === false
               ? `Your account has the role '${access.role}', which is not configured anymore, so it grants no access. Ask an administrator to assign you a new role.`
               : 'Your role does not give access to any section. Ask an administrator for more permissions.'
         "
         fill
      />
   </div>
</template>

<script setup lang="ts">
import { EmptyState as KEmptyState } from '@xleddyl/443-components-vue'
import { definePageMeta, navigateTo, useRoute } from '#imports'
import { useCmsPermissions } from '../composables/cms-permissions'
import { cmsIcon } from '../utils/ui'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth', content: 'centered' })

const route = useRoute()
const { access, firstPath } = useCmsPermissions()

const first = firstPath()
if (first) await navigateTo({ path: first, query: route.query }, { replace: true })
</script>
