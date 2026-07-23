import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Camera, Save, User, Mail, Phone, MapPin, Trash2, Upload, Key } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { UserAvatar } from '../../components/ui/UserAvatar';

export function ProfilePage() {
  const { user, token, updateProfile, deleteAvatar, changePassword } = useAuth();
  const fileInputRef = useRef(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState(null);

  async function handleAvatarPick(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    let uploadFile = file;
    if (file.type.startsWith('image/')) {
      try {
        uploadFile = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1024,
          useWebWorker: true
        });
      } catch {
        // Use the original file if compression fails.
      }
    }

    setAvatarFile(uploadFile);
    setAvatarPreview(URL.createObjectURL(uploadFile));
    event.target.value = '';
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload = {
        fullName: formData.get('fullName'),
        phone: formData.get('phone'),
        address: formData.get('address')
      };

      if (avatarFile) {
        const uploadData = new FormData();
        uploadData.append('file', avatarFile);
        uploadData.append('moduleName', 'users');
        uploadData.append('entityId', user.id);
        const response = await api.files.upload(token, uploadData);
        const uploaded = response.data?.[0];
        if (uploaded) {
          payload.avatarUrl = uploaded.viewUrl;
          payload.avatarFileId = uploaded.id;
        }
      }

      if (!avatarPreview && user.avatarUrl) {
        await deleteAvatar();
      }

      await updateProfile(payload);
      toast.success('Profile updated successfully');
      setAvatarFile(null);
    } catch (error) {
      toast.error(error.message || 'Unable to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setSavingPassword(true);
    try {
      const formData = new FormData(event.currentTarget);
      const currentPassword = formData.get('currentPassword');
      const newPassword = formData.get('newPassword');
      const confirmPassword = formData.get('confirmPassword');

      if (newPassword !== confirmPassword) {
        toast.error('New passwords do not match');
        return;
      }

      await changePassword({ currentPassword, newPassword, confirmPassword });
      toast.success('Password changed successfully');
      event.currentTarget.reset();
    } catch (error) {
      toast.error(error.message || 'Unable to change password');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account settings and preferences.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* Personal Information */}
        <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <User size={20} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Personal Information</h3>
              <p className="text-[13px] text-slate-500">Update your profile details.</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleProfileSubmit}>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-slate-700">Profile Image</label>
              <div className="flex items-center gap-4">
                <UserAvatar name={user?.fullName || 'User'} url={avatarPreview || user?.avatarUrl} gender={user?.gender} className="h-16 w-16 shadow-sm ring-1 ring-slate-100 shrink-0" fallbackSize={24} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1 py-1 shadow-sm">
                    <span className="text-[13px] text-slate-400 flex-1 truncate">Choose file...</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Camera size={14} />
                      Choose file
                    </button>
                    {(avatarPreview || user?.avatarUrl) ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setAvatarPreview('');
                          setAvatarFile(null);
                          await deleteAvatar();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-600 transition hover:bg-rose-100"
                        title="Remove avatar"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">Upload a profile picture. Recommended size: 250x250px</p>
                </div>
              </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Full Name</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="fullName" defaultValue={user?.fullName || ''} className="pl-9" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={user?.email || ''} disabled className="pl-9 bg-slate-50 text-slate-500" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Phone Number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="phone" defaultValue={user?.phone || ''} className="pl-9" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Address</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input name="address" defaultValue={user?.address || ''} className="pl-9" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingProfile} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-9 text-[13px] px-4 rounded-xl">
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Security */}
        <Card className="border border-slate-200 bg-white p-6 shadow-sm rounded-2xl">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500 shrink-0">
              <Key size={20} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Security</h3>
              <p className="text-[13px] text-slate-500">Update your password to keep your account secure.</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handlePasswordSubmit}>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Current Password</label>
              <Input name="currentPassword" type="password" required placeholder="••••••••" />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">New Password</label>
              <Input name="newPassword" type="password" required placeholder="••••••••" minLength={8} />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Confirm Password</label>
              <Input name="confirmPassword" type="password" required placeholder="••••••••" minLength={8} />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingPassword} variant="outline" className="gap-2 h-9 text-[13px] px-4 rounded-xl">
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
