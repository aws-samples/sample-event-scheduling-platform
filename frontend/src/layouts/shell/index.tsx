// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from 'react';
import AppLayout, { AppLayoutProps } from '@cloudscape-design/components/app-layout';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { signOut } from 'aws-amplify/auth';
import './styles.css';

export interface ShellProps {
  breadcrumbs?: AppLayoutProps['breadcrumbs'];
  contentType?: Extract<AppLayoutProps.ContentType, 'default' | 'table' | 'form'>;
  tools?: AppLayoutProps['tools'];
  children?: AppLayoutProps['content'];
  navigation?: AppLayoutProps['navigation'];
  notifications?: AppLayoutProps['notifications'];
  username?: string;
  email?: string;
}

export default function Shell({
  children,
  contentType,
  breadcrumbs,
  tools,
  navigation,
  notifications,
  email,
  username = email,
}: ShellProps) {
  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/home';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  return (
    <>
      <div id="top-nav">
        <TopNavigation
          identity={{
            title: 'Event Scheduler',
            href: '/home',
            logo: {
              src: '/../AWS_logo_RGB_REV.png',
              alt: 'AWS Logo',
            },
          }}
          i18nStrings={{
            overflowMenuTriggerText: 'More',
            overflowMenuTitleText: 'All',
          }}
          utilities={[
            {
              type: "button",
              text: "Support",
              href: "https://support.console.aws.amazon.com/support/home/",
              external: true,
              externalIconAriaLabel: " (opens in a new tab)"
            },
            {
              type: "button",
              iconName: "notification",
              title: "Notifications",
              ariaLabel: "Notifications (unread)",
              badge: true,
              disableUtilityCollapse: false
            },
            {
              type: "menu-dropdown",
              text: username,
              iconName: "user-profile",
              onItemClick: (e) => {
                if (e.detail.id === "signout") {
                  handleSignOut();
                }
              },
              items: [
                {
                  id: "support-group",
                  text: "Support",
                  items: [
                    {
                      id: "documentation",
                      text: "Documentation",
                      href: "https://gitlab.aws.dev/aws-fr-media/aws-event-orchestrator/-/blob/main/README.md",
                      external: true,
                      externalIconAriaLabel:
                        " (opens in new tab)"
                    },
                    {
                      id: "support", text: "Support", href: "https://support.console.aws.amazon.com/support/home/", externalIconAriaLabel:
                        " (opens in new tab)", external: true,
                    },
                    {
                      id: "feedback",
                      text: "Feedback",
                      href: "#",
                      external: true,
                      externalIconAriaLabel:
                        " (opens in new tab)"
                    }
                  ]
                },
                {
                  id: "signout",
                  text: "Sign out",
                }
              ]
            }
          ]}


        />
      </div>
      <AppLayout
        contentType={contentType}
        navigation={navigation}
        breadcrumbs={breadcrumbs}
        notifications={notifications}
        stickyNotifications={true}
        tools={tools}
        content={children}
        headerSelector="#top-nav"
        ariaLabels={{
          navigation: 'Navigation drawer',
          navigationClose: 'Close navigation drawer',
          navigationToggle: 'Open navigation drawer',
          notifications: 'Notifications',
          tools: 'Help panel',
          toolsClose: 'Close help panel',
          toolsToggle: 'Open help panel',
        }}
      />
    </>
  );
}
