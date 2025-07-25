import React, { useRef, useEffect } from 'react';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';

interface EventNameFieldProps {
  eventName: string;
  setEventName: (_value: string) => void;
  isFormSubmitted: boolean;
  eventNameError: string | undefined;
  addErrorField: (_name: string, _state: { isValid: boolean; ref: { focus: () => void } | null }) => void;
}

const EventNameField: React.FC<EventNameFieldProps> = ({
  eventName,
  setEventName,
  isFormSubmitted,
  eventNameError,
  addErrorField,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    addErrorField('eventName', {
      isValid: !eventNameError,
      ref: inputRef.current ? { focus: () => inputRef.current?.focus() } : null
    });
  }, [eventNameError, addErrorField]);

  return (
    <ColumnLayout columns={1}>
      <FormField
        label="Event name"
        stretch={true}
        errorText={isFormSubmitted && eventNameError}
        i18nStrings={{
          errorIconAriaLabel: 'Error',
        }}
      >
        <Input
          value={eventName}
          onChange={({ detail }) => setEventName(detail.value)}
          type="text"
          ref={inputRef}
        />
      </FormField>
    </ColumnLayout>
  );
};

export default EventNameField;
