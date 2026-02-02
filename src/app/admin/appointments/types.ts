import type { Appointment, AppointmentStatus, Customer, Vehicle, Employee } from '@/lib/supabase/types';

export interface AppointmentService {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
  service: {
    id: string;
    name: string;
  };
}

export interface AppointmentWithRelations extends Appointment {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'>;
  vehicle: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'color'> | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name'> | null;
  appointment_services: AppointmentService[];
}

// Valid next-states for each appointment status
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

// Colors for calendar dots
export const STATUS_DOT_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-400',
  confirmed: 'bg-blue-400',
  in_progress: 'bg-blue-600',
  completed: 'bg-green-400',
  cancelled: 'bg-red-400',
  no_show: 'bg-gray-400',
};
