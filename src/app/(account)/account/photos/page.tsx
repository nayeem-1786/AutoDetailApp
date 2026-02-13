'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PhotosRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/account/services');
  }, [router]);
  return null;
}
