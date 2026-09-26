import FieldSaleApprovalQueue from "@/components/field-sale-approval-queue"

export default function VSESalesApprovals() {
    return (
        <FieldSaleApprovalQueue
            dimension="sale"
            title="VSE Sales Approvals"
            description="Review field sales submitted by VSEs. Approving posts the sale side to the Loadout Summary immediately."
        />
    )
}
