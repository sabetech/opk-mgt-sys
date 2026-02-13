-- Trigger to handle warehouse stock deduction and restoration for VSE Loadouts
CREATE OR REPLACE FUNCTION handle_loadout_stock()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Deduct stock when status moves to 'approved'
    -- This signifies the items have been assigned and picked by the VSE.
    IF (OLD IS NULL OR OLD.status != 'approved') AND NEW.status = 'approved' THEN
        FOR item IN SELECT product_id, quantity FROM loadout_items WHERE loadout_id = NEW.id LOOP
            -- Update stock
            INSERT INTO warehouse_stock (product_id, quantity)
            VALUES (item.product_id, -item.quantity)
            ON CONFLICT (product_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity - item.quantity,
                updated_at = NOW();

            -- Log movement
            INSERT INTO inventory_logs (product_id, type, quantity, reference_id, reference_table, description)
            VALUES (item.product_id, 'vse_loadout', -item.quantity, NEW.id, 'loadouts', 'VSE Loadout #' || NEW.id);
        END LOOP;
    
    -- Restore stock when status moves from 'approved' to 'cancelled' (reversal)
    -- This signifies the loadout was cancelled and items returned to warehouse stock.
    ELSIF OLD.status = 'approved' AND NEW.status = 'cancelled' THEN
        FOR item IN SELECT product_id, quantity FROM loadout_items WHERE loadout_id = NEW.id LOOP
            INSERT INTO warehouse_stock (product_id, quantity)
            VALUES (item.product_id, item.quantity)
            ON CONFLICT (product_id)
            DO UPDATE SET 
                quantity = warehouse_stock.quantity + item.quantity,
                updated_at = NOW();

            -- Log reversal
            INSERT INTO inventory_logs (product_id, type, quantity, reference_id, reference_table, description)
            VALUES (item.product_id, 'vse_loadout', item.quantity, NEW.id, 'loadouts', 'VSE Loadout Cancellation Reversal #' || NEW.id);
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to loadouts
DROP TRIGGER IF EXISTS trigger_loadout_stock ON loadouts;
CREATE TRIGGER trigger_loadout_stock
AFTER INSERT OR UPDATE ON loadouts
FOR EACH ROW
EXECUTE FUNCTION handle_loadout_stock();
