import gql from 'graphql-tag';

export const listEvents = gql`
  query ListEvents {
    listEvents {
      id
      name
      additional_notes
      event_starts_ts
      event_ends_ts
      event_status
      orchestration_type
      document_name
      created
      updated
    }
  }
`;

export const getEvent = gql`
  query GetEvent($id: String!) {
    getEvent(id: $id) {
      id
      name
      additional_notes
      event_starts_ts
      event_ends_ts
      event_status
      orchestration_type
      document_name
      created
      updated
      outputs
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

export const ListSSMDocuments = gql`
  query ListSSMDocuments {
    listSSMDocuments
  }
`;

export const ListScProduct = gql`
  query ListScProduct {
    ListScProduct {
      id
      Name
      ShortDescription
      Distributor
      SupportDescription
      SupportEmail
      SupportUrl
    }
  }
`;

export const getProvisioningParameters = gql`
  query GetProvisioningParameters($productId: String!, $provisioningArtifactId: String) {
    getProvisioningParameters(productId: $productId, provisioningArtifactId: $provisioningArtifactId) {
      ParameterKey
      ParameterType
      DefaultValue
      Description
      IsNoEcho
    }
  }
`;

export const listProvisioningArtifacts = gql`
  query ListProvisioningArtifacts($productId: String!) {
    listProvisioningArtifacts(productId: $productId) {
      Id
      Name
      Description
      CreatedTime
      Active
    }
  }
`;

export const getSSMDocumentParameters = gql`
  query GetSSMDocumentParameters($documentName: String!, $documentVersion: String) {
    getSSMDocumentParameters(documentName: $documentName, documentVersion: $documentVersion) {
      Name
      Type
      Description
      DefaultValue
    }
  }
`;

export const getSSMDocumentVersions = gql`
  query GetSSMDocumentVersions($documentName: String!) {
    getSSMDocumentVersions(documentName: $documentName) {
      Name
      DocumentVersion
      CreatedDate
      IsDefaultVersion
    }
  }
`;
