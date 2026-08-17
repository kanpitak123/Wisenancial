<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useSafeLoad } from 'src/composables/useSafeLoad';
import { API_BASE_URL } from 'src/constants/auth.constants';
import { useCommunityStore } from 'stores/CommunityStore';
import { usePortfolioStore } from 'stores/PortfolioStore';
import { useGlobalFilterStore } from 'stores/GlobalFilterStore'; // 👈 นำเข้า Date Filter Store

const $q = useQuasar();
const communityStore = useCommunityStore();
const portfolioStore = usePortfolioStore();
const filterStore = useGlobalFilterStore();

const assetName = ref<string | null>(null);
const content = ref('');
const imageFile = ref<File | null>(null);
const isSubmitting = ref(false);
const showCreatePost = ref(false);

// 🟢 ตัวแปรสำหรับระบบ Comment, Like และ Filter
const commentInputs = ref<Record<number, string>>({});
const showComments = ref<Record<number, boolean>>({});
const selectedAssetFilter = ref<string | null>(null); // 👈 เก็บค่า Asset ที่เลือกกรอง

const pairOptions = [
  { label: 'Crypto', disable: true },
  { label: 'BTC/USD', value: 'BTC/USD' },
  { label: 'ETH/USD', value: 'ETH/USD' },
  { label: 'BNB/USD', value: 'BNB/USD' },
  { label: 'SOL/USD', value: 'SOL/USD' },
  { label: 'XRP/USD', value: 'XRP/USD' },
  { label: 'DOGE/USD', value: 'DOGE/USD' },

  { label: 'Forex', disable: true },
  { label: 'XAU/USD (Gold)', value: 'XAU/USD' },
  { label: 'EUR/USD', value: 'EUR/USD' },
  { label: 'GBP/USD', value: 'GBP/USD' },
  { label: 'USD/JPY', value: 'USD/JPY' },
  { label: 'USD/CHF', value: 'USD/CHF' },

  { label: 'Indices', disable: true },
  { label: 'US30', value: 'US30' },
  { label: 'NAS100', value: 'NAS100' },
  { label: 'SPX500', value: 'SPX500' },
];

// สร้าง Options สำหรับ Dropdown Filter (มีตัวเลือก All Assets เพิ่มมา)
const filterOptions = [{ label: 'All Assets', value: null }, ...pairOptions];

const { safeLoad } = useSafeLoad();

const loadPosts = () =>
  safeLoad(() => communityStore.fetchPosts(), 'โหลดโพสต์ในคอมมูนิตี้ไม่สำเร็จ');

onMounted(loadPosts);

// feed ผูกกับโหมด (CommunityStore ส่ง portfolio_type ตาม activeType) -> สลับโหมดต้องโหลดใหม่
watch(() => portfolioStore.activeType, () => void loadPosts());

// 🟢 ฟังก์ชัน Computed สำหรับกรองโพสต์ที่แสดงผล
const filteredPosts = computed(() => {
  let posts = communityStore.posts;

  // 1. กรองตาม Asset ถ้ามีการเลือก
  if (selectedAssetFilter.value) {
    posts = posts.filter((p) => p.asset_symbol === selectedAssetFilter.value);
  }

  // 2. กรองตาม Date Filter (จาก GlobalFilterStore)
  if (filterStore.apiStartDate && filterStore.apiEndDate) {
    const start = new Date(filterStore.apiStartDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(filterStore.apiEndDate);
    end.setHours(23, 59, 59, 999);

    posts = posts.filter((p) => {
      const postDate = new Date(p.created_at);
      return postDate >= start && postDate <= end;
    });
  } else if (filterStore.apiStartDate) {
    // กรณีที่เลือกแค่วันเดียวในปฏิทิน (ไม่ได้ลากเป็นช่วง)
    const targetDate = new Date(filterStore.apiStartDate);
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterStore.apiStartDate);
    endOfDay.setHours(23, 59, 59, 999);

    posts = posts.filter((p) => {
      const postDate = new Date(p.created_at);
      return postDate >= targetDate && postDate <= endOfDay;
    });
  }

  return posts;
});

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const handleCreatePost = async () => {
  if (!assetName.value || !content.value.trim()) {
    $q.notify({
      type: 'warning',
      message: 'Please select an asset and write your thoughts.',
      position: 'top',
    });

    return;
  }

  const portfolioId = portfolioStore.activePortfolioId;
  if (portfolioId === null) {
    $q.notify({
      type: 'warning',
      message: 'Please select a portfolio first.',
      position: 'top',
    });

    return;
  }

  isSubmitting.value = true;

  try {
    await communityStore.createPost({
      portfolio_id: portfolioId,
      asset_symbol: assetName.value,
      content: content.value.trim(),
      imageFile: imageFile.value,
    });

    assetName.value = null;
    content.value = '';
    imageFile.value = null;
    showCreatePost.value = false;

    $q.notify({
      type: 'positive',
      message: 'Post created successfully!',
      position: 'top',
    });
  } catch {
    $q.notify({
      type: 'negative',
      message: 'Failed to create post. Please try again.',
      position: 'top',
    });
  } finally {
    isSubmitting.value = false;
  }
};

