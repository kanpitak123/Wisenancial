import { config } from '@vue/test-utils';
import { Dialog, Loading, Notify, Quasar } from 'quasar';
import { beforeEach, vi } from 'vitest';

// component test ต้องมี Quasar plugin ไม่งั้น q-* component จะ resolve ไม่ได้
// และต้องลง Notify/Dialog ด้วย ไม่งั้น $q.notify() ในหน้าจะเป็น undefined
config.global.plugins = [[Quasar, { plugins: { Notify, Dialog, Loading } }]];

// router-link ใช้ในแถบโควต้า แต่เทสไม่ได้ติดตั้ง router จริง -> stub เป็น <a>
config.global.stubs = {
  'router-link': {
    props: ['to'],
    template: '<a :href="typeof to === \'string\' ? to : to?.path"><slot /></a>',
  },
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
