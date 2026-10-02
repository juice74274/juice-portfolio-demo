// Stable mapping identity and the mock snapshot's editable-row boundary.
import type { BrokerKey, ClassificationScope, Position } from './types';

// Demo assignments use a stable group ID or the explicit ungrouped choice.
export type ClassificationCategoryKey = string;
export const classificationKey = (brokerKey: string, symbol: string) => `${brokerKey}\u0000${symbol}`;
export const positionClassificationKey = (position: Position) =>
  position.broker_key ? classificationKey(position.broker_key, position.symbol) : null;
export const isEditable = (position: Position): position is Position & { broker_key: ClassificationScope } =>
  typeof position.broker_key === 'string' && position.broker_key.length > 0;

// The normalized snapshot type retains these status keys; the demo reports no broker status.
export const BROKER_KEYS: readonly BrokerKey[] = ['moomoo', 'tiger', 'webull', 'usmart'];
export const isBrokerKey = (value: unknown): value is BrokerKey =>
  typeof value === 'string' && (BROKER_KEYS as readonly string[]).includes(value);
