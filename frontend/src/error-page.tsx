import React from 'react';
import { useRouteError } from 'react-router-dom';

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

const ErrorPage: React.FC = () => {
  const error = useRouteError();

  if (isError(error)) {
    return (
      <div>
        <h1>Oops!</h1>
        <p>An unexpected error has occurred.</p>
        <p>
          <i>{error.message}</i>
        </p>
      </div>
    );
  } else {
    // Handle other cases (e.g., non-Error objects)
    return <div>An unknown error occurred.</div>;
  }
};


export default ErrorPage;