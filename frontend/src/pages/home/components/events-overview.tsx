// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';

export interface ProductionOverviewProps {
  metrics: { key: string; value: string }[];
}

// production-overview.tsx
export default function ProductionOverview({ metrics }: ProductionOverviewProps) {
  return (
    <Container header={<Header variant="h2">Events overview 🧑🏽‍💻</Header>}>
      <ColumnLayout columns={3} variant="text-grid">
        {metrics.map(({ key, value }) => (
          <Box key={key} padding="xs">
            <Box color="text-label" fontSize="heading-s">
              {key}
            </Box>
            <Box fontSize="heading-xl">{value}</Box>
          </Box>
        ))}
      </ColumnLayout>
    </Container>
  );
}