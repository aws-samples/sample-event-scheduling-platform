import React from 'react';
import Header from '@cloudscape-design/components/header';
import Table, { TableProps } from '@cloudscape-design/components/table';
import { Badge, Box } from '@cloudscape-design/components';
import Link from '@cloudscape-design/components/link';

export interface VariationsProps {
  items: TableProps['items'];
}

// events.tsx
const columnDefinitions: TableProps['columnDefinitions'] = [
  {
    header: 'Name',
    cell: ({ name, id }) => <Link href={`/event-details/${id}`}>{name}</Link>
  },
  {
    header: 'Status',
    cell: (item) => {
      if (item.status.message.toLowerCase() === 'registered') {
        return <Badge color="blue">Scheduled</Badge>;
      }
      if (item.status.message.toLowerCase() === 'scheduled') {
        return <Badge color="blue">Waiting</Badge>;
      }
      else if (item.status.message.toLowerCase() === 'scaled') {
        return <Badge color="red">LIVE</Badge>;
      }
      else if (item.status.message.toLowerCase() === 'ended') {
        return <Badge color="grey">Ended</Badge>;
      }
      else if (item.status.message.toLowerCase() === 'deploy') {
        return <Badge color="red">LIVE</Badge>;
      }
      else if (item.status.message.toLowerCase() === 'destroy') {
        return <Badge color="red">LIVE</Badge>;
      }
      else if (item.status.message.toLowerCase() === 'failed') {
        return <Badge color="red">Failed</Badge>;
      }
      return <Badge color="severity-low">Unknown</Badge>;
    },
  },
  { header: 'Start time', cell: ({ mixing }) => mixing },
  { header: 'End time', cell: ({ molding }) => molding },
];

export interface VariationsProps {
  items: TableProps['items'];
}

export default function Events({ items }: VariationsProps) {
  return (
    <Table
      enableKeyboardNavigation={true}
      header={<Header variant="h2">Next events 📌</Header>}
      items={items}
      columnDefinitions={columnDefinitions}
      loading={items.length === 0}
      loadingText="Loading events..."
      empty={
              <Box textAlign="center" color="inherit">
                <b>No events</b>
                <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                  There are no events at the moment.
                </Box>
              </Box>
            }
      ariaLabels={{
        tableLabel: 'Details table',
      }}
      footer={
        <Box textAlign="center">
          <Link href="/event-list">See more</Link>
        </Box>
      }
    />
  );
}