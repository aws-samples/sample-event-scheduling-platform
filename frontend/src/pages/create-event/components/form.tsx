import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import Container from '@cloudscape-design/components/container';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Select from "@cloudscape-design/components/select";
import RadioGroup from "@cloudscape-design/components/radio-group";
import Spinner from '@cloudscape-design/components/spinner';
import Wizard from "@cloudscape-design/components/wizard";
import { generateClient } from 'aws-amplify/api';
import { createEvent as createEventMutation } from '@graphql/mutations';
import { ListScProduct, ListSSMDocuments, getProvisioningParameters, listProvisioningArtifacts, getSSMDocumentParameters, getSSMDocumentVersions } from '../../../graphql/queries';
import { formatDate, formatNextDate } from './functions';
import FlashbarComponent from './FlashbarComponent';
import { FlashbarProps } from "@cloudscape-design/components";
import EventNameField from './EventNameField';
import AdditionalNotesField from './AdditionalNotesField';
import DateRangePickerComponent from './DateRangePickerComponent';
import { InputProps } from '@cloudscape-design/components';

const client = generateClient({
  authMode: 'userPool',
});

interface SSMDocumentParameter {
  Name: string;
  Type: string;
  Description?: string;
  DefaultValue?: string;
}

interface ProvisioningParameterDetails {
  ParameterKey: string;
  ParameterType: string;
  DefaultValue?: string;
  Description?: string;
  IsNoEcho?: boolean;
}

interface ProvisioningArtifact {
  Id: string;
  Name: string;
  Description?: string;
  CreatedTime: string;
  Active?: boolean;
}

interface SCProduct {
  id: string;
  Name: string;
  ShortDescription?: string;
}

interface SSMDocumentVersion {
  Name: string;
  DocumentVersion: string;
  CreatedDate: string;
  IsDefaultVersion: boolean;
}

const filterInternalParameters = (params: SSMDocumentParameter[]) => {
  return params.filter(param => !param.Name.startsWith('internal'));
};

