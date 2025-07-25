import React from 'react';
import FormField from '@cloudscape-design/components/form-field';
import DateRangePicker, { DateRangePickerProps } from "@cloudscape-design/components/date-range-picker";

interface DateRangePickerComponentProps {
    value: {
        start: {
            date: string;
            time: string;
        };
        end: {
            date: string;
            time: string;
        };
    };
    setValue: React.Dispatch<React.SetStateAction<{
        start: {
            date: string;
            time: string;
        };
        end: {
            date: string;
            time: string;
        };
    }>>;
    setEventStart: React.Dispatch<React.SetStateAction<string>>;
    setEventEnd: React.Dispatch<React.SetStateAction<string>>;
}

const DateRangePickerComponent: React.FC<DateRangePickerComponentProps> = ({
    value,
    setValue,
    setEventStart,
    setEventEnd,
}) => {
    return (
        <FormField
            label="Date Range Picker"
            stretch={true}
        >
            <DateRangePicker
                onChange={({ detail }) => {
                    if (detail.value && 'startDate' in detail.value && 'endDate' in detail.value) {
                        setEventStart(detail.value.startDate ? new Date(detail.value.startDate).toISOString() : '');
                        setEventEnd(detail.value.endDate ? new Date(detail.value.endDate).toISOString() : '');
                    }

                    const { startDate, endDate, type } = detail.value as DateRangePickerProps.AbsoluteValue;
                    if (type === 'absolute') {
                        setValue({
                            ...value,
                            start: { date: startDate, time: "00:00:00" },
                            end: { date: endDate, time: "23:59:59" },
                        });
                    }
                }}
                value={{
                    type: 'absolute',
                    startDate: value.start.date,
                    endDate: value.end.date
                }}
                relativeOptions={[]}
                isValidRange={(range: DateRangePickerProps.Value | null) => {
                    if (!range) return { valid: true };
                    if (range.type === "absolute") {
                        const [startDateWithoutTime] = range.startDate.split("T");
                        const [endDateWithoutTime] = range.endDate.split("T");

                        if (!startDateWithoutTime || !endDateWithoutTime) {
                            return {
                                valid: false,
                                errorMessage: "The selected date range is incomplete. Select a start and end date for the date range."
                            };
                        }
                        
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const startDate = new Date(range.startDate);
                        
                        if (startDate < today) {
                            return {
                                valid: false,
                                errorMessage: "The start date cannot be in the past. Please select a current or future date."
                            };
                        }
                        
                        if (new Date(range.startDate) > new Date(range.endDate)) {
                            return {
                                valid: false,
                                errorMessage: "The selected date range is invalid. The start date must be before the end date."
                            };
                        }
                    }
                    return { valid: true };
                }}
                i18nStrings={{
                    relativeModeTitle: "Relative mode",
                    absoluteModeTitle: "Absolute mode",
                    cancelButtonLabel: "Cancel",
                    applyButtonLabel: "Apply",
                    clearButtonLabel: "Clear and dismiss",
                    startDateLabel: "Preroll date",
                    startTimeLabel: "Preroll time",
                    endDateLabel: "End date",
                    endTimeLabel: "End time",
                    dateTimeConstraintText: "For date, use YYYY/MM/DD. For time, use 24 hr format.",
                    ariaLabel: "Date range picker"
                }}
                absoluteFormat="long-localized"
                placeholder="Filter by a date and time range"
                rangeSelectorMode="absolute-only"
                dateOnly={false}
            />
        </FormField>
    );
};

export default DateRangePickerComponent;
