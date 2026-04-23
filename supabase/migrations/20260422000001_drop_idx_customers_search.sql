-- Session 42H-rewrite-1: drop unused full-text search index on customers.
--
-- idx_customers_search was created in migration 20260201000036 as a GIN
-- to_tsvector index covering first_name, last_name, phone, email. It has
-- never been consulted by any query — every customer search in the app
-- uses per-column ILIKE or (post-42H-rewrite-1) the shared searchCustomers
-- utility at src/lib/search/customer-search.ts, neither of which can use
-- a tsvector index.
--
-- Re-add with a trigram GIN (pg_trgm) if/when customer volume grows enough
-- to warrant real index-backed search. See
-- docs/audits/SEARCH_UNIFICATION_SESSION42H.md §3a + Open Question 6.

DROP INDEX IF EXISTS idx_customers_search;
