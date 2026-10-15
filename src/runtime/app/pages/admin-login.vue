<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <KAuthLayout
         title="Welcome back"
         description="Sign in to manage your content."
         footer="Powered by nuxt-cms"
      >
         <template #brand>
            <CmsBrandMark size="lg" hide-text class="cms-auth-brand" />
         </template>

         <KForm :form="form">
            <KFormField label="Email" name="email" required>
               <KInput
                  v-model="form.values.email"
                  type="email"
                  :icon="cmsIcon('envelope')"
                  autocomplete="username"
                  placeholder="you@example.com"
               />
            </KFormField>
            <KFormField label="Password" name="password" required>
               <KInput
                  v-model="form.values.password"
                  type="password"
                  icon="key"
                  autocomplete="current-password"
                  placeholder="••••••••"
               />
            </KFormField>
            <KButton type="submit" label="Sign in" trailing-icon="arrow-right" size="lg" block />
         </KForm>
      </KAuthLayout>
   </KRoot>
</template>

<script setup lang="ts">
import {
   AuthLayout as KAuthLayout,
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Input as KInput,
   Root as KRoot,
   provideTheme,
   useForm,
} from '@xleddyl/443-components-vue'
import { definePageMeta, navigateTo, useUserSession } from '#imports'
import { cmsIcon, errorMessage } from '../utils/ui'
import { useCmsTheme } from '../composables/cms-theme'

definePageMeta({ layout: false })

const theme = useCmsTheme()
provideTheme(theme)
const { loggedIn } = useUserSession()
if (loggedIn.value) {
   await navigateTo('/cms', { replace: true })
}

const form = useForm({
   schema: {
      email: { initial: (): string | number | null | undefined => '' },
      password: { initial: (): string | number | null | undefined => '' },
   },
   onSubmit: login,
})

async function login(values: {
   email: string | number | null | undefined
   password: string | number | null | undefined
}) {
   try {
      await $fetch('/api/cms/auth/login', { method: 'POST', body: values })
      window.location.replace('/cms')
   } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      form.setError(
         '',
         status === 401
            ? 'Invalid email or password.'
            : errorMessage(e) ?? 'Login failed. Please try again.'
      )
   }
}
</script>
