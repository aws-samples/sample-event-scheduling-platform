// components/CreateEventButton.tsx
import React from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import { useNavigate } from 'react-router-dom';
import SpaceBetween from '@cloudscape-design/components/space-between';

export default function CreateEventButton() {
  const navigate = useNavigate();

  return (
    <Container header={<Header variant="h2">Create Event 📅</Header>}>
      <SpaceBetween size="m">
        <Box
          fontSize="display-l"
          color="inherit"
          textAlign="center"
          padding="xs"
        >
          <Button
            fullWidth
            onClick={() => navigate('/create-event')}
            iconName='calendar'
          >
            Create Event
          </Button>
        </Box>
      </SpaceBetween>
    </Container>
  );
}