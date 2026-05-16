'use client';

import { Suspense } from 'react';
import { AppointmentsView } from '../components/appointments/appointments-view';

export default function PosAppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsView />
    </Suspense>
  );
}
