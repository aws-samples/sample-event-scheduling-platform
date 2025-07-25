import React, { useEffect, useState } from 'react';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import SpaceBetween from '@cloudscape-design/components/space-between';

import Breadcrumbs from '../../components/breadcrumbs';
import EventForm from './components/form';
import Navigation from '../../components/navigation';
import ShellLayout from '../../layouts/shell';
import { BasicValidationContext, useBasicValidation } from './validation/basic-validation';
import { ContentLayout, Icon } from '@cloudscape-design/components';
import { fetchUserAttributes } from 'aws-amplify/auth';

interface UserInfo {
  username?: string;
  email?: string;
}

export default function App() {

  const { isFormSubmitted, setIsFormSubmitted, addErrorField, focusFirstErrorField } = useBasicValidation();
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
    <ShellLayout
      breadcrumbs={<Breadcrumbs active={{ text: 'Create event', href: '/create-event/' }} />}
      navigation={<Navigation />}
      tools={<HelpPanel header={<h2>Help panel</h2>}>
      <h3>Create Event</h3>
      <p>
        This page allows you to create a new event by specifying required parameters. Fill in the form to schedule and configure your event.
      </p>
  
      <h3>Key features</h3>
      <ul>
        <li>
          <Icon name="search" /> <strong>Event Details:</strong> Set basic information like event name and description.
        </li>
        <li>
          <Icon name="send" /> <strong>Scheduling:</strong> Specify start and end times for your event. The start time is the time at which the provisioning/scaling will start.
        </li>
        <li>
          <Icon name="settings" /> <strong>Configuration:</strong> Choose orchestration type and set up event parameters.
        </li>
      </ul>
  
      <h3>Form Sections</h3>
      <ul>
        <li>
          <Icon name="file" /> <strong>Basic Information:</strong> Enter event name and optional description.
        </li>
        <li>
          <Icon name="calendar" /> <strong>Date and Time:</strong> Set the start and end dates/times for your event.
        </li>
        <li>
          <Icon name="caret-down" /> <strong>Orchestration:</strong> Event Scheduler supports scaling (with Service System Manager Document) and provisioning (of Service Catalog Product).
        </li>
        <li>
          <Icon name="settings" /> <strong>Parameters:</strong> Add required parameters for scaling/provisioning your infrastructure.
        </li>
      </ul>
  
      <h3>Tips</h3>
      <ul>
        <li>All fields marked with an asterisk (*) are required.</li>
        <li>Double-check all parameters before submitting to avoid errors.</li>
      </ul>
    </HelpPanel>}
      username={userInfo.username}
      email={userInfo.email}
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            description="Create a new event by specifying required parameters."
          >
            Create event 📅
          </Header>
        }
      >
        <SpaceBetween size="m">
          <BasicValidationContext.Provider value={{ isFormSubmitted: isFormSubmitted, addErrorField: addErrorField }}>
            <form
              onSubmit={(event) => {
                setIsFormSubmitted(true);
                focusFirstErrorField();
                event.preventDefault();
              }}
            >
              <SpaceBetween size="l">
                <EventForm />
              </SpaceBetween>
            </form>
          </BasicValidationContext.Provider>
        </SpaceBetween>
      </ContentLayout>
    </ShellLayout>
  );
}
