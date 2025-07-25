// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import BreadcrumbGroup, { BreadcrumbGroupProps } from '@cloudscape-design/components/breadcrumb-group';

const items: BreadcrumbGroupProps.Item[] = [{ text: 'Event Scheduler', href: '/home/' }];

export interface BreadcrumbsProps {
  active: BreadcrumbGroupProps.Item;
}

export default function Breadcrumbs({ active }: BreadcrumbsProps) {
  return <BreadcrumbGroup items={[...items, active]} />;
}
