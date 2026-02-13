import { DateRange } from "react-date-range"
import type { Range, RangeKeyDict } from "react-date-range"
import "react-date-range/dist/styles.css"
import "react-date-range/dist/theme/default.css"

interface DateRangePickerProps {
    value: Range[]
    onChange: (ranges: RangeKeyDict) => void
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
    return (
        <div className="date-range-picker-wrapper">
            <DateRange
                ranges={value}
                onChange={onChange}
                months={2}
                direction="horizontal"
                showMonthAndYearPickers={false}
                moveRangeOnFirstSelection={false}
            />
        </div>
    )
}
