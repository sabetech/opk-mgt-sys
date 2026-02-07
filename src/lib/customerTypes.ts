export interface CustomerType {
    id: number;
    name: string;
}

export interface Customer {
    id: number;
    created_at: string;
    name: string;
    phone: string;
    type_id: number;
    balance: number;
    has_mou: boolean;
    deleted_at: string | null;
    customer_types?: CustomerType; // For joined queries
}

export interface CustomerForm {
    name: string;
    phone: string;
    type_id: string; // Used as string in form selects
    balance: number;
    has_mou: boolean;
}
