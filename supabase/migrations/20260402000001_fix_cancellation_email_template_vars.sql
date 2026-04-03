-- Fix cancellation email template variable names.
-- The template may have been edited in admin UI with incorrect variable names
-- (e.g. {servicename} instead of {service_name}). Fix by running text-level
-- replacements on the serialized JSONB body_blocks.

UPDATE email_templates
SET body_blocks = (
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  body_blocks::text,
                  '{servicename}', '{service_name}'
                ),
                '{appointmentdate}', '{appointment_date}'
              ),
              '{appointmenttime}', '{appointment_time}'
            ),
            '{firstname}', '{first_name}'
          ),
          '{businessname}', '{business_name}'
        ),
        '{businessphone}', '{business_phone}'
      ),
      '{bookingurl}', '{booking_url}'
    ),
    '{cancellationreason}', '{cancellation_reason}'
  )
)::jsonb,
updated_at = now()
WHERE template_key = 'booking_cancellation';

-- Also fix any literal hardcoded "9:00 AM" in the template body
-- (replace with the {appointment_time} variable)
UPDATE email_templates
SET body_blocks = (
  replace(body_blocks::text, '9:00 AM', '{appointment_time}')
)::jsonb,
updated_at = now()
WHERE template_key = 'booking_cancellation'
  AND body_blocks::text LIKE '%9:00 AM%';