const toggleLike = async (postId: number) => {
  try {
    await communityStore.toggleLikePost(postId);
  } catch {
    $q.notify({ type: 'negative', message: 'Error updating like status.', position: 'top' });
  }
};

const toggleComments = (postId: number) => {
  showComments.value[postId] = !showComments.value[postId];
};

const submitComment = async (postId: number) => {
  const text = commentInputs.value[postId];
  if (!text || !text.trim()) return;

  try {
    await communityStore.addComment(postId, text);
    commentInputs.value[postId] = '';
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to post comment.', position: 'top' });
  }
};
</script>

<template>
  <q-page class="community-page q-pa-lg">
    <div>
      <div class="row items-center justify-between q-mb-lg">
        <div>
          <div class="text-h5 text-weight-bold">Community Board</div>
          <div class="text-caption text-grey-6">Share ideas and exchange trading perspectives</div>
        </div>

        <div class="row items-center q-gutter-sm">
          <q-select
            v-model="selectedAssetFilter"
            :options="filterOptions"
            emit-value
            map-options
            outlined
            dense
            options-dense
            label="Filter by Asset"
            class="rounded-input bg-card-auto"
            style="min-width: 180px"
          />

          <q-btn
            unelevated
            icon="add"
            label="Add Post"
            class="btn-primary-modern"
            @click="showCreatePost = true"
          />
        </div>
      </div>

      <div v-if="communityStore.isLoading" class="flex flex-center q-pa-xl">
        <q-spinner-dots color="primary" size="40px" />
      </div>

      <template v-else>
        <q-card v-for="post in filteredPosts" :key="post.id" class="post-card q-mb-md">
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-avatar size="42px" class="bg-primary text-white text-weight-bold">
                {{ post.users?.full_name?.charAt(0) || post.users?.username?.charAt(0) || 'U' }}
              </q-avatar>

              <div class="q-ml-md">
                <div class="text-weight-bold" style="color: var(--text-main)">
                  {{ post.users?.full_name || post.users?.username || 'Unknown User' }}
                </div>

                <div class="text-caption text-grey-6">
                  {{ formatTime(post.created_at) }}
                </div>
              </div>

              <q-space />

              <div class="asset-tag">
                {{ post.asset_symbol }}
              </div>
            </div>

            <div class="post-body-text q-mt-md">
              {{ post.content }}
            </div>

            <div v-if="post.post_images && post.post_images.length > 0" class="q-mt-md">
              <q-img
                :src="`${API_BASE_URL}${post.post_images[0]?.image_url}`"
                class="rounded-borders"
                style="
                  max-height: 400px;
                  object-fit: contain;
                  border: 1px solid var(--border-color);
                "
                spinner-color="primary"
              />
            </div>

            <div
              class="row items-center q-mt-md q-pt-sm"
              style="border-top: 1px solid var(--border-color)"
            >
              <q-btn
                flat
                round
                dense
                :icon="post.isLiked ? 'favorite' : 'favorite_border'"
                :color="post.isLiked ? 'red' : 'grey-5'"
                @click="toggleLike(post.id)"
              />
              <span
                class="text-weight-medium q-ml-xs q-mr-lg"
                :class="post.isLiked ? 'text-red' : 'text-grey-6'"
              >
                {{ post.likes_count || 0 }}
              </span>

              <q-btn
                flat
                round
                dense
                icon="chat_bubble_outline"
                color="grey-5"
                @click="toggleComments(post.id)"
              />
              <span class="text-weight-medium text-grey-6 q-ml-xs">
                {{ post.comments?.length || 0 }}
              </span>
            </div>

            <div
              v-if="showComments[post.id]"
              class="q-mt-sm q-pt-md"
              style="border-top: 1px dashed var(--border-color)"
            >
              <div v-for="comment in post.comments" :key="comment.id" class="q-mb-sm row no-wrap">
                <q-avatar size="32px" class="bg-grey-8 text-white text-weight-bold q-mr-sm">
                  {{
                    comment.users?.full_name?.charAt(0) || comment.users?.username?.charAt(0) || 'U'
                  }}
                </q-avatar>

                <div
                  class="q-pa-sm"
                  style="background: var(--bg-card-soft); border-radius: 12px; width: 100%"
                >
                  <div class="row justify-between items-center q-mb-xs">
                    <span class="text-weight-bold text-caption" style="color: var(--text-main)">
                      {{ comment.users?.full_name || comment.users?.username || 'Unknown User' }}
                    </span>
                    <span class="text-grey-6" style="font-size: 10px">
                      {{ formatTime(comment.created_at) }}
                    </span>
                  </div>
                  <div class="text-body2" style="color: var(--text-main); word-break: break-word">
                    {{ comment.content }}
                  </div>
                </div>
              </div>

              <div class="row items-center q-mt-md no-wrap">
                <q-input
                  v-model="commentInputs[post.id]"
                  outlined
                  dense
                  placeholder="Write a comment..."
                  class="rounded-input full-width"
                  @keyup.enter="submitComment(post.id)"
                >
                  <template v-slot:append>
                    <q-btn
                      round
                      dense
                      flat
                      icon="send"
                      color="primary"
                      @click="submitComment(post.id)"
                      :disable="!commentInputs[post.id]?.trim()"
                    />
                  </template>
                </q-input>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <div v-if="filteredPosts.length === 0" class="text-center q-pa-xl text-grey-6">
          <q-icon name="search_off" size="64px" />
          <div class="text-h6 q-mt-sm">No posts found</div>
          <div class="text-caption">Try adjusting your date or asset filter</div>
        </div>
      </template>
    </div>

    <q-dialog v-model="showCreatePost">
      <q-card class="post-dialog" style="width: 520px; max-width: 95vw">
        <q-card-section class="row items-center">
          <div class="dialog-icon-box">
            <q-icon name="edit_square" size="20px" />
          </div>

          <div class="q-ml-md">
            <div class="text-h6 text-weight-bold">Create New Post</div>

            <div class="text-caption text-grey-6">Share your trading idea</div>
          </div>
        </q-card-section>

        <q-card-section>
          <q-select
            v-model="assetName"
            :options="pairOptions"
            emit-value
            map-options
            outlined
            options-dense
            label="Select Asset"
            class="rounded-input q-mb-md"
          />

          <q-input
            v-model="content"
            outlined
            type="textarea"
            rows="5"
            placeholder="Share your thoughts..."
            class="rounded-input"
          />

          <q-file
            v-model="imageFile"
            outlined
            dense
            label="Upload Analysis Image (Optional)"
            accept=".jpg, .jpeg, .png"
            class="rounded-input q-mt-md"
          >
            <template v-slot:prepend>
              <q-icon name="image" />
            </template>
            <template v-slot:append v-if="imageFile">
              <q-icon name="close" @click.stop.prevent="imageFile = null" class="cursor-pointer" />
            </template>
          </q-file>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancel" class="btn-ghost-modern" v-close-popup />

          <q-btn
            unelevated
            icon="send"
            label="Post"
            class="btn-primary-modern"
            :loading="isSubmitting"
            @click="handleCreatePost"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style>
