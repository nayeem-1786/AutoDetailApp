/**
 * Channel-label formatter for appointment row badges.
 *
 * Renders a short, customer- or admin-friendly label for the
 * `appointments.channel` enum value. Use this in lists, cards, and pills
 * where the goal is to communicate "how this appointment got into the
 * system" — booked online, called in by phone, or walked in.
 *
 * The richer descriptive labels in admin's appointment-detail-dialog
 * (`Client (Online Booking)` etc.) intentionally remain separate; that
 * dialog explains booking provenance, not pill-style channel discrimination.
 */

export type AppointmentChannel = 'online' | 'phone' | 'walk_in' | 'portal' | string;
export type ChannelSurface = 'customer' | 'admin';

export function formatChannelLabel(
  channel: AppointmentChannel | null | undefined,
  surface: ChannelSurface = 'admin'
): string {
  switch (channel) {
    case 'walk_in':
      return surface === 'customer' ? 'Walk-In Visit' : 'Walk-In';
    case 'phone':
      return 'Phone';
    case 'portal':
    case 'online':
      return 'Online';
    default:
      if (!channel) {
        // Booked appointment with unknown/unset channel — fall back to a
        // neutral "Appointment" label rather than rendering an empty pill.
        return 'Appointment';
      }
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}
