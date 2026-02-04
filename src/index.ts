/**
 * SMPP v5.0 Client Library
 * Modern TypeScript implementation with auto-reconnect, queue management, and TLS support
 */

// Core Client
export { SMPPClient } from "./lib/client.js";

// High-Level SMS Manager
export { SMSManager } from "./lib/sms-manager.js";

// Queue Management
export { SMSQueue, MessageQueue, RateLimiter } from "./lib/queue.js";
export type {
  QueuedSMS,
  SMSMessage,
  QueuedMessage,
  QueueStats,
} from "./lib/queue.js";

// PDU Encoding/Decoding
export { PDUEncoder, PDUDecoder } from "./lib/pdu.js";

// Types
export type {
  SMPPConfig,
  TLSOptions,
  BindParams,
  SubmitSMParams,
  DeliverSMParams,
  QuerySMParams,
  QuerySMResp,
  CancelSMParams,
  ReplaceSMParams,
  SubmitMultiParams,
  SubmitMultiResp,
  DataSMParams,
  DataSMResp,
  AlertNotificationParams,
  OutbindParams,
  BroadcastSMParams,
  BroadcastSMResp,
  QueryBroadcastSMParams,
  QueryBroadcastSMResp,
  CancelBroadcastSMParams,
  PDU,
  Logger,
  TLV,
  ESMClassValue,
} from "./lib/types.js";

// Enums and Constants
export {
  CommandId,
  CommandStatus,
  TON,
  NPI,
  ESMClass,
  DataCoding,
  SessionState,
  TLVTag,
} from "./lib/types.js";

// SMS Manager Types
export type {
  SMSParams,
  ReceivedSMS,
  DeliveryReceipt,
  SMSManagerConfig,
} from "./lib/sms-manager.js";
