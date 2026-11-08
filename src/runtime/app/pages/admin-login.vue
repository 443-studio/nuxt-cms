<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <KAuthLogin
         :submit="login"
         :submit-error="loginError"
         title="Welcome back"
         description="Sign in to manage your content."
         footer="Powered by nuxt-cms"
         aside-title="Your content, next to your code."
         aside-description="Edit entries, pages and media for this site in one place."
      >
         <template #brand>
            <CmsBrandMark size="lg" hide-text />
         </template>
      </KAuthLogin>
   </KRoot>
</template>

<script setup lang="ts">
import {
   AuthLogin as KAuthLogin,
   Root as KRoot,
   provideTheme,
   type AuthCredentials,
   type FormSubmitErrorResolver,
} from '@xleddyl/443-components-vue'
import { definePageMeta, navigateTo, useUserSession } from '#imports'
import { errorMessage } from '../utils/ui'
import { useCmsTheme } from '../composables/cms-theme'

definePageMeta({ layout: false })

const theme = useCmsTheme()
provideTheme(theme)
const { loggedIn } = useUserSession()
if (loggedIn.value) {
   await navigateTo('/cms', { replace: true })
}

async function login(credentials: AuthCredentials) {
   await $fetch('/api/cms/auth/login', { method: 'POST', body: credentials })
   window.location.replace('/cms')
}

const loginError: FormSubmitErrorResolver = (error) => {
   const status = (error as { statusCode?: number }).statusCode
   return {
      message:
         status === 401
            ? 'Invalid email or password.'
            : errorMessage(error) ?? 'Login failed. Please try again.',
   }
}
</script>

<style src="../../assets/admin.css" />
