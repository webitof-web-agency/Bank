import { useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import PhoneInput from 'react-phone-input-2';
import { Camera, Save, User, Mail, Phone, MapPin, Trash2, Upload, Key } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { stripPhoneDigits } from '../master/employees/employeeUtils';

function unwrapProfileResponse(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function ProfilePage() {
  const { user, token, updateProfile, deleteAvatar, changePassword } = useAuth();
  const fileInputRef = useRef(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    mobileNo: user?.mobileNo || '',
    gender: user?.gender || '',
    address: user?.address || ''
  });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await api.auth.me(token);
        const profile = unwrapProfileResponse(response);
        if (!active || !profile) return;
        setProfileForm({
          fullName: profile.fullName || '',
          mobileNo: profile.mobileNo || '',
          gender: profile.gender || '',
          address: profile.address || ''
        });
        setAvatarPreview(profile.avatarUrl || '');
      } catch {
        if (active) {
          setProfileForm({
            fullName: user?.fullName || '',
            mobileNo: user?.mobileNo || '',
            gender: user?.gender || '',
            address: user?.address || ''
          });
          setAvatarPreview(user?.avatarUrl || '');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token, user?.fullName, user?.mobileNo, user?.gender, user?.address, user?.avatarUrl]);

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
      const mobileDigits = stripPhoneDigits(profileForm.mobileNo || '');
      const payload = {
        fullName: String(profileForm.fullName || '').trim(),
        mobileNo: mobileDigits ? `+${mobileDigits}` : '',
        gender: String(profileForm.gender || '').trim(),
        address: String(profileForm.address || '').trim()
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
      const refreshedResponse = await api.auth.me(token);
      const savedProfile = unwrapProfileResponse(refreshedResponse);
      setProfileForm({
        fullName: savedProfile?.fullName || payload.fullName || '',
        mobileNo: savedProfile?.mobileNo || payload.mobileNo || '',
        gender: savedProfile?.gender || payload.gender || '',
        address: savedProfile?.address || payload.address || ''
      });
      if (savedProfile?.avatarUrl) {
        setAvatarPreview(savedProfile.avatarUrl);
      }
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
      </div>

      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* Personal Information */}
        <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button,14px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <User size={20} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Personal Information</h3>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleProfileSubmit}>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-slate-700">Profile Image</label>
              <div className="flex items-center gap-4">
                <UserAvatar name={user?.fullName || 'User'} url={avatarPreview || user?.avatarUrl} gender={user?.gender} className="h-16 w-16 shadow-sm ring-1 ring-slate-100 shrink-0" fallbackSize={24} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 rounded-[var(--radius-input,1rem)] border border-slate-200 bg-white pl-3 pr-1 py-1 shadow-sm">
                    <span className="text-[13px] text-slate-400 flex-1 truncate">Choose file...</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-[calc(var(--radius-input,1rem)-4px)] border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
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
                        className="inline-flex items-center gap-2 rounded-[calc(var(--radius-input,1rem)-4px)] border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-600 transition hover:bg-rose-100"
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
                <Input
                  name="fullName"
                  autoComplete="name"
                  value={profileForm.fullName}
                  onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                  className="pl-9"
                />
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
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Gender</label>
              <Select
                value={profileForm.gender}
                onChange={(value) => setProfileForm((current) => ({ ...current, gender: value }))}
                options={[
                  { label: 'Male', value: 'Male' },
                  { label: 'Female', value: 'Female' },
                  { label: 'Other', value: 'Other' }
                ]}
                placeholder="Select gender"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Mobile Number</label>
              <PhoneInput
                country="in"
                preferredCountries={['in']}
                enableSearch
                countryCodeEditable={false}
                placeholder="9876543210"
                value={stripPhoneDigits(profileForm.mobileNo || '')}
                onChange={(nextValue) => setProfileForm((current) => ({ ...current, mobileNo: nextValue ? `+${nextValue}` : '' }))}
                containerClass="employee-phone-input"
                inputClass="!h-[42px] !w-full !rounded-[var(--radius-input,0.75rem)] !border-slate-200 focus:!border-[var(--primary)] focus:!ring-1 focus:!ring-[var(--primary)]"
                buttonClass="!border-r !border-slate-200 !rounded-l-[var(--radius-input,0.75rem)] !bg-slate-50"
                dropdownClass="!z-50"
                inputProps={{ name: 'mobileNo' }}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Address</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  name="address"
                  autoComplete="street-address"
                  value={profileForm.address}
                  onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingProfile} className="gap-2 h-9 rounded-[var(--radius-button,1rem)] px-4 text-[13px] bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 shadow-sm border-0">
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Security */}
        <Card className="rounded-[var(--radius-card,1.75rem)] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-button,14px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <Key size={20} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Security</h3>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handlePasswordSubmit}>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Current Password</label>
              <Input name="currentPassword" type="password" required placeholder="********" />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">New Password</label>
              <Input name="newPassword" type="password" required placeholder="********" minLength={8} />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Confirm Password</label>
              <Input name="confirmPassword" type="password" required placeholder="********" minLength={8} />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={savingPassword} variant="outline" className="gap-2 h-9 rounded-[var(--radius-button,1rem)] border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 shadow-sm hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-slate-50 transition-colors">
                {savingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export { ProfilePage };
export default ProfilePage;
