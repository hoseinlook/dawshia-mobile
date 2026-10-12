import type { AlertButton } from 'react-native';

/**
 * Web build of alert.ts. React Native Web's Alert does nothing, so this maps alerts onto
 * window.alert / window.confirm: one action is a yes/no question, several are asked in turn.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(text)) actions[0].onPress?.();
    return;
  }
  for (const b of actions) {
    if (window.confirm(`${text}\n\n${b.text}?`)) {
      b.onPress?.();
      return;
    }
  }
}
