// Stub: updater functionality removed in Phase 1 trimming
import { TranslationFunc } from '@/hooks/useTranslation';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const checkForAppUpdates = async (
  _: TranslationFunc,
  _isAutoCheck = true,
): Promise<boolean> => {
  // Updater removed
  return false;
};

export const setLastShownReleaseNotesVersion = (_version: string) => {
  // No-op
};

export const getLastShownReleaseNotesVersion = () => {
  return '';
};

export const checkAppReleaseNotes = async (_isAutoCheck = true) => {
  // No-op
  return false;
};
