<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <KAuthLogout :logout="clear" :account="account" login-to="/cms/login">
         <template #brand>
            <CmsBrandMark size="lg" hide-text />
         </template>
         <template #footer>
            <CmsPoweredBy />
         </template>
      </KAuthLogout>
   </KRoot>
</template>

<script setup lang="ts">
import { AuthLogout as KAuthLogout, Root as KRoot, provideTheme } from '@xleddyl/443-components-vue'
import { computed, definePageMeta, useUserSession } from '#imports'
import { useCmsAccount } from '../composables/cms-account'
import { useCmsTheme } from '../composables/cms-theme'

definePageMeta({ layout: false, middleware: 'cms-auth' })

const theme = useCmsTheme()
provideTheme(theme)
const { clear } = useUserSession()
const { user, email } = useCmsAccount()
const account = computed(() => ({
   email: email.value,
   name: user.value?.name?.trim() || undefined,
}))
</script>

<style src="../../assets/admin.css" />
