-- Fix payment method percentage: use revenue-based % instead of transaction-count-based %
CREATE OR REPLACE FUNCTION get_transaction_stats(
  p_status text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS json AS $$
  SELECT json_build_object(
    'revenue', COALESCE(SUM(total_amount), 0),
    'transactionCount', COUNT(*)::int,
    'avgTicket', COALESCE(AVG(total_amount), 0),
    'tips', COALESCE(SUM(tip_amount), 0),
    'newCustomers', 0,
    'winBacks', 0,
    'paymentMethods', COALESCE((
      SELECT json_agg(row_to_json(pm))
      FROM (
        SELECT
          payment_method as method,
          SUM(total_amount) as total,
          COUNT(*)::int as count,
          ROUND(SUM(total_amount) / NULLIF(total_rev, 0) * 100, 1) as percentage
        FROM transactions t2
        CROSS JOIN (
          SELECT COALESCE(SUM(total_amount), 0) as total_rev FROM transactions t3
          WHERE (p_status IS NULL OR t3.status = p_status::transaction_status)
            AND (p_from IS NULL OR t3.transaction_date >= p_from)
            AND (p_to IS NULL OR t3.transaction_date <= p_to)
        ) rev
        WHERE (p_status IS NULL OR t2.status = p_status::transaction_status)
          AND (p_from IS NULL OR t2.transaction_date >= p_from)
          AND (p_to IS NULL OR t2.transaction_date <= p_to)
        GROUP BY payment_method, total_rev
        ORDER BY SUM(total_amount) DESC
      ) pm
    ), '[]'::json)
  )
  FROM transactions
  WHERE (p_status IS NULL OR status = p_status::transaction_status)
    AND (p_from IS NULL OR transaction_date >= p_from)
    AND (p_to IS NULL OR transaction_date <= p_to);
$$ LANGUAGE sql STABLE;
