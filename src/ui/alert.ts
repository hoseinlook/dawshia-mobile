import { Alert, type AlertButton } from 'react-native';

/** A system alert; the web build uses the browser's confirm/alert dialogs (alert.web.ts). */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons);
}
