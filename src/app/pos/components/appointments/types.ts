import type {
  Appointment,
  Customer,
  Vehicle,
  Employee,
} from '@/lib/supabase/types';

export interface PosAppointmentService {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
  service: {
    id: string;
    name: string;
  } | null;
}

export interface PosAppointment extends Appointment {
  customer: Pick<Customer, 'id' | 'first_name' | 'last_name' | 'phone' | 'email'>;
  vehicle: Pick<
    Vehicle,
    'id' | 'year' | 'make' | 'model' | 'color' | 'size_class'
  > | null;
  employee: Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role'> | null;
  appointment_services: PosAppointmentService[];
}

export interface PosStaff {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  job_count_today: number;
  is_busy: boolean;
}
