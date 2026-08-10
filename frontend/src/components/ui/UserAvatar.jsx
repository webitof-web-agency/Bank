import React from 'react';
import { User } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getDefaultAvatarSrc } from '../../lib/avatar';
import { getImageUrl } from '../../api/api';

export function UserAvatar({ name, url, gender, className, size = 16, fallbackSize = 14 }) {
  const avatarSrc = getImageUrl(url) || getDefaultAvatarSrc(name, gender);

  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-full bg-slate-100 overflow-hidden', className)}>
      {avatarSrc ? (
        <img src={avatarSrc} alt={name || 'User'} className="h-full w-full object-cover" />
      ) : (
        <User size={fallbackSize} className="text-slate-500" />
      )}
    </div>
  );
}
