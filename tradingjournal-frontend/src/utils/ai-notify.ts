import { Notify } from 'quasar';

/**
 * Toast for a failed AI call, showing the server's own message.
 *
 * A failed AI request used to leave no trace in the UI (the rejection was never caught by the
 * button that started it), so the user saw nothing happen. Never throws: a notification problem
 * must not turn into a second error.
 */
export function notifyAiError(message: string | null | undefined): void {
  try {
    Notify.create({
      type: 'negative',
      message: message || 'AI request failed',
      position: 'top',
      timeout: 6000,
    });
  } catch {
    // Notify not installed (tests, SSR): the message is still in AiStore.error
  }
}
