<template>
  <div class="workspace-switcher row items-center no-wrap" :class="{ 'is-busy': switching }">
    <q-btn
      v-for="option in options"
      :key="option.type"
      flat
      dense
      no-caps
      class="workspace-option"
      :class="{ 'workspace-option--active': option.active }"
      :disable="switching"
      @click="handleSwitch(option.type)"
    >
      <q-icon :name="option.icon" size="16px" class="q-mr-xs" />
      <span class="workspace-option__label">{{ option.label }}</span>

      <q-tooltip class="bg-grey-9 text-white shadow-4">
        {{ option.active ? `อยู่ในโหมด ${option.label}` : `สลับไปโหมด ${option.label}` }}
      </q-tooltip>
    </q-btn>

    <q-inner-loading :showing="switching" size="18px" />
  </div>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';
import { useWorkspace } from 'src/composables/useWorkspace';
import type { WorkspaceType } from 'src/types/workspace.types';

const $q = useQuasar();
const { options, switching, switchTo, meta } = useWorkspace();

async function handleSwitch(type: WorkspaceType) {
  try {
    const changed = await switchTo(type);

    if (changed) {
      $q.notify({
        type: 'positive',
        message: `เปลี่ยนเป็นโหมด ${meta.value.label} แล้ว`,
        position: 'top',
        timeout: 1500,
      });
    }
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: error instanceof Error ? error.message : 'สลับโหมดไม่สำเร็จ',
      position: 'top',
    });
  }
}
</script>

<style scoped>
.workspace-switcher {
  position: relative;
  border-radius: 999px;
  padding: 3px;
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.workspace-switcher.is-busy {
  pointer-events: none;
}

.workspace-option {
  border-radius: 999px;
  padding: 2px 12px;
  min-height: 26px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2px;
  opacity: 0.65;
  transition:
    background 0.25s ease,
    color 0.25s ease,
    opacity 0.25s ease,
    box-shadow 0.25s ease;
}

.workspace-option:hover {
  opacity: 0.9;
}

.workspace-option--active {
  opacity: 1;
  /* rebrand 2026-08-17: accent-500 -> accent-900, mirrors the logo mark's own light-to-dark sweep */
  background: linear-gradient(135deg, var(--accent-500) 0%, var(--accent-900) 100%);
  color: #fff;
  box-shadow: 0 2px 10px rgba(51, 97, 96, 0.35);
}

@media (max-width: 599px) {
  .workspace-option__label {
    display: none;
  }

  .workspace-option {
    padding: 2px 8px;
  }

  .workspace-option .q-icon {
    margin-right: 0 !important;
  }
}
</style>
