// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { ReactNode, useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/api';
import { getEvent, listEvents } from '../../../graphql/queries';
import { deleteEvent } from '../../../graphql/mutations';
import Badge from '@cloudscape-design/components/badge';

import { useCollection } from '@cloudscape-design/collection-hooks';
import CollectionPreferences, {
  CollectionPreferencesProps,
} from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Pagination from '@cloudscape-design/components/pagination';
import Table, { TableProps } from '@cloudscape-design/components/table';

import { Link, Modal, TextFilter } from '@cloudscape-design/components';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Alert from '@cloudscape-design/components/alert';

const client = generateClient({
  authMode: 'userPool',
});

interface Event {
  id: string;
  pk: string;
  sk: string;
  name: string;
  additional_notes?: string;
  event_starts_ts: number;
  event_ends_ts: number;
  event_status: string;
}

const getFilterCounterText = (count = 0) => `${count} ${count === 1 ? 'match' : 'matches'}`;
const getHeaderCounterText = (items: readonly Event[] = [], selectedItems: readonly Event[] = []) => {
  return selectedItems && selectedItems.length > 0 ? `(${selectedItems.length}/${items.length})` : `(${items.length})`;
};

const columnDefinitions: TableProps<Event>['columnDefinitions'] = [
  {
    header: 'Name',
    cell: ({ name, id }) => (
      <Link href={`/event-details/${id}`}>{name}</Link>
    ),
    sortingField: 'name',
    minWidth: 175,
  },
  {
    header: 'Additional Notes',
    cell: ({ additional_notes }) => additional_notes || '-',
    sortingField: 'additional_notes',
    minWidth: 200,
  },
  {
    header: 'Start Time',
    cell: ({ event_starts_ts }) => new Date(event_starts_ts).toLocaleString(),
    sortingField: 'event_starts_ts',
    minWidth: 175,
  },
  {
    header: 'End Time',
    cell: ({ event_ends_ts }) => new Date(event_ends_ts).toLocaleString(),
    sortingField: 'event_ends_ts',
    minWidth: 175,
  },
  {
    header: 'Status',
    cell: ({ event_status }) => {
      if (event_status === 'registered' || event_status === 'scheduled') {
        return <Badge color="blue">Scheduled</Badge>;
      }
      else if (event_status === 'deploy' || event_status === 'scaled' || event_status === 'destroy') {
        return <Badge color="red">LIVE</Badge>;
      }
      else if (event_status === 'ended') {
        return <Badge color="grey">Ended</Badge>;
      }
      else if (event_status === 'failed') {
        return <Badge color="red">Failed</Badge>;
      }
      return <Badge color="severity-low">Unknown</Badge>;
    },
    sortingField: 'event_status',
    minWidth: 150,
  },
];


const EmptyState = ({ title, subtitle, action }: { title: string; subtitle: string; action: ReactNode }) => {
  return (
    <Box textAlign="center" color="inherit">
      <Box variant="strong" textAlign="center" color="inherit">
        {title}
      </Box>
      <Box variant="p" padding={{ bottom: 's' }} color="inherit">
        {subtitle}
      </Box>
      {action}
    </Box>
  );
};

export interface EventTableProps {
  event: Event[];
}

export default function EventTable() {

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const result = await client.graphql({
        query: listEvents,
      });
      if ('data' in result) {
        setEvents(result.data.listEvents);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    if (collectionProps.selectedItems && collectionProps.selectedItems.length > 0) {
      setSelectedEvent(collectionProps.selectedItems[0]);
      setDeleteModalVisible(true);
    }
  };

  const handleDelete = async () => {
    if (selectedEvent) {
      try {
        // Fetch the event to check its status
        const eventResult = await client.graphql({
          query: getEvent,
          variables: { id: selectedEvent.id },
        });
        let eventStatus: string;
        if ('data' in eventResult && eventResult.data.getEvent) {
          eventStatus = eventResult.data.getEvent.event_status;
        } else {
          console.error('Error fetching event details:', eventResult);
          setErrorMessage('An error occurred while fetching event details. Please try again.');
          setDeleteModalVisible(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        if (eventStatus === 'registered' || eventStatus === 'ended') {
          // Proceed with deletion
          await client.graphql({
            query: deleteEvent,
            variables: { pk: selectedEvent.id, sk: "Event" },
          });

          // Refresh the events list after deletion
          await fetchEvents();
          setDeleteModalVisible(false);
          setErrorMessage(null);
        } else {
          console.error('Cannot delete event. Status is not "registered" or "ended".');
          setErrorMessage('An error occurred while deleting the event. Please try again.');
          setDeleteModalVisible(false);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('Error deleting event:', error);
        setErrorMessage('An error occurred while deleting the event. Please try again.');
        setDeleteModalVisible(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const [preferences, setPreferences] = useState<CollectionPreferencesProps['preferences']>({ pageSize: 20 });
  const { items, filterProps, actions, filteredItemsCount, paginationProps, collectionProps } = useCollection<Event>(
    events,
    {
      filtering: {
        noMatch: (
          <EmptyState
            title="No matches"
            subtitle="We can’t find a match."
            action={<Button onClick={() => actions.setFiltering('')}>Clear filter</Button>}
          />
        ),
        empty: (
          <EmptyState title="No events" subtitle="No events to display." action={<Button>Create event</Button>} />
        ),
      },
      pagination: { pageSize: preferences?.pageSize },
      sorting: { defaultState: { sortingColumn: columnDefinitions[0] } },
      selection: {},
    },
  );

  return (
    <>

      {errorMessage && (<>
        <Alert type="error" dismissible onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert><br></br></>
      )}
      <Table<Event>
        {...collectionProps}
        enableKeyboardNavigation={false}
        items={items}
        columnDefinitions={columnDefinitions}
        loading={loading}
        loadingText='Loading events...'
        stickyHeader={true}
        resizableColumns={true}
        variant="full-page"
        selectionType="single"
        ariaLabels={{
          selectionGroupLabel: 'Items selection',
          itemSelectionLabel: ({ selectedItems }, item) => {
            const isItemSelected = selectedItems.filter((i) => i.name === item.name).length;
            return `${item.name} is ${isItemSelected ? '' : 'not '}selected`;
          },
          tableLabel: 'Events table',
        }}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={getHeaderCounterText(events, collectionProps.selectedItems)}
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button
                  disabled={collectionProps.selectedItems?.length === 0}
                  onClick={handleDeleteClick}
                  iconName='remove'
                >
                  Delete
                </Button>
                <Button iconName="calendar" href="/create-event" variant="primary">
                  Create event
                </Button>
              </SpaceBetween>
            }
          >
            Events list 🔍
          </Header>
        }
        empty={
          <EmptyState
            title="No events"
            subtitle="No events to display."
            action={<Button href="/create-event/">Create event</Button>}
          />
        }
        pagination={<Pagination {...paginationProps} />}
        filter={
          <TextFilter
            {...filterProps}

            filteringPlaceholder="Find events"
            countText={getFilterCounterText(filteredItemsCount)}
          />
        }
        preferences={
          <CollectionPreferences
            preferences={preferences}
            pageSizePreference={{
              title: 'Select page size',
              options: [
                { value: 10, label: '10 events' },
                { value: 20, label: '20 events' },
                { value: 50, label: '50 events' },
                { value: 100, label: '100 events' },
              ],
            }}
            onConfirm={({ detail }) => setPreferences(detail)}
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
          />
        }
      />
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
        {selectedEvent && (
          <p>Are you sure you want to delete {selectedEvent.name}?</p>
        )}
      </Modal>
    </>
  );
}
