import VSEMovementForm from "@/components/vse-movement-form"

export default function RecordVSESale() {
    return (
        <VSEMovementForm
            movementType="sold"
            title="Record VSE Sales"
            description="Record products sold by VSEs in the field."
            quantityLabel="Quantity Sold"
            submitLabel="Record Sales"
            successMessage="VSE sales recorded successfully"
        />
    )
}
