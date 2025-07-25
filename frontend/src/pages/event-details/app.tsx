// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import HelpPanel from '@cloudscape-design/components/help-panel';

import Navigation from '../../components/navigation';
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Shell from '../../layouts/shell';
import EventDetails from './components';
import { useParams } from 'react-router-dom';
import { Icon } from '@cloudscape-design/components';

export default function App() {
  const { id } = useParams();
  return (
    <Shell
      navigation={<Navigation />}
      tools={
        <HelpPanel header={<h2>Help panel</h2>}>
          <h3>Event Details</h3>
          <p>
            This page displays detailed information about a specific event. You can view and manage various aspects of the event here.
          </p>

          <h3>Key features</h3>
          <ul>
            <li>
              <Icon name="status-positive" /> <strong>Timeline:</strong> Shows the current status of your event.
            </li>
            <li>
              <Icon name="status-info" /> <strong>Event Details:</strong> Displays crucial information like Event ID, Start Time, and End Time.
            </li>
            <li>
              <Icon name="settings" /> <strong>Parameters:</strong> Lists all parameters associated with the event.
            </li>
          </ul>

          <h3>Actions</h3>
          <p>
            <Icon name="remove" /> <strong>Delete:</strong> Removes the event. This action is irreversible.
          </p>
          <p>
            <Icon name="edit" /> <strong>Edit:</strong> Modify the event.
          </p>

          <h3>Tips</h3>
          <ul>
            <li>The event status is automatically updated in real-time.</li>
            <li>You can only delete events that have not started.</li>
          </ul>
        </HelpPanel>
      }
    >
      <BreadcrumbGroup
        items={[
          { text: "Event Scheduler", href: '/home/' },
          { text: "Event List", href: '/event-list/' },
          {
            text: "Event Details",
            href: "#components/breadcrumb-group"
          }
        ]}
        ariaLabel="Breadcrumbs"
      />
      <EventDetails eventId={id} />
    </Shell>
  );
}
