import { Box, Button, Container, ContentLayout, Grid, Header, KeyValuePairs, Modal, SpaceBetween, StatusIndicator, Table } from '@cloudscape-design/components';
import React, { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/api';
import { getEvent } from '../../../graphql/queries';
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import Badge from "@cloudscape-design/components/badge";
import { updateEventSub } from '../../../graphql/subscriptions';
import { deleteEvent } from '@graphql/mutations';
import Alert from '@cloudscape-design/components/alert';

interface EventDetailsProps {
  eventId?: string;
}

interface EventDetailsData {
  event_status: string;
  id: string;
  name: string;
  event_starts_ts: string;
  event_ends_ts: string;
  additional_notes?: string;
  orchestration_type: string;
  document_name: string;
  created: string;
  updated: string;
  provisioning_parameters?: Array<{
    ParameterKey: string;
    ParameterType: string;
    DefaultValue?: string;
    Description?: string;
    IsNoEcho?: boolean;
  }>;
  outputs?: string;
}

interface OutputsProps {
  outputs: Output[];
}

interface Output {
  OutputKey: string;
  OutputValue: string;
  Description: string;
}

interface Output {
  [key: string]: string | number | boolean | null | { N?: string; S?: string };
}

interface OutputValue {
  N?: string;
  S?: string;
  [key: string]: unknown;
}

const client = generateClient({
  authMode: 'userPool',
});

const formatTime = (dateString: string) => {
  const timestamp = Date.parse(dateString);
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return formattedTime;
};

const fetchEventDetails = async (eventId?: string) => {
  if (!eventId) {
    return;
  }

  try {
    const result = await client.graphql({
      query: getEvent,
      variables: { id: eventId },
    });

    if ('data' in result) {
      return result.data.getEvent;
    } else {
      console.error('Invalid GraphQL result');
    }
  } catch (error) {
    console.error('Error fetching event details:', error);
  }
};

export default function EventDetails({ eventId }: EventDetailsProps) {
  const [eventDetails, setEventDetails] = useState<EventDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const SCOutputsGrid: React.FC<OutputsProps> = ({ outputs }) => (
    <Table
      columnDefinitions={[
        { id: "outputKey", header: "Output Key", cell: item => item.OutputKey },
        {
          id: "outputValue", header: "Output Value", cell: item => (
            <CopyToClipboard
              copyButtonAriaLabel={`Copy ${item.OutputKey}`}
              copyErrorText={`Failed to copy ${item.OutputKey}`}
              copySuccessText={`${item.OutputKey} copied`}
              textToCopy={item.OutputValue || ''}
              variant="inline"
            />
          )
        },
        { id: "description", header: "Description", cell: item => item.Description }
      ]}
      items={outputs}
      loadingText="Loading outputs"
      empty={<Box textAlign="center" color="inherit"><b>No outputs</b></Box>}
    />
  );

  const SSMOutputsGrid: React.FC<OutputsProps> = ({ outputs }) => {
    const parsedOutputs = Array.isArray(outputs) ? outputs[0] : outputs;

    return (
      <Table
        columnDefinitions={[
          { id: "key", header: "Output Key", cell: item => item.key },
          {
            id: "value",
            header: "Output Value",
            cell: item => (
              <CopyToClipboard
                copyButtonAriaLabel={`Copy ${item.key}`}
                copyErrorText={`Failed to copy ${item.key}`}
                copySuccessText={`${item.key} copied`}
                textToCopy={item.value?.toString() ?? ''}
                variant="inline"
              />
            )
          }
        ]}
        items={Object.entries(parsedOutputs).map(([key, value]) => ({ key, value }))}
        loadingText="Loading outputs"
        empty={<Box textAlign="center" color="inherit"><b>No outputs</b></Box>}
      />
    );
  };

  const handleDeleteClick = () => {
    setDeleteModalVisible(true);
  };

  const handleDelete = async () => {
    if (eventDetails) {
      try {
        if (eventDetails.event_status === 'registered' || eventDetails.event_status === 'ended' || eventDetails.event_status === 'failed') {
          await client.graphql({
            query: deleteEvent,
            variables: { pk: eventDetails.id, sk: "Event" },
          });
          window.location.href = '/event-list';
        } else {
          setErrorMessage('An error occurred while deleting the event. Please try again.');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('Error deleting event:', error);
        setErrorMessage('An error occurred while deleting the event. Please try again.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    setDeleteModalVisible(false);
  };

  useEffect(() => {
    if (!eventId) return;

    // Initial fetch
    const fetchData = async () => {
      setLoading(true);
      const data = await fetchEventDetails(eventId);
      setEventDetails(data);
      setLoading(false);
    };

    fetchData();

    // Set up subscription
    const subscription = client.graphql({
      query: updateEventSub,
      variables: { pk: eventId, sk: "Event" }
    });

    // @ts-expect-error : no solution found at the moment
    subscription.subscribe({
      next: ({ data }: { data?: { onUpdateEvent?: Partial<EventDetailsData> } }) => {
        console.log('Received subscription data:', data);
        if (data?.onUpdateEvent) {
          setEventDetails(prevDetails => {
            if (!prevDetails) return null;
            return {
              ...prevDetails,
              ...data.onUpdateEvent,
              event_status: data.onUpdateEvent?.event_status ?? prevDetails.event_status,
              provisioning_parameters: data.onUpdateEvent?.provisioning_parameters ?? prevDetails.provisioning_parameters,
              outputs: data.onUpdateEvent?.outputs ?? prevDetails.outputs
            };
          });          
        }
      },
      error: (error: Error) => console.error('Subscription error:', error)
    });
  }, [eventId]);

  if (!eventDetails) {
    return <div>No event details found.</div>;
  }
  if (loading) {
    return <div>Loading...</div>;
  }
  const parsedOutputs = eventDetails.outputs
    ? JSON.parse(eventDetails.outputs).map((output: Record<string, OutputValue | string | number | boolean | null>) => {
      return Object.entries(output).reduce<Record<string, string | number | boolean | null>>((acc, [key, value]) => {
        acc[key] = typeof value === 'object' && value !== null
          ? ((value as OutputValue).N || (value as OutputValue).S || null)
          : (value as string | number | boolean | null);
        return acc;
      }, {});
    })
    : [];

  const titleForParameters = eventDetails.orchestration_type === 'SC' ? 'Provisioning Parameters' : 'Scaling Parameters';
  const titleForOutputs = eventDetails.orchestration_type === 'SC' ? 'Provisioning Outputs' : 'Scaling Outputs';
  return (
    <div>
      <br />
      {errorMessage && (
        <>
          <Alert
            type="error"
            dismissible
            onDismiss={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
          <br />
        </>
      )}
      <ContentLayout
        header={
          <><Header variant="awsui-h1-sticky" description={eventDetails.additional_notes} actions={
            <Button onClick={handleDeleteClick} iconName='remove'>
              Delete
            </Button>
          }>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {eventDetails.name}
              {(eventDetails.event_status === 'deploy' ||
                eventDetails.event_status === 'scaled' ||
                eventDetails.event_status === 'destroy') && (
                  <>
                    <Badge color="red">LIVE</Badge>
                  </>
                )}
            </div>
          </Header>
          </>
        }
      >
        <Grid gridDefinition={[{ colspan: 12 }]} disableGutters={false}>
          <Container header={<Header variant="h2">Timeline</Header>}>
            {eventDetails.event_status === 'registered' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="in-progress">Registered</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Waiting for event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="pending">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}></p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Scaled</StatusIndicator>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Destroy</StatusIndicator>
                    )
                  }
                ]}
              />
            )}

            {eventDetails.event_status === 'scheduled' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="info">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Waiting for {formatTime(eventDetails.event_starts_ts)}</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="pending">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}></p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Scaled</StatusIndicator>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Destroy</StatusIndicator>
                    )
                  }
                ]}
              />
            )}

            {eventDetails.event_status === 'deploy' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="success">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="loading">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Started at {eventDetails.event_starts_ts}</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Scaled</StatusIndicator>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Destroy</StatusIndicator>
                    )
                  }
                ]}
              />
            )}
            {eventDetails.event_status === 'scaled' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="success">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Deployed successfully</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Scaled</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Up and ready</p></>

                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="pending">Destroy</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Waiting for {eventDetails.event_ends_ts}</p></>
                    )
                  }
                ]}
              />
            )}
            {eventDetails.event_status === 'destroy' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="success">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Deployed successfully</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Scaled</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Up and ready</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="loading">Destroy</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Destroy started</p></>
                    )
                  }
                ]}
              />
            )}
            {eventDetails.event_status === 'ended' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="success">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Provisioning</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Deployed successfully</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Scaled</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Up and ready</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="success">Terminated</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Successfully Terminated</p></>
                    )
                  }
                ]}
              />
            )}
            {eventDetails.event_status === 'failed' && (
              <KeyValuePairs
                columns={4}
                items={[
                  {
                    label: "",
                    value: (
                      <>
                        <StatusIndicator type="success">Scheduled</StatusIndicator>
                        <p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Event day</p>
                      </>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <><StatusIndicator type="error">Provisioning Failed</StatusIndicator><p style={{ fontSize: '12px', color: 'var(--colorGreyPendingNotice)' }}>Deployment failed</p></>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Scaled</StatusIndicator>
                    )
                  },
                  {
                    label: "",
                    value: (
                      <StatusIndicator type="pending">Destroy</StatusIndicator>
                    )
                  }
                ]}
              />
            )}
          </Container>
        </Grid>
        <br></br>
        <Grid gridDefinition={[{ colspan: 12 }]} disableGutters={false}>
          <Container variant="stacked" header={
            <Header headingTagOverride="h3">
              Details
            </Header>
          } >
            <KeyValuePairs columns={4} items={[
              {
                label: "Event ID",
                value: (
                  <CopyToClipboard
                    copyButtonAriaLabel="Copy Event ID"
                    copyErrorText="Failed to copy Event ID"
                    copySuccessText="Event ID copied"
                    textToCopy={eventDetails.id}
                    variant="inline"
                  />
                )
              },
              {
                label: "Start Time",
                value: (
                  <CopyToClipboard
                    copyButtonAriaLabel="Copy Start Time"
                    copyErrorText="Failed to copy Start Time"
                    copySuccessText="Start Time copied"
                    textToCopy={eventDetails.event_starts_ts}
                    variant="inline"
                  />
                )
              },
              {
                label: "End Time",
                value: (
                  <CopyToClipboard
                    copyButtonAriaLabel="Copy End Time"
                    copyErrorText="Failed to copy End Time"
                    copySuccessText="End Time copied"
                    textToCopy={eventDetails.event_ends_ts}
                    variant="inline"
                  />
                )
              },
              {
                label: "Resource Details",
                value: (
                  <>
                    <CopyToClipboard
                      copyButtonAriaLabel="Copy Resource Tag"
                      copyErrorText="Failed to copy Resource Tag"
                      copySuccessText="Resource Tag copied"
                      textToCopy={eventDetails.document_name}
                      variant="inline"
                    />
                    <div style={{ display: 'inline-block', marginLeft: '10px' }}>
                      <Badge color={eventDetails.orchestration_type === 'SSM' ? 'blue' : 'green'}>
                        {eventDetails.orchestration_type}
                      </Badge>
                    </div>
                  </>
                )
              }
            ]} />
          </Container>
        </Grid>
        <br />
        <Grid gridDefinition={[{ colspan: 12 }]} disableGutters={false}>
          <Container variant="stacked" header={
            <Header headingTagOverride="h3">
              {titleForOutputs}
            </Header>
          }>
            {parsedOutputs.length > 0 ? (
              eventDetails.orchestration_type === 'SC' ? (
                <SCOutputsGrid outputs={parsedOutputs} />
              ) : (
                <SSMOutputsGrid outputs={parsedOutputs} />
              )
            ) : (
              <Box textAlign="center" color="inherit">
                <b>No outputs</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  There are no outputs to display yet.
                </Box>
              </Box>
            )}
          </Container>
        </Grid>
        <br />
        <Grid gridDefinition={[{ colspan: 12 }]} disableGutters={false}>
          <Container variant="stacked" header={
            <Header headingTagOverride="h3">
              {titleForParameters}
            </Header>
          }>
            {eventDetails.provisioning_parameters && eventDetails.provisioning_parameters.length > 0 ? (
              <Table
                columnDefinitions={[
                  {
                    id: "key",
                    header: "Parameter Key",
                    cell: item => item.ParameterKey
                  },
                  {
                    id: "value",
                    header: "Default Value",
                    cell: item => (
                      <CopyToClipboard
                        copyButtonAriaLabel={`Copy ${item.ParameterKey}`}
                        copyErrorText={`Failed to copy ${item.ParameterKey}`}
                        copySuccessText={`${item.ParameterKey} copied`}
                        textToCopy={item.DefaultValue || ''}
                        variant="inline"
                      />
                    )
                  },
                  {
                    id: "type",
                    header: "Type",
                    cell: item => item.ParameterType
                  },
                  {
                    id: "description",
                    header: "Description",
                    cell: item => item.Description
                  }
                ]}
                items={eventDetails.provisioning_parameters}
                loadingText="Loading parameters"
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>No parameters</b>
                    <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                      There are no parameters to display.
                    </Box>
                  </Box>
                }
              />
            ) : (
              <Box textAlign="center" color="inherit">
                <b>No parameters</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  There are no parameters to display.
                </Box>
              </Box>
            )}
          </Container>
        </Grid>
        <Modal
          visible={deleteModalVisible}
          onDismiss={() => setDeleteModalVisible(false)}
          header="Confirm deletion"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setDeleteModalVisible(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleDelete}>
                  Delete
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <p>Are you sure you want to delete {eventDetails.name}?</p>
        </Modal>
      </ContentLayout>
    </div>
  );
}
