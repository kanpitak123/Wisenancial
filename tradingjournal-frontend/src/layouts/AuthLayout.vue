<template>
  <q-layout view="lHh Lpr lFf" class="bg-auth transition-theme">
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<style scoped>
/* 🌟 Light Mode Background */
.bg-auth {
  min-height: 100vh;
  /* ไล่สีพื้นหลังสำหรับโหมดสว่าง */
  background: linear-gradient(135deg, #fdf4ff 0%, #fce7f3 100%);
  transition: background 0.3s ease;
}

/* 🌙 Dark Mode Background */
body.body--dark .bg-auth {
  /* ไล่สีพื้นหลังสำหรับโหมดมืด (สีกรมท่าเข้ม ไปหา ม่วงเข้มจัดๆ ให้เข้ากับ Theme) */
  background: linear-gradient(135deg, #0f172a 0%, #17102b 100%);
}

.transition-theme {
  transition: background 0.3s ease-in-out;
}
</style>
