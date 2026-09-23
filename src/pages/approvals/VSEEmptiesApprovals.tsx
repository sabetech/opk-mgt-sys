import FieldSaleApprovalQueue from "@/components/field-sale-approval-queue"

export default function VSEEmptiesApprovals() {
    return (
        <FieldSaleApprovalQueue
            dimension="empties"
            title="VSE Empties Approvals"
            description="Review empties counts reported with VSE field sales. Approval validates the empties side."
        />
    )
}
