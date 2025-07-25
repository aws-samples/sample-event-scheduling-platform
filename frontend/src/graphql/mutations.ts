import gql from 'graphql-tag';

export const createEvent = gql`
  mutation CreateEvent(
    $name: String!,
    $additional_notes: String,
    $event_starts_ts: String!,
    $event_ends_ts: String!,
    $orchestration_type: String!,
    $document_name: String!,
    $version_id: String,
    $provisioning_parameters: [ProvisioningParameterInput]
  ) {
    putEvent(
      name: $name,
      additional_notes: $additional_notes,
      event_starts_ts: $event_starts_ts,
      event_ends_ts: $event_ends_ts,
      orchestration_type: $orchestration_type,
      document_name: $document_name,
      version_id: $version_id,
      event_status: "registered",
      provisioning_parameters: $provisioning_parameters
    ) {
      id
      name
      additional_notes
      event_starts_ts
      event_ends_ts
      orchestration_type
      document_name
      version_id
      event_status
      provisioning_parameters {
        ParameterKey
        ParameterType
        DefaultValue
        Description
        IsNoEcho
      }
    }
  }
`;


export const deleteEvent = gql`
  mutation DeleteEvent($pk: String!, $sk: String!) {
    deleteEvent(pk: $pk, sk: $sk) {
      id
      name
    }
  }
`;