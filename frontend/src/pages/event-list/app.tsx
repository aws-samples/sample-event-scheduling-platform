import React, { useState, useEffect } from 'react';
import HelpPanel from '@cloudscape-design/components/help-panel';

import Breadcrumbs from '../../components/breadcrumbs';
import Navigation from '../../components/navigation';
import Shell from '../../layouts/shell';
import EventTable from './components/events-table';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { Icon } from '@cloudscape-design/components';

interface UserInfo {
  username?: string;
  email?: string;
}

export default function App() {
  const [userInfo, setUserInfo] = useState<UserInfo>({});

  useEffect(() => {
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

    fetchUserInfo();
  }, []);

  return (
    <Shell
      breadcrumbs={<Breadcrumbs active={{ text: 'Dashboard', href: '/home' }} />}
      navigation={<Navigation />}
      tools={ <HelpPanel header={<h2>Help Panel</h2>}>
      <h3>Event list</h3>
      <p>
        This page displays a list of all events in the Event Scheduler. You can view, search, and manage your events from here.
      </p>
  
      <h3>Key features</h3>
      <ul>
        <li>
          <Icon name="search" /> <strong>Search:</strong> Quickly find events by ID or name.
        </li>
        <li>
          <Icon name="file-open" /> <strong>View Details:</strong> Click on an event to see its full details.
        </li>
        <li>
          <Icon name="status-info" /> <strong>Event Status:</strong> See the current status of each event at a glance.
        </li>
      </ul>
  
      <h3>Tips</h3>
      <ul>
        <li>Use the search bar to quickly find specific events.</li>
        <li>Click on an event row to view its detailed information.</li>
        <li>The status column provides a quick overview of each events current state.</li>
      </ul>
  
    </HelpPanel>}
      username={userInfo.username}
      email={userInfo.email}
    >
      <EventTable />
    </Shell>
  );
}