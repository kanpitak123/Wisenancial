<template>
  <q-layout view="lHh Lpr lFf" class="bg-auth transition-theme">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
/* 🌟 Light Mode Background — rebrand 2026-08-17: pale sage-teal tint instead
   of the old pink/lavender, matching the accent-50 -> accent-100 scale */
.bg-auth {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--accent-50) 0%, var(--accent-100) 100%);
  transition: background 0.3s ease;
}

/* 🌙 Dark Mode Background — dark page bg into deep brand teal (accent-900),
   instead of navy-into-purple */
body.body--dark .bg-auth {
  background: linear-gradient(135deg, var(--bg-page) 0%, var(--accent-900) 100%);
}

.transition-theme {
  transition: background 0.3s ease-in-out;
}
</style>
