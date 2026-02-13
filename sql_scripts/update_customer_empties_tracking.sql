-- 1. Add tracking columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS has_mou BOOLEAN DEFAULT FALSE;

-- 2. Add customer_id to empties_log if not exists (handling possible existing column)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='empties_log' AND column_name='customer_id') THEN
        ALTER TABLE empties_log ADD COLUMN customer_id BIGINT REFERENCES customers(id);
    END IF;
END $$;

-- 3. Create function to update customer balance with MOU logic
CREATE OR REPLACE FUNCTION update_customer_empties_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_type TEXT;
    v_has_mou BOOLEAN;
    v_current_balance INTEGER;
BEGIN
    -- Only proceed if customer_id is present
    IF NEW.customer_id IS NOT NULL THEN
        -- Get customer info and current balance
        SELECT ct.name, c.has_mou, c.balance 
        INTO v_customer_type, v_has_mou, v_current_balance
        FROM customers c
        JOIN customer_types ct ON c.type_id = ct.id
        WHERE c.id = NEW.customer_id;

        -- Returnable products purchase: REDUCE balance
        IF NEW.activity = 'customer_purchase' THEN
            -- Check if allowed to go negative
            -- Only Wholesalers with has_mou = true can go negative
            IF NOT (v_customer_type = 'Wholesaler' AND v_has_mou = true) THEN
                IF (v_current_balance - NEW.total_quantity) < 0 THEN
                    RAISE EXCEPTION 'Insufficient empties balance. Customer is not a Wholesaler with an MOU. Current balance: %, requested: %', v_current_balance, NEW.total_quantity;
                END IF;
            END IF;

            UPDATE customers
            SET balance = balance - NEW.total_quantity
            WHERE id = NEW.customer_id;
        
        -- Customer returns empties: INCREASE balance
        ELSIF NEW.activity = 'customer_empties_return' THEN
            UPDATE customers
            SET balance = balance + NEW.total_quantity
            WHERE id = NEW.customer_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for balance updates
DROP TRIGGER IF EXISTS trigger_update_customer_empties_balance ON empties_log;
CREATE TRIGGER trigger_update_customer_empties_balance
AFTER INSERT ON empties_log
FOR EACH ROW
EXECUTE FUNCTION update_customer_empties_balance();
