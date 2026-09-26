import FieldSaleApprovalQueue from "@/components/field-sale-approval-queue"

export default function VSESalesApprovals() {
    return (
        <FieldSaleApprovalQueue
            dimension="sale"
            title="VSE Sales Approvals"
            description="Review field sales submitted by VSEs. Approving adds the sale to the VSE's pending order for the day — the cashier collects cash in Orders."
        />
    )
}
