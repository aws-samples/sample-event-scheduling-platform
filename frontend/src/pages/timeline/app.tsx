// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React, { useEffect, useState } from 'react';
import HelpPanel from '@cloudscape-design/components/help-panel';

import Breadcrumbs from '../../components/breadcrumbs';
import Navigation from '../../components/navigation';
import Shell from '../../layouts/shell';
import { fetchUserAttributes } from 'aws-amplify/auth';

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
      contentType="table"
      breadcrumbs={<Breadcrumbs active={{ text: 'Event Timeline', href: '/timeline/' }} />}
      navigation={<Navigation />}
      tools={<HelpPanel header={<h2>Help panel</h2>}></HelpPanel>}
      username={userInfo.username}
      email={userInfo.email}
    >
    </Shell>
  );
}
