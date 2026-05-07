-- Update get_dashboard_stats to exclude 'Cancelled' status
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'active_orders', (SELECT count(*) FROM orders WHERE status NOT IN ('Completed', 'Cancelled')),
        'total_clients', (SELECT count(*) FROM clients),
        'total_items', (
            SELECT count(*) 
            FROM items i 
            JOIN orders o ON i.order_id = o.id 
            WHERE o.status NOT IN ('Completed', 'Cancelled')
        ),
        'recent_orders', (
            SELECT jsonb_agg(o)
            FROM (
                SELECT 
                    o.id, 
                    o.status, 
                    o.created_at, 
                    jsonb_build_object('name', c.name) as clients
                FROM orders o
                LEFT JOIN clients c ON o.client_id = c.id
                WHERE o.status NOT IN ('Completed', 'Cancelled')
                ORDER BY o.created_at DESC
                LIMIT 50
            ) o
        )
    ) INTO result;
    
    RETURN result;
END;
$$;
