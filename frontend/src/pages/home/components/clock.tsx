import React, { useState, useEffect } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Box from '@cloudscape-design/components/box';

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatLocalTime = (date: Date) => {
    return date.toLocaleString(undefined, {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true
    });
  };

  const formatUTCTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
      timeZone: 'UTC'
    });
  };

  return (
    <Container header={<Header variant="h2">Current time ⏰</Header>} >
      <Box
        color="inherit"
        textAlign="center"
        padding="s"
      >
        <div style={{ fontSize: '2.2em', fontWeight: 'bold' }}>
          {formatLocalTime(time)}
        </div>
        <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: '2px' }}>
          {formatUTCTime(time)} UTC
        </div>
      </Box>
    </Container>
  );
}