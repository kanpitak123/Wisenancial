<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useChatStore } from 'stores/ChatStore';

const $q = useQuasar();
const chatStore = useChatStore();
const textInput = ref('');
const chatScrollArea = ref<any>(null);

// 🟢 ตัวแปรจัดการหน้าจอมือถือ
const showSidebarMobile = ref(true);

// ดึงรายการ Asset จากหน้า Community มาทำเป็นห้องแชท
const chatRooms = [
  { name: 'General', label: 'Global Chat', icon: 'public', color: 'primary' },
  { name: 'BTC/USD', label: 'Bitcoin', icon: 'currency_bitcoin', color: 'orange' },
  { name: 'ETH/USD', label: 'Ethereum', icon: 'diamond', color: 'indigo' },
  { name: 'SOL/USD', label: 'Solana', icon: 'bolt', color: 'purple' },
  { name: 'XAU/USD', label: 'Gold (XAU)', icon: 'workspace_premium', color: 'amber' },
  { name: 'EUR/USD', label: 'Euro / Dollar', icon: 'euro', color: 'blue' },
  { name: 'GBP/USD', label: 'Pound / Dollar', icon: 'currency_pound', color: 'green' },
  { name: 'NAS100', label: 'Nasdaq 100', icon: 'show_chart', color: 'red' },
  { name: 'US30', label: 'Dow Jones', icon: 'trending_up', color: 'brown' },
];

const getMyUserId = () => {
  const token = localStorage.getItem('token') || localStorage.getItem('access_token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Number(payload.sub || payload.id);
  } catch {
    return null;
  }
};

const myUserId = getMyUserId();

onMounted(async () => {
  chatStore.connectSocket();
  await chatStore.fetchChatHistory(chatStore.currentRoom);
  scrollToBottom();
});

onUnmounted(() => {
  chatStore.disconnectSocket();
});

const scrollToBottom = () => {
  nextTick(() => {
    if (chatScrollArea.value) {
      chatScrollArea.value.setScrollPosition('vertical', 99999, 300);
    }
  });
};

watch(
  () => chatStore.messages.length,
  () => {
    scrollToBottom();
  },
);

const handleSendMessage = () => {
  if (!textInput.value.trim()) return;
  chatStore.sendMessage(textInput.value);
  textInput.value = '';
};

const selectRoom = async (roomName: string) => {
  if (chatStore.currentRoom !== roomName) {
    await chatStore.changeRoom(roomName);
  }
  // 🟢 หากเป็นมือถือ เมื่อเลือกห้องแล้วให้ซ่อนแถบข้าง และโชว์แชท
  if ($q.screen.lt.md) {
    showSidebarMobile.value = false;
    setTimeout(scrollToBottom, 300); // รอให้ UI โหลดแล้วเลื่อนลงล่าง
  }
};

const formatChatTime = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
</script>

