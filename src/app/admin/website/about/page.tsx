'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { adminFetch } from '@/lib/utils/admin-fetch';
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photo_url: string | null;
}

interface Credential {
  title: string;
  description: string;
  image_url: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AboutTeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [aboutText, setAboutText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/cms/about');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTeamMembers(data.team_members ?? []);
      setCredentials(data.credentials ?? []);
      setAboutText(data.about_text ?? '');
    } catch {
      toast.error('Failed to load about content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/cms/about', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_members: teamMembers,
          credentials,
          about_text: aboutText,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('About content saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Team member helpers
  const addMember = () => {
    setTeamMembers((prev) => [...prev, { name: '', role: '', bio: '', photo_url: null }]);
  };

  const updateMember = (index: number, field: keyof TeamMember, value: string) => {
    setTeamMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value || (field === 'photo_url' ? null : '') } : m))
    );
  };

  const removeMember = (index: number) => {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const moveMember = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= teamMembers.length) return;
    setTeamMembers((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  // Credential helpers
  const addCredential = () => {
    setCredentials((prev) => [...prev, { title: '', description: '', image_url: null }]);
  };

  const updateCredential = (index: number, field: keyof Credential, value: string) => {
    setCredentials((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value || (field === 'image_url' ? null : '') } : c))
    );
  };

  const removeCredential = (index: number) => {
    setCredentials((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="About & Team"
        description="Manage team members, credentials, and about content for the public website"
        action={
          <Button onClick={save} disabled={saving}>
            {saving ? <><Spinner size="sm" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
          </Button>
        }
      />

      {/* About Text */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">About the Business</h3>
        <textarea
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Tell customers about your business..."
        />
        <p className="text-xs text-gray-500">
          This text appears in the About section on the homepage.
        </p>
      </div>

      {/* Team Members */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Team Members ({teamMembers.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addMember}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Member
          </Button>
        </div>

        {teamMembers.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <Users className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">No team members yet</p>
            <Button variant="outline" size="sm" onClick={addMember} className="mt-3">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add First Member
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-600 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Member {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveMember(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMember(index, 1)}
                      disabled={index === teamMembers.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMember(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Name</label>
                    <Input
                      value={member.name}
                      onChange={(e) => updateMember(index, 'name', e.target.value)}
                      className="mt-1"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Role</label>
                    <Input
                      value={member.role}
                      onChange={(e) => updateMember(index, 'role', e.target.value)}
                      className="mt-1"
                      placeholder="Lead Detailer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Bio</label>
                  <textarea
                    value={member.bio}
                    onChange={(e) => updateMember(index, 'bio', e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Short bio..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Photo URL (optional)
                  </label>
                  <Input
                    value={member.photo_url ?? ''}
                    onChange={(e) => updateMember(index, 'photo_url', e.target.value)}
                    className="mt-1"
                    placeholder="https://..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credentials */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Credentials & Awards ({credentials.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addCredential}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Credential
          </Button>
        </div>

        {credentials.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No credentials or awards added yet.
          </p>
        ) : (
          <div className="space-y-3">
            {credentials.map((cred, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-600 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Credential {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCredential(index)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Title</label>
                    <Input
                      value={cred.title}
                      onChange={(e) => updateCredential(index, 'title', e.target.value)}
                      className="mt-1"
                      placeholder="Lomita Chamber of Commerce"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Image URL (optional)
                    </label>
                    <Input
                      value={cred.image_url ?? ''}
                      onChange={(e) => updateCredential(index, 'image_url', e.target.value)}
                      className="mt-1"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Description</label>
                  <Input
                    value={cred.description}
                    onChange={(e) => updateCredential(index, 'description', e.target.value)}
                    className="mt-1"
                    placeholder="Brief description..."
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
