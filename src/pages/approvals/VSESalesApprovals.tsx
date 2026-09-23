import FieldSaleApprovalQueue from "@/components/field-sale-approval-queue"

export default function VSESalesApprovals() {
    return (
        <FieldSaleApprovalQueue
            dimension="sale"
            title="VSE Sales Approvals"
            description="Review field sales submitted by VSEs. Approval validates the sale side; the sale counts once empties are approved too."
        />
    )
}