export default function EventForm() {
  const navigate = useNavigate();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [ssmDocuments, setSsmDocuments] = useState([]);
  const [ssmParameters, setSSMParameters] = useState<SSMDocumentParameter[]>([]);
  const [scProducts, setScProducts] = useState([]);
  const [scParameters, setSCParameters] = useState<ProvisioningParameterDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocumentType, setSelectedDocumentType] = useState("SSM");
  const [selectedDocument, setSelectedDocument] = useState('');
  const [provisioningArtifact, setProvisioningArtifact] = useState('');
  const [eventName, setEventName] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [provisioningArtifacts, setProvisioningArtifacts] = useState<ProvisioningArtifact[]>([]);
  const [ssmVersions, setSSMVersions] = useState<SSMDocumentVersion[]>([]);
  const [selectedSSMVersion, setSelectedSSMVersion] = useState('');
  const [value, setValue] = useState({
    start: { date: formatDate(new Date()), time: '' },
    end: { date: formatNextDate(new Date()), time: '' }
  });
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const isEmptyString = (value: string) => !value?.length;
  const provisioningParameters = scParameters.map(param => ({
    ParameterKey: param.ParameterKey,
    ParameterType: param.ParameterType,
    DefaultValue: param.DefaultValue,
    Description: param.Description,
    IsNoEcho: param.IsNoEcho
  }));

  useEffect(() => {
    if (selectedDocumentType === 'SC' && selectedDocument && provisioningArtifact) {
      fetchProvisioningParameters(selectedDocument, provisioningArtifact);
    }
  }, [selectedDocument, provisioningArtifact, selectedDocumentType]);  

  useEffect(() => {
    if (selectedDocumentType === 'SSM' && selectedDocument && selectedSSMVersion) {
      fetchSSMDocumentParameters(selectedDocument, selectedSSMVersion);
    }
  }, [selectedDocument, selectedSSMVersion, selectedDocumentType]);

  const fetchSSMDocumentVersions = async (documentName: string) => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: getSSMDocumentVersions,
        variables: { documentName },
      });
      if ('data' in result) {
        setSSMVersions(result.data.getSSMDocumentVersions);
      }
    } catch (error) {
      console.error('Error fetching SSM document versions:', error);
      setSSMVersions([]);
      setItems([{
        type: "error",
        content: "An error occurred fetching SSM document versions. Please try again later.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => { setItems([]); },
        id: "message_5"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSSMDocumentParameters = async (documentName: string, documentVersion: string) => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: getSSMDocumentParameters,
        variables: { documentName, documentVersion },
      });
      if ('data' in result) {
        const filteredParams = filterInternalParameters(result.data.getSSMDocumentParameters);
        setSSMParameters(filteredParams);
      } else {
        console.error('Unexpected result structure:', result);
        setSSMParameters([]);
      }
    } catch (error) {
      console.error('Error fetching SSM document parameters:', error);
      setSSMParameters([]);
      setItems([{
        type: "error",
        content: "An error occurred fetching SSM document parameters. Please try again later.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => { setItems([]); },
        id: "message_4"
      }]);
    } finally {
      setLoading(false);
    }
  };  

  const fetchProvisioningArtifacts = async (productId: string) => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: listProvisioningArtifacts,
        variables: { productId },
      });
      if ('data' in result) {
        setProvisioningArtifacts(result.data.listProvisioningArtifacts);
      }
    } catch (error) {
      console.error('Error fetching provisioning artifacts:', error);
      setProvisioningArtifacts([]);
      setItems([{
        type: "error",
        content: "An error occurred fetching provisioning artifacts. Please try again later.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => { setItems([]); },
        id: "message_3"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProvisioningParameters = async (productId: string, provisioningArtifactId: string) => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: getProvisioningParameters,
        variables: { productId, provisioningArtifactId },
      });
      if ('data' in result) {
        setSCParameters(result.data.getProvisioningParameters);
      }
    } catch (error) {
      console.error('Error fetching provisioning parameters:', error);
      setSCParameters([]);
      setItems([{
        type: "error",
        content: "An error occurred fetching provisioning parameters. Please try again later.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => { setItems([]); },
        id: "message_2"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSsmDocuments = async () => {
    try {
      setLoading(true);
      const result = await client.graphql({ query: ListSSMDocuments });
      if ('data' in result) {
        setSsmDocuments(result.data.listSSMDocuments);
      }
    } catch (error) {
      console.error('Error fetching SSM documents:', error);
      setSsmDocuments([]);
      setItems([{
        type: "error",
        content: "An error occurred fetching SSM documents. Please try again later.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => {
          setItems([]);
          setIsSubmitted(false);
        },
        id: "message_1"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSCProduct = async () => {
    try {
      setLoading(true);
      const result = await client.graphql({ query: ListScProduct });
      if ('data' in result) {
        setScProducts(result.data.ListScProduct);
      }
    } catch (error) {
      console.error('Error fetching SC products:', error);
      setScProducts([]);
      setItems([{
        type: "error",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => {
          setItems([]);
          setIsSubmitted(false);
        },
        content: "An error occurred fetching SC products. Please try again later.",
        id: "message_1"
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (selectedDocumentType === "SSM") {
        await fetchSsmDocuments();
      } else if (selectedDocumentType === "SC") {
        await fetchSCProduct();
      }
    };
    fetchData();
  }, [selectedDocumentType]);

  const validateForm = () => {
    const errors = [];
    if (isEmptyString(eventName)) errors.push('Event name is required');
    if (isEmptyString(selectedDocument)) errors.push('Document/Product selection is required');
    if (selectedDocumentType === 'SC' && isEmptyString(provisioningArtifact)) errors.push('Provisioning artifact is required');
    if (selectedDocumentType === 'SSM' && isEmptyString(selectedSSMVersion)) errors.push('SSM document version is required');
    if (isEmptyString(eventStart)) errors.push('Event start date is required');
    if (isEmptyString(eventEnd)) errors.push('Event end date is required');
    
    // Check if start date is in the past
    if (eventStart) {
      const startDate = new Date(eventStart);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        errors.push('Event start date cannot be in the past');
      }
    }
    
    return errors;
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm();
    if (validationErrors.length === 0) {
      try {
        const filteredSSMParameters = filterInternalParameters(ssmParameters);
        await client.graphql({
          query: createEventMutation,
          variables: {
            name: eventName,
            additional_notes: additionalNotes,
            event_starts_ts: eventStart,
            event_ends_ts: eventEnd,
            orchestration_type: selectedDocumentType,
            document_name: selectedDocument,
            version_id: selectedDocumentType === 'SC' ? provisioningArtifact : selectedSSMVersion,
            provisioning_parameters: selectedDocumentType === 'SC' ? provisioningParameters : filteredSSMParameters.map(param => ({
              ParameterKey: param.Name,
              ParameterType: param.Type,
              DefaultValue: param.DefaultValue,
              Description: param.Description,
              IsNoEcho: false
            }))
          },
        });
        setItems([{
          type: "success",
          dismissible: true,
          dismissLabel: "Dismiss message",
          onDismiss: () => {
            setItems([]);
            setIsSubmitted(false);
          },
          content: "Event created successfully",
          id: "message_1"
        }]);
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        setItems([{
          type: "error",
          dismissible: true,
          dismissLabel: "Dismiss message",
          onDismiss: () => {
            setItems([]);
            setIsSubmitted(false);
          },
          content: "An error occurred while creating the event",
          id: "message_1"
        }]);
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      setItems([{
        type: "error",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => {
          setItems([]);
          setIsSubmitted(false);
        },
        content: `Please fix the following errors: ${validationErrors.join(', ')}`,
        id: "validation_error"
      }]);
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const validateStep = (stepIndex: number) => {
    switch (stepIndex) {
      case 0: // Event Details
        if (isEmptyString(eventName) || isEmptyString(eventStart) || isEmptyString(eventEnd)) {
          return false;
        }
        // Check if start date is in the past
        if (eventStart) {
          const startDate = new Date(eventStart);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (startDate < today) {
            return false;
          }
        }
        return true;
      case 1: // Event Type
        if (selectedDocumentType === 'SC') {
          return !isEmptyString(selectedDocument) && !isEmptyString(provisioningArtifact);
        } else {
          return !isEmptyString(selectedDocument) && !isEmptyString(selectedSSMVersion);
        }
      case 2: // Launch Parameters
        if (selectedDocumentType === 'SC') {
          return scParameters.every(param => 
            param.DefaultValue && param.DefaultValue.trim() !== ''
          );
        } else if (selectedDocumentType === 'SSM') {
          return ssmParameters.every(param => 
            param.DefaultValue && param.DefaultValue.trim() !== ''
          );
        }
        return true;
      default:
        return true;
    }
  };

  const steps = [
    {
      title: "Event Details",
      content: (
        <SpaceBetween direction="vertical" size="l">
          <EventNameField
            eventName={eventName}
            setEventName={setEventName}
            isFormSubmitted={isSubmitted}
            eventNameError={isEmptyString(eventName) ? 'Event name is required.' : undefined}
            addErrorField={() => { }}
          />
          <AdditionalNotesField
            additionalNotes={additionalNotes}
            setAdditionalNotes={setAdditionalNotes}
          />
          <DateRangePickerComponent
            value={value}
            setValue={setValue}
            setEventStart={setEventStart}
            setEventEnd={setEventEnd}
          />
        </SpaceBetween>
      ),
      isOptional: false
    },
    {
      title: "Event Type",
      content: (
        <SpaceBetween direction="vertical" size="l">
          <RadioGroup
            onChange={({ detail }) => setSelectedDocumentType(detail.value)}
            value={selectedDocumentType}
            items={[
              { value: "SSM", label: "Scale your infrastructure", description: "Select an existing SSM document" },
              { value: "SC", label: "Provision a new product", description: "Select a Service Catalog product" },
            ]}
          />
          <FormField label={selectedDocumentType === 'SSM' ? 'Choose Document' : 'Choose Product'} stretch={true}>
            {loading ? (
              <Spinner size="normal" />
            ) : (
              <Select
                selectedOption={{ value: selectedDocument }}
                onChange={({ detail }) => {
                  setSelectedDocument(detail.selectedOption.value || '');
                  setProvisioningArtifact('');
                  setSelectedSSMVersion('');
                  if (selectedDocumentType === 'SC') {
                    fetchProvisioningArtifacts(detail.selectedOption.value || '');
                  } else if (selectedDocumentType === 'SSM') {
                    fetchSSMDocumentVersions(detail.selectedOption.value || '');
                  }
                }}
                options={
                  selectedDocumentType === "SSM"
                    ? (ssmDocuments.some(doc => doc)
                      ? ssmDocuments.map((doc: string) => ({ label: doc, value: doc }))
                      : [{ label: "No documents available", value: "none", description: "No SSM documents found" }])
                    : (scProducts.some(prod => prod)
                      ? scProducts.map((prod: SCProduct) => ({ label: prod.Name, value: prod.id, description: prod.ShortDescription || 'No description available' }))
                      : [{ label: "No products available", value: "none", description: "No SC products found" }])
                }
              />
            )}
          </FormField>
          {selectedDocumentType === 'SC' && selectedDocument && (
            <FormField label="Provisioning Artifact ID" stretch={true}>
              {loading ? (
                <Spinner size="normal" />
              ) : (
                <Select
                  selectedOption={{ value: provisioningArtifact }}
                  onChange={({ detail }) => setProvisioningArtifact(detail.selectedOption.value || '')}
                  options={
                    provisioningArtifacts.length > 0
                      ? provisioningArtifacts.map((artifact: ProvisioningArtifact) => ({
                        label: `${artifact.Name} (${artifact.Id})`,
                        value: artifact.Id,
                        description: artifact.Description || `Created: ${new Date(artifact.CreatedTime).toLocaleString()}`
                      }))
                      : [{ label: "No artifacts available", value: "none", description: "No provisioning artifacts found" }]
                  }
                />
              )}
            </FormField>
          )}
          {selectedDocumentType === 'SSM' && selectedDocument && (
            <FormField label="SSM Document Version" stretch={true}>
              {loading ? (
                <Spinner size="normal" />
              ) : (
                <Select
                  selectedOption={{ value: selectedSSMVersion }}
                  onChange={({ detail }) => setSelectedSSMVersion(detail.selectedOption.value || '')}
                  options={
                    ssmVersions.length > 0
                      ? ssmVersions.map((version: SSMDocumentVersion) => ({
                        label: version.DocumentVersion,
                        value: version.DocumentVersion,
                        description: `Created: ${new Date(version.CreatedDate).toLocaleString()}`
                      }))
                      : [{ label: "No versions available", value: "none", description: "No SSM document versions found" }]
                  }
                />
              )}
            </FormField>
          )}
        </SpaceBetween>
      )
    },
    {
      title: "Launch Parameters",
      content: (
        <SpaceBetween direction="vertical" size="l">
          {loading ? (
            <Spinner size="normal" />
          ) : selectedDocumentType === 'SC' && scParameters.length > 0 ? (
            scParameters.map((param, index) => (
              <FormField
                key={index}
                label={param.ParameterKey}
                description={param.Description}
                stretch={true}
              >
                <Input
                  value={param.DefaultValue || ''}
                  onChange={({ detail }) => {
                    const updatedParams = [...scParameters];
                    updatedParams[index].DefaultValue = detail.value;
                    setSCParameters(updatedParams);
                  }}
                  type={param.ParameterType === 'Number' ? 'number' : 'text'}
                  placeholder={`Enter ${param.ParameterKey}`}
                />
              </FormField>
            ))
          ) : selectedDocumentType === 'SSM' && ssmParameters.length > 0 ? (
            ssmParameters.map((param, index) => (
              <FormField
                key={index}
                label={param.Name}
                description={param.Description}
                stretch={true}
              >
                <Input
                  value={param.DefaultValue || ''}
                  onChange={({ detail }) => {
                    const updatedParams = [...ssmParameters];
                    updatedParams[index].DefaultValue = detail.value;
                    setSSMParameters(updatedParams);
                  }}
                  type={
                    param.Type === 'StringList' 
                      ? 'text' 
                      : (param.Type.toLowerCase() as InputProps.Type) || 'text'
                  }
                  placeholder={`Enter ${param.Name}`}
                />
              </FormField>
            ))
          ) : (
            <FormField label={`${selectedDocumentType} Parameters`} stretch={true}>
              <Input value="No parameters required" readOnly={true} />
            </FormField>
          )}
        </SpaceBetween>
      )
    },
    {
      title: "Review and Submit",
      content: (
        <SpaceBetween direction="vertical" size="l">
          <FormField label="Event Name" stretch={true}>
            <Input value={eventName} readOnly={true} />
          </FormField>
          <FormField label="Additional Notes" stretch={true}>
            <Input value={additionalNotes} readOnly={true} />
          </FormField>
          <FormField label="Event Start" stretch={true}>
            <Input value={eventStart} readOnly={true} />
          </FormField>
          <FormField label="Event End" stretch={true}>
            <Input value={eventEnd} readOnly={true} />
          </FormField>
          <FormField label="Document Type" stretch={true}>
            <Input value={selectedDocumentType} readOnly={true} />
          </FormField>
          <FormField label="Document Name" stretch={true}>
            <Input value={selectedDocument} readOnly={true} />
          </FormField>
          {selectedDocumentType === 'SC' && (
            <FormField label="Provisioning Artifact ID" stretch={true}>
              <Input value={provisioningArtifact} readOnly={true} />
            </FormField>
          )}
          {selectedDocumentType === 'SSM' && (
            <FormField label="SSM Document Version" stretch={true}>
              <Input value={selectedSSMVersion} readOnly={true} />
            </FormField>
          )}
          {selectedDocumentType === 'SC' ? (
            scParameters.map((param, index) => (
              <FormField key={index} label={param.ParameterKey} stretch={true}>
                <Input value={param.DefaultValue || ''} readOnly={true} />
              </FormField>
            ))
          ) : (
            ssmParameters.map((param, index) => (
              <FormField key={index} label={param.Name} stretch={true}>
                <Input value={param.DefaultValue || ''} readOnly={true} />
              </FormField>
            ))
          )}
        </SpaceBetween>
      )
    }
  ];
  return (
    <Container>
      <FlashbarComponent items={items} />
      <Wizard
        i18nStrings={{
          stepNumberLabel: stepNumber =>
            `Step ${stepNumber}`,
          collapsedStepsLabel: (stepNumber, stepsCount) =>
            `Step ${stepNumber} of ${stepsCount}`,
          cancelButton: "Cancel",
          previousButton: "Previous",
          nextButton: "Next",
          navigationAriaLabel: "Steps",
        }}
        steps={steps}
        activeStepIndex={activeStepIndex}
        onNavigate={({ detail }) => {
          const currentStepValid = validateStep(activeStepIndex);
          if (detail.requestedStepIndex > activeStepIndex && !currentStepValid) {
            let message = "All fields are not filled. Please complete:";
            if (activeStepIndex === 0) {
              const missing: string[] = [];
              if (isEmptyString(eventName)) missing.push("Event name");
              if (isEmptyString(eventStart)) missing.push("Start date");
              if (isEmptyString(eventEnd)) missing.push("End date");
              if (eventStart) {
                const startDate = new Date(eventStart);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (startDate < today) {
                  missing.push("Start date cannot be in the past");
                }
              }
              message += ` ${missing.join(", ")}`;
            } else if (activeStepIndex === 1) {
              const missing: string[] = [];
              if (isEmptyString(selectedDocument)) missing.push(selectedDocumentType === 'SC' ? "Product" : "Document");
              if (selectedDocumentType === 'SC' && isEmptyString(provisioningArtifact)) missing.push("Provisioning artifact");
              if (selectedDocumentType === 'SSM' && isEmptyString(selectedSSMVersion)) missing.push("Document version");
              message += ` ${missing.join(", ")}`;
            } else if (activeStepIndex === 2) {
              const missing: string[] = [];
              if (selectedDocumentType === 'SC') {
                scParameters.forEach(param => {
                  if (!param.DefaultValue || param.DefaultValue.trim() === '') {
                    missing.push(param.ParameterKey);
                  }
                });
              } else if (selectedDocumentType === 'SSM') {
                ssmParameters.forEach(param => {
                  if (!param.DefaultValue || param.DefaultValue.trim() === '') {
                    missing.push(param.Name);
                  }
                });
              }
              if (missing.length > 0) {
                message = "All launch parameters must be filled. Missing: " + missing.join(", ");
              }
            }
            setItems([{
              type: "error",
              dismissible: true,
              dismissLabel: "Dismiss message",
              onDismiss: () => setItems([]),
              content: message,
              id: "step_validation_error"
            }]);
            return;
          }
          setItems([]); // Clear error messages on successful navigation
          setActiveStepIndex(detail.requestedStepIndex);
        }}
        onCancel={() => navigate('/home')}
        onSubmit={handleSubmit}
        submitButtonText="Submit"
      />
    </Container>
  );
}