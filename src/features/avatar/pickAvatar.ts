import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** The server accepts up to 64 KB; stay well below it. */
const MAX_BYTES = 48 * 1024;
const ATTEMPTS = [
  { size: 256, compress: 0.75 },
  { size: 192, compress: 0.6 },
  { size: 128, compress: 0.5 },
];

/**
 * Lets the user pick a photo from the gallery, cropped square, and returns a
 * small JPEG as base64 — or null if they cancelled.
 */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const uri = result.assets[0].uri;

  for (const { size, compress } of ATTEMPTS) {
    const image = await ImageManipulator.manipulate(uri).resize({ width: size, height: size }).renderAsync();
    const saved = await image.saveAsync({ base64: true, compress, format: SaveFormat.JPEG });
    if (saved.base64 && (saved.base64.length * 3) / 4 <= MAX_BYTES) return saved.base64;
  }
  throw new Error('photoTooLarge');
}