/* CSS ไม่มีการปรับแก้ใดๆ จากเดิมครับ */
:root {
  --bg-page: #f8fafc;
  --bg-card: #ffffff;
  --bg-card-soft: #f1f5f9;
  --bg-dialog: #ffffff;

  --text-main: #1e293b;
  --text-muted: #64748b;

  --border-color: #e2e8f0;
  --border-dialog: #e2e8f0;

  --shadow-card: 0 4px 15px -3px rgba(0, 0, 0, 0.03), 0 2px 6px -2px rgba(0, 0, 0, 0.02);

  --shadow-hover: 0 12px 28px -6px rgba(0, 0, 0, 0.08);
}

.body--dark {
  --bg-page: #0f172a;
  --bg-card: #151e32;
  --bg-card-soft: #1e293b;
  --bg-dialog: #1a2540;

  --text-main: #f8fafc;
  --text-muted: #94a3b8;

  --border-color: #23314b;
  --border-dialog: #2a3a58;
}

.community-page {
  background: var(--bg-page);
  min-height: 100vh;
}

.post-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: var(--shadow-card);

  transition: 0.25s ease;
}

.post-card:hover {
  transform: translateY(-2px);

  box-shadow: var(--shadow-hover);
}

.post-body-text {
  color: var(--text-main);
  line-height: 1.75;
  white-space: pre-wrap;
}

.asset-tag {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;

  border: 1px solid rgba(59, 130, 246, 0.2);

  padding: 4px 12px;

  border-radius: 999px;

  font-size: 11px;
  font-weight: 700;
}

.rounded-input .q-field__control {
  border-radius: 14px !important;
}

.bg-card-auto .q-field__control {
  background: var(--bg-card) !important;
}

.post-dialog {
  background: var(--bg-dialog) !important;

  border: 1px solid var(--border-dialog);

  border-radius: 22px;

  box-shadow: 0 24px 60px -10px rgba(0, 0, 0, 0.25);
}

.dialog-icon-box {
  width: 42px;
  height: 42px;

  border-radius: 14px;

  background: rgba(59, 130, 246, 0.12);

  color: #3b82f6;

  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary-modern {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;

  color: white !important;

  border-radius: 12px;

  height: 40px;

  padding: 0 18px;

  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
}

.btn-ghost-modern {
  border-radius: 12px;

  height: 40px;

  padding: 0 18px;
}
</style>
