import React from 'react';
import Flashbar, { FlashbarProps } from "@cloudscape-design/components/flashbar";
import SpaceBetween from '@cloudscape-design/components/space-between';

interface FlashbarComponentProps {
  items: FlashbarProps.MessageDefinition[];
}

const FlashbarComponent: React.FC<FlashbarComponentProps> = ({ items }) => {
  return (
    <SpaceBetween size="l">
      {items.length > 0 && <Flashbar items={items} />}
    </SpaceBetween>
  );
};

export default FlashbarComponent;
