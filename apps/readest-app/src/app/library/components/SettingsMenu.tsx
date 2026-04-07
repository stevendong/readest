import clsx from 'clsx';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PiUserCircle, PiUserCircleCheck, PiGear } from 'react-icons/pi';
import { PiSun, PiMoon } from 'react-icons/pi';
import { TbSunMoon } from 'react-icons/tb';

import { isWebAppPlatform } from '@/services/environment';
import { DOWNLOAD_READEST_URL } from '@/services/constants';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { navigateToProfile } from '@/utils/nav';
import { setAboutDialogVisible } from '@/components/AboutWindow';
import { saveSysSettings } from '@/helpers/settings';
import UserAvatar from '@/components/UserAvatar';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface SettingsMenuProps {
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ setIsDropdownOpen }) => {
  const _ = useTranslation();
  const router = useRouter();
  const { envConfig, appService } = useEnv();
  const { user } = useAuth();
  const { themeMode, setThemeMode } = useThemeStore();
  const { settings, setSettingsDialogOpen } = useSettingsStore();
  const [isScreenWakeLock, setIsScreenWakeLock] = useState(settings.screenWakeLock);
  const [isOpenLastBooks, setIsOpenLastBooks] = useState(settings.openLastBooks);
  const iconSize = useResponsiveSize(16);

  const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
  const [refreshMetadataProgress, setRefreshMetadataProgress] = useState('');
  const { setLibrary } = useLibraryStore();

  const showAboutReadest = () => {
    setAboutDialogVisible(true);
    setIsDropdownOpen?.(false);
  };

  const downloadReadest = () => {
    window.open(DOWNLOAD_READEST_URL, '_blank');
    setIsDropdownOpen?.(false);
  };

  const handleUserProfile = () => {
    navigateToProfile(router);
    setIsDropdownOpen?.(false);
  };

  const cycleThemeMode = () => {
    const nextMode = themeMode === 'auto' ? 'light' : themeMode === 'light' ? 'dark' : 'auto';
    setThemeMode(nextMode);
  };

  const handleReloadPage = () => {
    window.location.reload();
    setIsDropdownOpen?.(false);
  };

  const toggleScreenWakeLock = () => {
    const newValue = !settings.screenWakeLock;
    saveSysSettings(envConfig, 'screenWakeLock', newValue);
    setIsScreenWakeLock(newValue);
  };

  const toggleOpenLastBooks = () => {
    const newValue = !settings.openLastBooks;
    saveSysSettings(envConfig, 'openLastBooks', newValue);
    setIsOpenLastBooks(newValue);
  };

  const handleRefreshMetadata = async () => {
    if (!appService || isRefreshingMetadata) return;
    setIsRefreshingMetadata(true);
    setRefreshMetadataProgress(_('Loading library...'));
    try {
      const books = await appService.loadLibraryBooks();
      const activeBooks = books.filter((b) => !b.deletedAt);
      let refreshed = 0;
      for (let i = 0; i < activeBooks.length; i++) {
        setRefreshMetadataProgress(`${i + 1} / ${activeBooks.length}`);
        try {
          if (await appService.refreshBookMetadata(activeBooks[i]!)) {
            refreshed++;
          }
        } catch {
          // Skip books whose files can't be opened
        }
      }
      setLibrary(books);
      await appService.saveLibraryBooks(books);
      setRefreshMetadataProgress(_('{{count}} books refreshed', { count: refreshed }));
      setTimeout(() => {
        setIsRefreshingMetadata(false);
        setRefreshMetadataProgress('');
      }, 2000);
    } catch (error) {
      console.error('Failed to refresh metadata:', error);
      setRefreshMetadataProgress(_('Failed to refresh metadata'));
      setTimeout(() => {
        setIsRefreshingMetadata(false);
        setRefreshMetadataProgress('');
      }, 2000);
    }
  };

  const openSettingsDialog = () => {
    setIsDropdownOpen?.(false);
    setSettingsDialogOpen(true);
  };

  const avatarUrl = user?.user_metadata?.['picture'] || user?.user_metadata?.['avatar_url'];
  const userFullName = user?.user_metadata?.['full_name'];
  const userDisplayName = userFullName ? userFullName.split(' ')[0] : null;
  const themeModeLabel =
    themeMode === 'dark'
      ? _('Dark Mode')
      : themeMode === 'light'
        ? _('Light Mode')
        : _('Auto Mode');

  return (
    <Menu
      className={clsx(
        'settings-menu dropdown-content no-triangle',
        'z-20 mt-2 max-w-[90vw] shadow-2xl',
      )}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      {user ? (
        <MenuItem
          label={
            userDisplayName
              ? _('Logged in as {{userDisplayName}}', { userDisplayName })
              : _('Logged in')
          }
          labelClass='!max-w-40'
          aria-label={_('View account details and quota')}
          Icon={
            avatarUrl ? (
              <UserAvatar url={avatarUrl} size={iconSize} DefaultIcon={PiUserCircleCheck} />
            ) : (
              PiUserCircleCheck
            )
          }
        >
          <ul className='ms-0 flex flex-col ps-0 before:hidden'>
            <MenuItem label={_('Account')} onClick={handleUserProfile} />
          </ul>
        </MenuItem>
      ) : (
        <MenuItem
          label={_('Sign in at pdf2epub.com')}
          Icon={PiUserCircle}
          onClick={() => window.open('https://pdf2epub.com', '_blank')}
        ></MenuItem>
      )}

      <MenuItem
        label={_('Open Last Book on Start')}
        toggled={isOpenLastBooks}
        onClick={toggleOpenLastBooks}
      />
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem
        label={_('Keep Screen Awake')}
        toggled={isScreenWakeLock}
        onClick={toggleScreenWakeLock}
      />
      <MenuItem label={_('Reload Page')} onClick={handleReloadPage} />
      <MenuItem
        label={themeModeLabel}
        Icon={themeMode === 'dark' ? PiMoon : themeMode === 'light' ? PiSun : TbSunMoon}
        onClick={cycleThemeMode}
      />
      <MenuItem label={_('Settings')} Icon={PiGear} onClick={openSettingsDialog} />
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Advanced Settings')}>
        <ul className='ms-0 flex flex-col ps-0 before:hidden'>
          <MenuItem
            label={_('Refresh Metadata')}
            description={refreshMetadataProgress}
            onClick={handleRefreshMetadata}
            disabled={isRefreshingMetadata}
          />
        </ul>
      </MenuItem>
      <hr aria-hidden='true' className='border-base-200 my-1' />
      {isWebAppPlatform() && <MenuItem label={_('Download Readest')} onClick={downloadReadest} />}
      <MenuItem label={_('About Readest')} onClick={showAboutReadest} />
    </Menu>
  );
};

export default SettingsMenu;
