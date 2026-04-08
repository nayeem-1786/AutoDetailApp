import { redirect } from 'next/navigation';

interface SignupRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignupRedirect({ searchParams }: SignupRedirectProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
  }
  const queryString = qs.toString();
  redirect(`/signin${queryString ? `?${queryString}` : ''}`);
}
