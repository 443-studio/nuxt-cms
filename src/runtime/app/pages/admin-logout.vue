<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <KAuthLogout
         :logout="clear"
         :account="account"
         login-to="/cms/login"
         footer="Powered by nuxt-cms"
         aside-title="Your content, next to your code."
         aside-description="Edit entries, pages and media for this site in one place."
      >
         <template #brand>
            <CmsBrandMark size="lg" hide-text />
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
