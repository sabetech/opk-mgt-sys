export type OrderStatus = 'pending' | 'approved' | 'cancelled';

export interface OrderType {
    id: number;
    name: 'sale' | 'vse' | 'promo' | 'protocol';
    created_at: string;
}

export interface Order {
    id: number;
    customer_id: number | null;
    total_amount: number;
    amount_tendered: number;
    payment_type: string | null;
    transaction_id: string | null;
    order_type_id: number;
    date_time: string;
    status: OrderStatus;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface Sale {
    id: number;
    order_id: number;
    product_id: number;
    discount: number;
    quantity: number;
    unit_price: number;
    sub_total: number;
    user_id: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}
