CREATE OR REPLACE FUNCTION handle_warehouse_order_stock()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    v_order_type TEXT;
    v_customer_type TEXT;
    v_log_type inventory_log_type;
BEGIN
    -- Get order details for logging
    SELECT ot.name, ct.name INTO v_order_type, v_customer_type
    FROM orders o
    JOIN order_types ot ON o.order_type_id = ot.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN customer_types ct ON c.type_id = ct.id
    WHERE o.id = NEW.order_id;

    -- Determine log type
    IF v_order_type = 'promo' THEN
        v_log_type := 'promo_out';
    ELSIF v_order_type = 'sale' THEN
        IF v_customer_type = 'Wholesaler' THEN
            v_log_type := 'wholesale_sale';
        ELSE
            v_log_type := 'retail_sale';
        END IF;
    ELSE
        v_log_type := 'retail_sale'; -- Default
    END IF;

    -- Deduct stock when status moves from 'pending' to 'ready'
    -- This signifies the order has been fulfilled/picked.
    IF OLD.status = 'pending' AND NEW.status = 'ready' THEN
        FOR item IN SELECT product_id, quantity FROM warehouse_order_items WHERE warehouse_order_id = NEW.id LOOP
            -- Update stock
            INSERT INTO warehouse_stock (product_id, quantity)
            VALUES (item.product_id, -item.quantity)
            ON CONFLICT (product_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity - item.quantity,
                updated_at = NOW();

            -- Log movement
            INSERT INTO inventory_logs (product_id, type, quantity, reference_id, reference_table, description)
            VALUES (item.product_id, v_log_type, -item.quantity, NEW.id, 'warehouse_orders', 'Fulfilled Order #' || NEW.id);
        END LOOP;
    
    -- Restore stock when status moves from 'ready' to 'cancelled' (reversal)
    -- This signifies the fulfilled order was cancelled and items returned to stock.
    ELSIF OLD.status = 'ready' AND NEW.status = 'cancelled' THEN
        FOR item IN SELECT product_id, quantity FROM warehouse_order_items WHERE warehouse_order_id = NEW.id LOOP
            INSERT INTO warehouse_stock (product_id, quantity)
            VALUES (item.product_id, item.quantity)
            ON CONFLICT (product_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity + item.quantity,
                updated_at = NOW();

            -- Log reversal
            INSERT INTO inventory_logs (product_id, type, quantity, reference_id, reference_table, description)
            VALUES (item.product_id, v_log_type, item.quantity, NEW.id, 'warehouse_orders', 'Cancelled Order Reversal #' || NEW.id);
        END LOOP;

    -- Note: pending -> cancelled does nothing because stock was never deducted
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to warehouse_orders
DROP TRIGGER IF EXISTS trigger_warehouse_order_stock ON warehouse_orders;
CREATE TRIGGER trigger_warehouse_order_stock
AFTER UPDATE ON warehouse_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION handle_warehouse_order_stock();
