import React from 'react';
import FormField from '@cloudscape-design/components/form-field';
import Textarea from '@cloudscape-design/components/textarea';

interface AdditionalNotesFieldProps {
  additionalNotes: string;
  setAdditionalNotes: (_value: string) => void;
}

const AdditionalNotesField: React.FC<AdditionalNotesFieldProps> = ({
  additionalNotes,
  setAdditionalNotes,
}) => {
  return (
    <FormField
      label={
        <span>
          Description<i> - optional</i>
        </span>
      }
      stretch={true}
    >
      <Textarea
        value={additionalNotes}
        onChange={({ detail }) => setAdditionalNotes(detail.value)}
        rows={4}
      />
    </FormField>
  );
};

export default AdditionalNotesField;
