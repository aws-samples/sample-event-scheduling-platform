import React, { useEffect, useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import HelpPanel from '@cloudscape-design/components/help-panel';

import Navigation from '../../components/navigation';
import Breadcrumbs from '../../components/breadcrumbs';
import Shell from '../../layouts/shell';

import ProductionOverview from './components/events-overview';
import Events from './components/events';

import { listEvents } from '../../../src/graphql/queries';
import { generateClient } from 'aws-amplify/api';
import Clock from './components/clock';
import CreateEventButton from './components/create-event-button';
import HomeBarChart from './components/barchart';
import LiveEvents from './components/live-events';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { Icon } from '@cloudscape-design/components';

interface Event {
  id: string;
  name: string;
  additional_notes?: string;
  event_starts_ts: string;
  event_ends_ts: string;
  event_status: string;
  orchestration_type: string;
  document_name: string;
  created: string;
  updated: string;
}

interface UserInfo {
  username?: string;
  email?: string;
}

const client = generateClient({
  authMode: 'userPool',
});

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo>({});

  const calculateEventMetrics = (events: Event[]) => {
    const now = new Date().getTime();

    const metrics = events.reduce((acc, event) => {
      const startTime = new Date(event.event_starts_ts).getTime();
      const endTime = new Date(event.event_ends_ts).getTime();

      if (event.event_status === 'ended') {
        acc.past += 1;
      } else if (event.event_status === 'failed') {
        acc.failed += 1;
      } else if (now >= startTime && now <= endTime) {
        acc.active += 1;
      } else if (startTime > now) {
        acc.future += 1;
      }

      return acc;
    }, { past: 0, active: 0, future: 0, failed: 0 });

    return [
      { key: 'Past Events', value: metrics.past.toString() },
      { key: 'Active Events', value: metrics.active.toString() },
      { key: 'Future Events', value: metrics.future.toString() }
    ];
  };

  const fetchUserInfo = async () => {
    try {
      const attributes = await fetchUserAttributes();
      setUserInfo({
        username: attributes.preferred_username || attributes.name,
        email: attributes.email
      });
    } catch (error) {
      console.error('Error fetching user attributes:', error);
    }
  };

  const formatEventsForTable = (events: Event[]) => {
    return events
      .filter(event => 
        event.event_status.toLowerCase() === 'registered' || 
        event.event_status.toLowerCase() === 'scheduled'
      )
      .sort((a, b) => new Date(b.event_starts_ts).getTime() - new Date(a.event_starts_ts).getTime())
      .slice(0, 4)
      .map(event => ({
        id: event.id,
        name: event.name,
        status: {
          type: event.event_status.toLowerCase(),
          message: event.event_status.charAt(0).toUpperCase() + event.event_status.slice(1).toLowerCase()
        },
        mixing: new Date(event.event_starts_ts).toLocaleString(),
        molding: new Date(event.event_ends_ts).toLocaleString()
      }));
  };

  useEffect(() => {
    fetchEvents();
    fetchUserInfo();
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

  return (
    <Shell
      breadcrumbs={<Breadcrumbs active={{ text: 'Dashboard', href: '/home' }} />}
      navigation={<Navigation />}
      tools={  <HelpPanel header={<h2>Help Panel</h2>}>
      <h3>Welcome to AWS Event Scheduler</h3> 
      <p> 
        The AWS Event Scheduler is a powerful solution designed to manage and automate event-driven workflows in AWS environments. It is tailored for companies in Media, Retail, and Entertainment sectors that need to streamline infrastructure scaling for events with high traffic spikes during specific timeframes. Our platform provides the tools you need to efficiently handle complex, time-sensitive operations. 
      </p>
  
      <h3>Key Features</h3>
      <ul>
        <li>
          <Icon name="multiscreen" /> <strong>Dashboard Overview:</strong> Get a quick snapshot of your past, active, and future events.
        </li>
        <li>
          <Icon name="add-plus" /> <strong>Create Events:</strong> Easily set up new events with customizable parameters.
        </li>
        <li>
          <Icon name="status-info" /> <strong>Live Event Monitoring:</strong> Keep track of currently active events in real-time.
        </li>
        <li>
          <Icon name="calendar" /> <strong>Upcoming Events:</strong> View and manage your scheduled events at a glance.
        </li>
      </ul>
  
      <h3>Dashboard Sections</h3>
      <ul>
        <li><strong>Events Overview:</strong> Displays metrics for past, active, and future events.</li>
        <li><strong>Current Time:</strong> Shows the current time to help with event scheduling.</li>
        <li><strong>Create Event:</strong> Quick access to create a new event.</li>
        <li><strong>Live Events:</strong> Lists all events currently in progress.</li>
        <li><strong>Next Events:</strong> Shows upcoming events sorted by start time.</li>
        <li><strong>Event Distribution:</strong> Visual representation of your event schedule.</li>
      </ul>
  
      <h3>Tips</h3>
      <ul>
        <li>Use the Create Event button to quickly set up new events.</li>
        <li>Monitor Live Events to ensure smooth operation of current activities.</li>
        <li>Plan ahead by reviewing your Next Events and Event Distribution.</li>
      </ul>
  
    </HelpPanel>}
      username={userInfo.username}
      email={userInfo.email}
    >
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>}>
            Dashboard
          </Header>
        }
      >
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 8 } },    // Events overview (larger)
            { colspan: { default: 4, xxs: 4 } },    // Clock (smaller)
            { colspan: { default: 4, xxs: 4 } },    // Create Event button
            { colspan: { default: 8, xxs: 8 } },   // Live Events (full width)
            { colspan: { default: 8, xxs: 8 } },    // Next events table
            { colspan: { default: 4, xxs: 4 } }    // Bar chart
          ]}
          disableGutters={false}
        >
          <ProductionOverview metrics={calculateEventMetrics(events)} />
          <Clock />
          <CreateEventButton />
          <LiveEvents events={events} />
          <Events items={loading ? [] : formatEventsForTable(events)} />
          <HomeBarChart events={events} />
        </Grid>
      </ContentLayout>
    </Shell>
  );
}