export type OrderStatus = 'pending' | 'approved' | 'cancelled';

export interface OrderType {
    id: string;
    name: 'sale' | 'vse' | 'promo' | 'protocol';
    created_at: string;
}

export interface Order {
    id: string;
    customer_id: string | null;
    total_amount: number;
    amount_tendered: number;
    payment_type: string | null;
    transaction_id: string | null;
    order_type_id: string;
    date_time: string;
    status: OrderStatus;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface Sale {
    id: string;
    order_id: string;
    product_id: string;
    discount: number;
    quantity: number;
    unit_price: number;
    sub_total: number;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}
