<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useLanguageStore } from 'stores/LanguageStore';

const languageStore = useLanguageStore();

onMounted(() => {
  languageStore.initializeLanguage();
});
</script>
