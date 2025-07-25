import React from 'react';
import ReactDOM from 'react-dom/client';
import '@cloudscape-design/global-styles/index.css';
import '@aws-amplify/ui-react/styles.css';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import ErrorPage from './error-page';
import AppHome from './pages/home/app';
import AppEventList from './pages/event-list/app';
import AppCreateEvent from './pages/create-event/app';
import AppTimeline from './pages/timeline/app';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import awsmobile from './aws-exports';
import AppEventDetails from './pages/event-details/app';

Amplify.configure(awsmobile);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppHome />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/home",
    element: <AppHome />,
  },
  {
    path: "/event-list",
    element: <AppEventList />,
  },
  {
    path: "/timeline",
    element: <AppTimeline />,
  },
  {
    path: "/create-event",
    element: <AppCreateEvent />,
  },
  {
    path: "/event-details/:id",
    element: <AppEventDetails />,
  },
]);

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Authenticator>
        <RouterProvider router={router} />
      </Authenticator>
    </React.StrictMode>
  );
} else {
  console.error("Failed to find the root element");
}
