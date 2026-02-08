-- Fix merge_customers(): loyalty_ledger uses 'action' not 'entry_type',
-- and 'points_change' (already signed) not 'points'.

CREATE OR REPLACE FUNCTION merge_customers(keep_id UUID, merge_ids UUID[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  v_vehicles int := 0;
  v_appointments int := 0;
  v_transactions int := 0;
  v_coupons int := 0;
  v_loyalty_ledger int := 0;
  v_marketing_consent_log int := 0;
  v_sms_conversations int := 0;
  v_quotes int := 0;
  v_photos int := 0;
  v_waitlist_entries int := 0;
  v_campaign_recipients int := 0;
  v_customer_payment_methods int := 0;
  v_deleted int := 0;
  v_keep RECORD;
  v_merge RECORD;
  v_notes_append text := '';
  v_merge_name text;
BEGIN
  -- Validate keep_id exists
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = keep_id) THEN
    RAISE EXCEPTION 'keep_id % does not exist', keep_id;
  END IF;

  -- Validate merge_ids don't include keep_id
  IF keep_id = ANY(merge_ids) THEN
    RAISE EXCEPTION 'keep_id cannot be in merge_ids';
  END IF;

  -- Load the kept customer record
  SELECT * INTO v_keep FROM customers WHERE id = keep_id;

  -- Backfill data from each merged record
  FOR v_merge IN SELECT * FROM customers WHERE id = ANY(merge_ids) ORDER BY lifetime_spend DESC
  LOOP
    v_merge_name := COALESCE(v_merge.first_name, '') || ' ' || COALESCE(v_merge.last_name, '');

    -- Phone: preserve alternate numbers
    IF v_merge.phone IS NOT NULL AND v_merge.phone <> '' THEN
      IF v_keep.phone IS NULL OR v_keep.phone = '' THEN
        v_keep.phone := v_merge.phone;
      ELSIF v_merge.phone <> v_keep.phone THEN
        IF v_keep.mobile_2 IS NULL OR v_keep.mobile_2 = '' THEN
          v_keep.mobile_2 := v_merge.phone;
        ELSE
          v_notes_append := v_notes_append || E'\nAlt phone: ' || v_merge.phone || ' (from ' || TRIM(v_merge_name) || ')';
        END IF;
      END IF;
    END IF;

    -- Email: preserve alternate emails
    IF v_merge.email IS NOT NULL AND v_merge.email <> '' THEN
      IF v_keep.email IS NULL OR v_keep.email = '' THEN
        v_keep.email := v_merge.email;
      ELSIF LOWER(v_merge.email) <> LOWER(v_keep.email) THEN
        v_notes_append := v_notes_append || E'\nAlt email: ' || v_merge.email || ' (from ' || TRIM(v_merge_name) || ')';
      END IF;
    END IF;

    -- Names: only fill if kept record is missing
    IF (v_keep.first_name IS NULL OR v_keep.first_name = '') AND v_merge.first_name IS NOT NULL AND v_merge.first_name <> '' THEN
      v_keep.first_name := v_merge.first_name;
    END IF;
    IF (v_keep.last_name IS NULL OR v_keep.last_name = '') AND v_merge.last_name IS NOT NULL AND v_merge.last_name <> '' THEN
      v_keep.last_name := v_merge.last_name;
    END IF;

    -- Address fields: fill NULLs from merged
    IF v_keep.address_line_1 IS NULL AND v_merge.address_line_1 IS NOT NULL THEN
      v_keep.address_line_1 := v_merge.address_line_1;
      v_keep.address_line_2 := COALESCE(v_keep.address_line_2, v_merge.address_line_2);
      v_keep.city := COALESCE(v_keep.city, v_merge.city);
      v_keep.state := COALESCE(v_keep.state, v_merge.state);
      v_keep.zip := COALESCE(v_keep.zip, v_merge.zip);
    END IF;

    -- Birthday
    IF v_keep.birthday IS NULL AND v_merge.birthday IS NOT NULL THEN
      v_keep.birthday := v_merge.birthday;
    END IF;

    -- Customer type
    IF v_keep.customer_type IS NULL AND v_merge.customer_type IS NOT NULL THEN
      v_keep.customer_type := v_merge.customer_type;
    END IF;

    -- Consent flags: keep TRUE if either has it
    IF v_merge.sms_consent THEN v_keep.sms_consent := true; END IF;
    IF v_merge.email_consent THEN v_keep.email_consent := true; END IF;

    -- Tags: merge unique tags
    IF v_merge.tags IS NOT NULL AND jsonb_array_length(v_merge.tags) > 0 THEN
      SELECT COALESCE(jsonb_agg(DISTINCT val), '[]'::jsonb)
      INTO v_keep.tags
      FROM (
        SELECT val FROM jsonb_array_elements(v_keep.tags) AS val
        UNION
        SELECT val FROM jsonb_array_elements(v_merge.tags) AS val
      ) combined;
    END IF;

    -- Square IDs: fill if kept is NULL
    IF v_keep.square_customer_id IS NULL AND v_merge.square_customer_id IS NOT NULL THEN
      v_keep.square_customer_id := v_merge.square_customer_id;
    END IF;
    IF v_keep.square_reference_id IS NULL AND v_merge.square_reference_id IS NOT NULL THEN
      v_keep.square_reference_id := v_merge.square_reference_id;
    END IF;

    -- Auth user ID: fill if kept is NULL
    IF v_keep.auth_user_id IS NULL AND v_merge.auth_user_id IS NOT NULL THEN
      v_keep.auth_user_id := v_merge.auth_user_id;
    END IF;

    -- Notes from merged record
    IF v_merge.notes IS NOT NULL AND v_merge.notes <> '' THEN
      v_notes_append := v_notes_append || E'\n--- Notes from ' || TRIM(v_merge_name) || ' ---\n' || v_merge.notes;
    END IF;

    -- Merge log line
    v_notes_append := v_notes_append || E'\nMerged from customer ' || TRIM(v_merge_name) || ' (ID: ' || v_merge.id || ') on ' || to_char(now(), 'YYYY-MM-DD');
  END LOOP;

  -- Apply backfilled data to kept customer
  UPDATE customers SET
    phone = v_keep.phone,
    mobile_2 = v_keep.mobile_2,
    email = v_keep.email,
    first_name = v_keep.first_name,
    last_name = v_keep.last_name,
    address_line_1 = v_keep.address_line_1,
    address_line_2 = v_keep.address_line_2,
    city = v_keep.city,
    state = v_keep.state,
    zip = v_keep.zip,
    birthday = v_keep.birthday,
    customer_type = v_keep.customer_type,
    sms_consent = v_keep.sms_consent,
    email_consent = v_keep.email_consent,
    tags = v_keep.tags,
    square_customer_id = v_keep.square_customer_id,
    square_reference_id = v_keep.square_reference_id,
    auth_user_id = v_keep.auth_user_id,
    notes = CASE
      WHEN v_notes_append = '' THEN v_keep.notes
      WHEN v_keep.notes IS NULL OR v_keep.notes = '' THEN LTRIM(v_notes_append, E'\n')
      ELSE v_keep.notes || E'\n' || LTRIM(v_notes_append, E'\n')
    END,
    updated_at = now()
  WHERE id = keep_id;

  -- Reassign all related records
  UPDATE vehicles SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_vehicles = ROW_COUNT;

  UPDATE appointments SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_appointments = ROW_COUNT;

  UPDATE transactions SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  UPDATE coupons SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_coupons = ROW_COUNT;

  UPDATE loyalty_ledger SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_loyalty_ledger = ROW_COUNT;

  UPDATE marketing_consent_log SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_marketing_consent_log = ROW_COUNT;

  UPDATE sms_conversations SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_sms_conversations = ROW_COUNT;

  UPDATE quotes SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_quotes = ROW_COUNT;

  UPDATE photos SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_photos = ROW_COUNT;

  UPDATE waitlist_entries SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_waitlist_entries = ROW_COUNT;

  UPDATE campaign_recipients SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_campaign_recipients = ROW_COUNT;

  UPDATE customer_payment_methods SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_customer_payment_methods = ROW_COUNT;

  -- Recompute keep_id stats from transactions
  UPDATE customers SET
    lifetime_spend = (
      SELECT COALESCE(SUM(total_amount), 0)
      FROM transactions
      WHERE customer_id = keep_id AND status = 'completed'
    ),
    visit_count = (
      SELECT COUNT(*)
      FROM transactions
      WHERE customer_id = keep_id AND status = 'completed'
    ),
    first_visit_date = (
      SELECT MIN(transaction_date::date)
      FROM transactions
      WHERE customer_id = keep_id AND status = 'completed'
    ),
    last_visit_date = (
      SELECT MAX(transaction_date::date)
      FROM transactions
      WHERE customer_id = keep_id AND status = 'completed'
    ),
    loyalty_points_balance = (
      SELECT COALESCE(SUM(points_change), 0)
      FROM loyalty_ledger
      WHERE customer_id = keep_id
    ),
    updated_at = now()
  WHERE id = keep_id;

  -- Delete merged customers
  DELETE FROM customers WHERE id = ANY(merge_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Build result
  result := json_build_object(
    'keep_id', keep_id,
    'merged_count', v_deleted,
    'reassigned', json_build_object(
      'vehicles', v_vehicles,
      'appointments', v_appointments,
      'transactions', v_transactions,
      'coupons', v_coupons,
      'loyalty_ledger', v_loyalty_ledger,
      'marketing_consent_log', v_marketing_consent_log,
      'sms_conversations', v_sms_conversations,
      'quotes', v_quotes,
      'photos', v_photos,
      'waitlist_entries', v_waitlist_entries,
      'campaign_recipients', v_campaign_recipients,
      'customer_payment_methods', v_customer_payment_methods
    )
  );

  RETURN result;
END;
$$;
