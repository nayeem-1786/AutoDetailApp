-- Fix: loyalty_ledger uses "action" not "entry_type", "points_change" not "points"
-- points_change is already signed (positive=earn, negative=redeem), so just SUM it

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
BEGIN
  -- Validate keep_id exists
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = keep_id) THEN
    RAISE EXCEPTION 'keep_id % does not exist', keep_id;
  END IF;

  -- Validate merge_ids don't include keep_id
  IF keep_id = ANY(merge_ids) THEN
    RAISE EXCEPTION 'keep_id cannot be in merge_ids';
  END IF;

  -- 1. Reassign vehicles
  UPDATE vehicles SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_vehicles = ROW_COUNT;

  -- 2. Reassign appointments
  UPDATE appointments SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_appointments = ROW_COUNT;

  -- 3. Reassign transactions
  UPDATE transactions SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  -- 4. Reassign coupons (customer-specific)
  UPDATE coupons SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_coupons = ROW_COUNT;

  -- 5. Reassign loyalty_ledger
  UPDATE loyalty_ledger SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_loyalty_ledger = ROW_COUNT;

  -- 6. Reassign marketing_consent_log
  UPDATE marketing_consent_log SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_marketing_consent_log = ROW_COUNT;

  -- 7. Reassign sms_conversations
  UPDATE sms_conversations SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_sms_conversations = ROW_COUNT;

  -- 8. Reassign quotes
  UPDATE quotes SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_quotes = ROW_COUNT;

  -- 9. Reassign photos
  UPDATE photos SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_photos = ROW_COUNT;

  -- 10. Reassign waitlist_entries
  UPDATE waitlist_entries SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_waitlist_entries = ROW_COUNT;

  -- 11. Reassign campaign_recipients
  UPDATE campaign_recipients SET customer_id = keep_id WHERE customer_id = ANY(merge_ids);
  GET DIAGNOSTICS v_campaign_recipients = ROW_COUNT;

  -- 12. Reassign customer_payment_methods
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
