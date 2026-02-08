-- Replace client-side transaction stats aggregation with a Postgres function
-- to avoid PostgREST's default 1,000-row limit causing incorrect totals.

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
          ROUND(COUNT(*)::numeric / NULLIF(total_cnt, 0) * 100, 1) as percentage
        FROM transactions t2
        CROSS JOIN (
          SELECT COUNT(*) as total_cnt FROM transactions t3
          WHERE (p_status IS NULL OR t3.status = p_status::transaction_status)
            AND (p_from IS NULL OR t3.transaction_date >= p_from)
            AND (p_to IS NULL OR t3.transaction_date <= p_to)
        ) cnt
        WHERE (p_status IS NULL OR t2.status = p_status::transaction_status)
          AND (p_from IS NULL OR t2.transaction_date >= p_from)
          AND (p_to IS NULL OR t2.transaction_date <= p_to)
        GROUP BY payment_method, total_cnt
        ORDER BY SUM(total_amount) DESC
      ) pm
    ), '[]'::json)
  )
  FROM transactions
  WHERE (p_status IS NULL OR status = p_status::transaction_status)
    AND (p_from IS NULL OR transaction_date >= p_from)
    AND (p_to IS NULL OR transaction_date <= p_to);
$$ LANGUAGE sql STABLE;
