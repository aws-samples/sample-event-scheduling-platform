import gql from 'graphql-tag';

export const updateEventSub = gql`
  subscription OnUpdateEvent {
    onUpdateEvent {
      id
      name
      additional_notes
      event_starts_ts
      event_ends_ts
      orchestration_type
      document_name
      event_status
      created
      updated
      outputs
    }
  }
`;