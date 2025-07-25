// components/live-events.tsx
import React from 'react';
import Header from '@cloudscape-design/components/header';
import Table from '@cloudscape-design/components/table';
import { Badge, Box } from '@cloudscape-design/components';
import Link from '@cloudscape-design/components/link';

interface LiveEvent {
  id: string;
  name: string;
  event_starts_ts: string;
  event_ends_ts: string;
  event_status: string;
}

interface LiveEventsProps {
  events: LiveEvent[];
}

export default function LiveEvents({ events }: LiveEventsProps) {

  const liveEvents = events.filter(event =>
    event.event_status === 'deploy' || event.event_status === 'scaled' || event.event_status === 'destroy'
  );

  const columnDefinitions = [
    {
      id: 'name',
      header: 'Event Name',
      cell: (item: LiveEvent) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link href={`/event-details/${item.id}`}>
            {item.name}
          </Link>
          <span style={{ marginLeft: '8px' }}>
            <Badge color="red">LIVE</Badge>
          </span>
        </div>
      ),
      minWidth: 175,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (item: LiveEvent) => item.event_status,
    },
    {
      id: 'startTime',
      header: 'Start Time',
      cell: (item: LiveEvent) => new Date(item.event_starts_ts).toLocaleString(),
    },
    {
      id: 'endTime',
      header: 'End Time',
      cell: (item: LiveEvent) => new Date(item.event_ends_ts).toLocaleString(),
    },
  ];

  return (
    <Table
      columnDefinitions={columnDefinitions}
      header={<Header variant="h2">Live Events 🔴</Header>}
      items={liveEvents}
      loading={liveEvents.length === 0}
      loadingText="Loading live events..."
      empty={
        <Box textAlign="center" color="inherit">
          <b>No live events</b>
          <Box padding={{ bottom: 's' }} variant="p" color="inherit">
            There are no live events at the moment.
          </Box>
        </Box>
      }
      footer={
        <Box textAlign="center">
          <Link href="/event-list">See more</Link>
        </Box>
      }
      variant="container"
    />
  );
}