-- Migration: Create find_duplicate_customers() function
-- Detects likely duplicate customer records by phone, email, and name matching

CREATE OR REPLACE FUNCTION find_duplicate_customers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH
  -- Normalize phone: strip everything to last 10 digits for comparison
  normalized AS (
    SELECT
      id, first_name, last_name, phone, email,
      lifetime_spend, visit_count, created_at,
      -- Extract last 10 digits from phone (strips +1 prefix)
      CASE
        WHEN phone IS NOT NULL THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
        ELSE NULL
      END AS norm_phone,
      lower(trim(email)) AS norm_email,
      lower(trim(first_name)) AS norm_first,
      lower(trim(last_name)) AS norm_last
    FROM customers
  ),

  -- 1. Exact phone duplicates (high confidence)
  phone_dupes AS (
    SELECT
      'phone_' || norm_phone AS group_id,
      'high' AS confidence,
      'phone' AS match_reason,
      array_agg(id ORDER BY lifetime_spend DESC) AS customer_ids
    FROM normalized
    WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
    GROUP BY norm_phone
    HAVING count(*) > 1
  ),

  -- 2. Exact email duplicates (high confidence)
  email_dupes AS (
    SELECT
      'email_' || norm_email AS group_id,
      'high' AS confidence,
      'email' AS match_reason,
      array_agg(id ORDER BY lifetime_spend DESC) AS customer_ids
    FROM normalized
    WHERE norm_email IS NOT NULL AND norm_email != ''
    GROUP BY norm_email
    HAVING count(*) > 1
  ),

  -- 3. Same name + same phone (high confidence)
  name_phone_dupes AS (
    SELECT
      'name_phone_' || norm_first || '_' || norm_last || '_' || norm_phone AS group_id,
      'high' AS confidence,
      'name+phone' AS match_reason,
      array_agg(id ORDER BY lifetime_spend DESC) AS customer_ids
    FROM normalized
    WHERE norm_phone IS NOT NULL AND length(norm_phone) = 10
      AND norm_first IS NOT NULL AND norm_first != ''
      AND norm_last IS NOT NULL AND norm_last != ''
    GROUP BY norm_first, norm_last, norm_phone
    HAVING count(*) > 1
  ),

  -- 4. Same name + same email (medium confidence)
  name_email_dupes AS (
    SELECT
      'name_email_' || norm_first || '_' || norm_last || '_' || norm_email AS group_id,
      'medium' AS confidence,
      'name+email' AS match_reason,
      array_agg(id ORDER BY lifetime_spend DESC) AS customer_ids
    FROM normalized
    WHERE norm_email IS NOT NULL AND norm_email != ''
      AND norm_first IS NOT NULL AND norm_first != ''
      AND norm_last IS NOT NULL AND norm_last != ''
    GROUP BY norm_first, norm_last, norm_email
    HAVING count(*) > 1
  ),

  -- Combine all duplicate groups, dedup by picking the highest-confidence match per customer pair
  all_groups AS (
    SELECT * FROM phone_dupes
    UNION ALL
    SELECT * FROM email_dupes
    UNION ALL
    SELECT * FROM name_phone_dupes
    UNION ALL
    SELECT * FROM name_email_dupes
  ),

  -- Deduplicate: for each set of customer IDs (sorted), keep highest confidence group
  deduped AS (
    SELECT DISTINCT ON (sorted_ids)
      group_id,
      confidence,
      match_reason,
      customer_ids,
      -- Create a stable key from sorted IDs for dedup
      (SELECT array_agg(uid ORDER BY uid) FROM unnest(customer_ids) AS uid) AS sorted_ids
    FROM all_groups
    ORDER BY sorted_ids, confidence ASC -- 'high' < 'medium' alphabetically, so high wins
  ),

  -- Build final JSON with customer details
  final AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'group_id', d.group_id,
        'confidence', d.confidence,
        'match_reason', d.match_reason,
        'customers', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', n.id,
              'first_name', n.first_name,
              'last_name', n.last_name,
              'phone', n.phone,
              'email', n.email,
              'lifetime_spend', n.lifetime_spend,
              'visit_count', n.visit_count,
              'created_at', n.created_at
            )
            ORDER BY n.lifetime_spend DESC
          )
          FROM normalized n
          WHERE n.id = ANY(d.customer_ids)
        )
      )
      ORDER BY d.confidence, d.match_reason
    ) AS groups
    FROM deduped d
  )

  SELECT COALESCE(groups, '[]'::jsonb) INTO result FROM final;

  RETURN result;
END;
$$;
