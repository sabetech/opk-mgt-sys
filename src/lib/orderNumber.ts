import { pb } from './pocketbase'

const STARTING_ORDER_NUMBER = 100001

export async function generateOrderNumber(): Promise<number> {
    try {
        // Fetch the latest order by order_number descending
        const result = await pb.collection('orders').getList(1, 1, {
            sort: '-order_number',
            fields: 'order_number'
        })

        if (result.items.length > 0) {
            return result.items[0].order_number + 1
        }
    } catch {
        // Fall through to starting number
    }

    return STARTING_ORDER_NUMBER
}

export function formatOrderNumber(orderNumber: number): string {
    return `#${orderNumber}`
}
