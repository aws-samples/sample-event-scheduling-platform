// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import { Outlet } from 'react-router-dom';
import SideNavigation, { SideNavigationProps } from '@cloudscape-design/components/side-navigation';


const items: SideNavigationProps['items'] = [
  { type: 'link', text: 'Home', href: '/home' },
  { type: 'link', text: 'Event List', href: '/event-list' },
  { type: 'link', text: 'Create Event', href: '/create-event' },
  { type: "divider" }
];

export default function Navigation() {
  return (
    <>
      <SideNavigation
        activeHref={location.pathname}
        header={{
          href: '/home',
          text: `Dashboard`,
          logo: { alt: "logo", src: "../../schedulerLogo.png" }
        }}
        items={items}
      />
      <div id="detail">
        <Outlet />
      </div>
    </>
  );
}
