/**
 * اعتبارسنجی مسیر داخلی امن برای جلوگیری از آسیب‌پذیری هدایت باز (Open Redirect)
 * فقط مسیرهای نسبی شروع‌شده با یک اسلش (بدون اسلش دوتایی //، بدون پروتکل :// و بدون بک‌اسلش /\\) مجاز هستند.
 */
export const isSafeInternalPath = (path) => {
  if (!path || typeof path !== 'string') return false;
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return false;
  }
  if (trimmed.includes('://') || trimmed.toLowerCase().startsWith('javascript:')) {
    return false;
  }
  return true;
};