<template>
  <q-page class="chat-community-page row no-wrap">
    <div
      class="rooms-sidebar col-auto column shadow-sm"
      v-show="$q.screen.gt.sm || showSidebarMobile"
    >
      <div class="q-pa-lg">
        <div class="text-h5 text-weight-bold" style="color: var(--text-main)">Chats</div>
        <div class="text-caption text-grey-6">Select asset room to discuss</div>
      </div>

      <q-scroll-area class="col q-px-sm">
        <q-list padding>
          <q-item
            v-for="room in chatRooms"
            :key="room.name"
            clickable
            v-ripple
            :active="chatStore.currentRoom === room.name && ($q.screen.gt.sm || !showSidebarMobile)"
            active-class="active-room"
            class="room-item q-mb-xs"
            @click="selectRoom(room.name)"
          >
            <q-item-section avatar>
              <q-avatar :color="room.color" text-color="white" size="40px">
                <q-icon :name="room.icon" size="20px" />
              </q-avatar>
            </q-item-section>

            <q-item-section>
              <q-item-label
                class="text-weight-bold"
                :class="
                  chatStore.currentRoom === room.name && ($q.screen.gt.sm || !showSidebarMobile)
                    ? 'text-primary'
                    : ''
                "
              >
                {{ room.name }}
              </q-item-label>
              <q-item-label caption lines="1">{{ room.label }}</q-item-label>
            </q-item-section>

            <q-item-section side v-if="$q.screen.lt.md">
              <q-icon name="chevron_right" color="grey-5" />
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </div>

    <div class="chat-window col column" v-show="$q.screen.gt.sm || !showSidebarMobile">
      <div class="chat-header row items-center q-px-md shadow-sm">
        <q-btn
          v-if="$q.screen.lt.md"
          flat
          round
          dense
          icon="arrow_back"
          color="grey-7"
          class="q-mr-sm"
          @click="showSidebarMobile = true"
        />

        <q-avatar size="40px" color="primary" text-color="white" class="q-mr-md">
          <q-icon name="forum" />
        </q-avatar>
        <div>
          <div class="text-weight-bold" style="font-size: 16px; color: var(--text-main)">
            {{ chatStore.currentRoom }} Community
          </div>
          <div class="text-caption text-positive row items-center">
            <div class="online-dot q-mr-xs"></div>
            Live Discussion
          </div>
        </div>
      </div>

      <div class="col relative-position chat-bg">
        <q-scroll-area ref="chatScrollArea" class="full-height q-pa-md q-pa-md-lg">
          <div v-if="chatStore.isLoading" class="flex flex-center q-pa-xl">
            <q-spinner-dots color="primary" size="40px" />
          </div>

          <div v-else class="q-gutter-y-md">
            <div
              v-for="msg in chatStore.messages"
              :key="msg.id"
              class="row"
              :class="msg.user_id === myUserId ? 'justify-end' : 'justify-start'"
            >
              <div v-if="msg.user_id !== myUserId" class="row no-wrap items-end max-msg-width">
                <q-avatar
                  size="32px"
                  class="bg-primary text-white text-weight-bold q-mr-sm q-mb-sm"
                >
                  {{ msg.users?.username?.charAt(0) || msg.users?.full_name?.charAt(0) || 'U' }}
                </q-avatar>
                <div>
                  <div
                    class="text-caption text-grey-6 q-ml-xs q-mb-xs"
                    style="font-size: 11px; font-weight: 600"
                  >
                    {{ msg.users?.username || msg.users?.full_name || 'Unknown User' }}
                  </div>
                  <div class="msg-bubble-received shadow-sm">
                    {{ msg.message }}
                  </div>
                  <div class="text-grey-5 q-mt-xs q-ml-xs" style="font-size: 10px">
                    {{ formatChatTime(msg.created_at) }}
                  </div>
                </div>
              </div>

              <div v-else class="max-msg-width column items-end">
                <div class="msg-bubble-sent shadow-sm">
                  {{ msg.message }}
                </div>
                <div class="text-grey-5 q-mt-xs q-mr-xs" style="font-size: 10px">
                  {{ formatChatTime(msg.created_at) }}
                </div>
              </div>
            </div>
          </div>
        </q-scroll-area>
      </div>

      <div class="chat-input-box q-pa-sm q-pa-md-md row items-center no-wrap">
        <q-input
          v-model="textInput"
          outlined
          dense
          placeholder="Aa"
          class="col rounded-input"
          bg-color="input-bg"
          @keyup.enter="handleSendMessage"
        >
          <template v-slot:append>
            <q-btn round dense flat icon="sentiment_satisfied_alt" color="grey-6" />
          </template>
        </q-input>
        <q-btn
          round
          unelevated
          icon="send"
          class="q-ml-sm"
          :class="textInput.trim() ? 'btn-primary-modern' : 'text-grey-4 bg-grey-2'"
          :disable="!textInput.trim()"
          @click="handleSendMessage"
        />
      </div>
    </div>
  </q-page>
</template>

<style scoped>
/* 🟢 ใช้ 100dvh แทน vh เพื่อแก้ปัญหามือถือที่มีแถบ URL บัง */
.chat-community-page {
  background: var(--bg-page);
  height: calc(100dvh - 52px); /* ลบความสูง header ออกตามที่คุณตั้งไว้ 52px */
  overflow: hidden;
}

.rooms-sidebar {
  width: 320px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
}

.chat-window {
  background: var(--bg-page);
}

.chat-header {
  height: 70px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  z-index: 10;
}

.chat-bg {
  background: var(--bg-page);
}

.chat-input-box {
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  min-height: 70px;
}

.room-item {
  border-radius: 12px;
  margin: 0 8px;
  color: var(--text-muted);
}

.active-room {
  background: rgba(59, 130, 246, 0.08) !important;
}

/* 🟢 ปรับขนาด Bubble แชทให้กว้างขึ้นเมื่ออยู่ในจอมือถือ */
.max-msg-width {
  max-width: 85%;
}

.msg-bubble-received {
  background: var(--bg-card-soft);
  color: var(--text-main);
  padding: 10px 16px;
  border-radius: 18px 18px 18px 4px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word; /* ป้องกันข้อความยาวจนล้นจอ */
}

.msg-bubble-sent {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: white;
  padding: 10px 16px;
  border-radius: 18px 18px 4px 18px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.online-dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
}

.rounded-input :deep(.q-field__control) {
  border-radius: 24px !important;
  background: var(--bg-card-soft);
}

.btn-primary-modern {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
  color: white !important;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
}

.body--dark .msg-bubble-received {
  background: #1e293b;
}
.body--dark .chat-input-box,
.body--dark .chat-header,
.body--dark .rooms-sidebar {
  background: #151e32;
}

/* =========================================
   📱 Mobile Responsive Breakpoints
========================================= */
@media (min-width: 1024px) {
  .max-msg-width {
    max-width: 70%;
  }
}

@media (max-width: 1023px) {
  .rooms-sidebar {
    width: 100% !important; /* ให้รายชื่อห้องเต็มจอไปเลย */
    border-right: none;
  }

  .chat-window {
    width: 100% !important; /* ให้หน้าแชทเต็มจอไปเลย */
  }
}
</style>
