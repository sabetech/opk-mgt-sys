import VSEMovementForm from "@/components/vse-movement-form"

export default function RecordVSEReturn() {
    return (
        <VSEMovementForm
            movementType="returned"
            title="Record VSE Returns"
            description="Record unsold stock returned by VSEs."
            quantityLabel="Quantity Returned"
            submitLabel="Record Returns"
            successMessage="VSE returns recorded successfully"
        />
    )
}
