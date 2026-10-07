import { pb } from '@/lib/pocketbase';

export interface ReceivableImageSource {
    id?: string;
    collectionId?: string;
    collectionName?: string;
    purchase_order_img?: string | null;
    purchase_order_img_url?: string | null;
}

export function poImageUrl(rec: ReceivableImageSource): string | null {
    if (rec.purchase_order_img_url) return rec.purchase_order_img_url;
    if (rec.purchase_order_img && rec.id && (rec.collectionId || rec.collectionName)) {
        return pb.files.getURL(rec, rec.purchase_order_img) || null;
    }
    return null;
}
