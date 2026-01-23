import { Calendar as ReactDateRangeCalendar } from "react-date-range"
import "react-date-range/dist/styles.css"
import "react-date-range/dist/theme/default.css"

interface DatePickerProps {
    value: Date | undefined
    onChange: (date: Date) => void
}

export function DatePicker({ value, onChange }: DatePickerProps) {
    return (
        <div className="date-picker-wrapper">
            <ReactDateRangeCalendar
                date={value || new Date()}
                onChange={onChange}
            />
        </div>
    )
}
