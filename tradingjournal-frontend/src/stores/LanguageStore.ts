import { defineStore } from 'pinia';

export const useLanguageStore = defineStore('language', {
  state: (): { currentLanguage: 'th' | 'en' } => ({
    currentLanguage: 'th',
  }),

  getters: {
    isThai: (state) => state.currentLanguage === 'th',
    isEnglish: (state) => state.currentLanguage === 'en',
  },

  actions: {
    applyDocumentLanguage(language: 'th' | 'en') {
      if (typeof document === 'undefined') return;
      document.documentElement.lang = language;
      document.body.classList.remove('lang-th', 'lang-en');
      document.body.classList.add(language === 'th' ? 'lang-th' : 'lang-en');
    },

    setLanguage(language: 'th' | 'en') {
      this.currentLanguage = language;
      localStorage.setItem('language', language);
      this.applyDocumentLanguage(language);
    },

    toggleLanguage() {
      this.currentLanguage = this.currentLanguage === 'th' ? 'en' : 'th';
      localStorage.setItem('language', this.currentLanguage);
      this.applyDocumentLanguage(this.currentLanguage);
    },

    initializeLanguage() {
      const savedLanguage = localStorage.getItem('language');
      if (savedLanguage === 'th' || savedLanguage === 'en') {
        this.currentLanguage = savedLanguage;
        this.applyDocumentLanguage(savedLanguage);
        return;
      }

      this.currentLanguage = 'th';
      localStorage.setItem('language', 'th');
      this.applyDocumentLanguage('th');
    },
  },
});
