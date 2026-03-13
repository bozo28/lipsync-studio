import { AppError } from './errors';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64 (~7.5MB actual)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateApplyRequest(body: unknown): void {
  if (!body || typeof body !== 'object') {
    throw new AppError('Invalid request body', 400, 'INVALID_BODY');
  }

  const { image, lipColor, colorCode, category } = body as Record<string, unknown>;

  if (!image || typeof image !== 'string') {
    throw new AppError('Missing or invalid image', 400, 'INVALID_IMAGE');
  }

  // Validate data URL format
  const match = (image as string).match(/^data:(image\/(jpeg|png|webp));base64,/);
  if (!match) {
    throw new AppError(
      'Image must be a base64 data URL (jpeg, png, or webp)',
      400,
      'INVALID_IMAGE_FORMAT'
    );
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(match[1])) {
    throw new AppError('Unsupported image type', 400, 'UNSUPPORTED_IMAGE_TYPE');
  }

  // Check size (base64 string length)
  if ((image as string).length > MAX_IMAGE_SIZE) {
    throw new AppError('Image too large (max ~7.5MB)', 400, 'IMAGE_TOO_LARGE');
  }

  if (!lipColor || typeof lipColor !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(lipColor)) {
    throw new AppError('Invalid lip color (must be HEX like #C2185B)', 400, 'INVALID_LIP_COLOR');
  }

  if (!colorCode || typeof colorCode !== 'string') {
    throw new AppError('Missing color code', 400, 'INVALID_COLOR_CODE');
  }

  if (!category || typeof category !== 'string') {
    throw new AppError('Missing category', 400, 'INVALID_CATEGORY');
  }
}
