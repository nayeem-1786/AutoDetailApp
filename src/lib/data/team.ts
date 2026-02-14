import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  photoUrl: string | null;
}

export interface Credential {
  title: string;
  description: string;
  imageUrl: string | null;
}

async function fetchTeamData(): Promise<{
  members: TeamMember[];
  credentials: Credential[];
  aboutText: string;
}> {
  let supabase;
  try {
    supabase = await createServerClient();
  } catch {
    supabase = createAnonClient();
  }

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['team_members', 'credentials', 'about_text']);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  let members: TeamMember[] = [];
  const rawMembers = settings.team_members;
  if (Array.isArray(rawMembers)) {
    members = rawMembers as TeamMember[];
  } else if (typeof rawMembers === 'string') {
    try { members = JSON.parse(rawMembers); } catch {}
  }

  let credentials: Credential[] = [];
  const rawCreds = settings.credentials;
  if (Array.isArray(rawCreds)) {
    credentials = rawCreds as Credential[];
  } else if (typeof rawCreds === 'string') {
    try { credentials = JSON.parse(rawCreds); } catch {}
  }

  const aboutText = (settings.about_text as string) || '';

  return { members, credentials, aboutText };
}

export const getTeamData = cache(fetchTeamData);
