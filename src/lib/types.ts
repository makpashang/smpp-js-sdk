/**
 * SMPP v5.0 Types and Constants
 * Mission-critical implementation with full protocol support
 */

// Command IDs as per SMPP v5 specification
export enum CommandId {
  GENERIC_NACK = 0x80000000,
  BIND_RECEIVER = 0x00000001,
  BIND_RECEIVER_RESP = 0x80000001,
  BIND_TRANSMITTER = 0x00000002,
  BIND_TRANSMITTER_RESP = 0x80000002,
  QUERY_SM = 0x00000003,
  QUERY_SM_RESP = 0x80000003,
  SUBMIT_SM = 0x00000004,
  SUBMIT_SM_RESP = 0x80000004,
  DELIVER_SM = 0x00000005,
  DELIVER_SM_RESP = 0x80000005,
  UNBIND = 0x00000006,
  UNBIND_RESP = 0x80000006,
  REPLACE_SM = 0x00000007,
  REPLACE_SM_RESP = 0x80000007,
  CANCEL_SM = 0x00000008,
  CANCEL_SM_RESP = 0x80000008,
  BIND_TRANSCEIVER = 0x00000009,
  BIND_TRANSCEIVER_RESP = 0x80000009,
  OUTBIND = 0x0000000b,
  ENQUIRE_LINK = 0x00000015,
  ENQUIRE_LINK_RESP = 0x80000015,
  SUBMIT_MULTI = 0x00000021,
  SUBMIT_MULTI_RESP = 0x80000021,
  ALERT_NOTIFICATION = 0x00000102,
  DATA_SM = 0x00000103,
  DATA_SM_RESP = 0x80000103,
  BROADCAST_SM = 0x00000111,
  BROADCAST_SM_RESP = 0x80000111,
  QUERY_BROADCAST_SM = 0x00000112,
  QUERY_BROADCAST_SM_RESP = 0x80000112,
  CANCEL_BROADCAST_SM = 0x00000113,
  CANCEL_BROADCAST_SM_RESP = 0x80000113,
}

// Command Status (Error Codes)
/**
 * Command Status Codes (SMPP v5 Spec Table 4-45)
 *
 * The full set of 67 standard command_status values defined by SMPP v5.0.
 * Values are exactly as assigned in Table 4-45 - note that several v3.4-era
 * codes (e.g. invalid DCS, source/dest address subunit) were re-assigned to
 * the 0x104-0x106 range in v5, and the 0x107-0x112 block is reserved for the
 * Cell Broadcast operations. Reserved gaps in the spec (e.g. 0x09, 0x10, 0x12,
 * 0x16-0x17, 0x46-0x47, 0x4A) are intentionally not declared here.
 */
export enum CommandStatus {
  // Success
  ESME_ROK = 0x00000000, // No Error

  // Protocol / bind errors (0x01-0x0F)
  ESME_RINVMSGLEN = 0x00000001, // Message Length is invalid
  ESME_RINVCMDLEN = 0x00000002, // Command Length is invalid
  ESME_RINVCMDID = 0x00000003, // Invalid Command ID
  ESME_RINVBNDSTS = 0x00000004, // Incorrect BIND Status for given command
  ESME_RALYBND = 0x00000005, // ESME Already in Bound State
  ESME_RINVPRTFLG = 0x00000006, // Invalid Priority Flag
  ESME_RINVREGDLVFLG = 0x00000007, // Invalid Registered Delivery Flag
  ESME_RSYSERR = 0x00000008, // System Error
  ESME_RINVSRCADR = 0x0000000a, // Invalid Source Address
  ESME_RINVDSTADR = 0x0000000b, // Invalid Dest Addr
  ESME_RINVMSGID = 0x0000000c, // Message ID is invalid
  ESME_RBINDFAIL = 0x0000000d, // Bind Failed
  ESME_RINVPASWD = 0x0000000e, // Invalid Password
  ESME_RINVSYSID = 0x0000000f, // Invalid System ID

  // Operation errors (0x11-0x15)
  ESME_RCANCELFAIL = 0x00000011, // Cancel SM Failed
  ESME_RREPLACEFAIL = 0x00000013, // Replace SM Failed
  ESME_RMSGQFUL = 0x00000014, // Message Queue Full
  ESME_RINVSERTYP = 0x00000015, // Invalid Service Type

  // submit_multi / address / TON / NPI errors (0x33-0x51)
  ESME_RINVNUMDESTS = 0x00000033, // Invalid number of destinations
  ESME_RINVDLNAME = 0x00000034, // Invalid Distribution List name
  ESME_RINVDESTFLAG = 0x00000040, // Destination flag is invalid (submit_multi)
  ESME_RINVSUBREP = 0x00000042, // Invalid submit with replace request
  ESME_RINVESMCLASS = 0x00000043, // Invalid esm_class field data
  ESME_RCNTSUBDL = 0x00000044, // Cannot Submit to Distribution List
  ESME_RSUBMITFAIL = 0x00000045, // submit_sm, data_sm or submit_multi failed
  ESME_RINVSRCTON = 0x00000048, // Invalid Source address TON
  ESME_RINVSRCNPI = 0x00000049, // Invalid Source address NPI
  ESME_RINVDSTTON = 0x00000050, // Invalid Destination address TON
  ESME_RINVDSTNPI = 0x00000051, // Invalid Destination address NPI

  // System type / config errors (0x53-0x55)
  ESME_RINVSYSTYP = 0x00000053, // Invalid system_type field
  ESME_RINVREPFLAG = 0x00000054, // Invalid replace_if_present flag
  ESME_RINVNUMMSGS = 0x00000055, // Invalid number of messages

  // Throttling (0x58)
  ESME_RTHROTTLED = 0x00000058, // Throttling error (ESME has exceeded allowed message limits)

  // Scheduling errors (0x61-0x63)
  ESME_RINVSCHED = 0x00000061, // Invalid Scheduled Delivery Time
  ESME_RINVEXPIRY = 0x00000062, // Invalid message validity period (Expiry time)
  ESME_RINVDFTMSGID = 0x00000063, // Predefined Message Invalid or Not Found

  // Application errors (0x64-0x67)
  ESME_RX_T_APPN = 0x00000064, // ESME Receiver Temporary App Error Code
  ESME_RX_P_APPN = 0x00000065, // ESME Receiver Permanent App Error Code
  ESME_RX_R_APPN = 0x00000066, // ESME Receiver Reject Message Error Code
  ESME_RQUERYFAIL = 0x00000067, // query_sm request failed

  // TLV errors (0xC0-0xC4)
  ESME_RINVTLVSTREAM = 0x000000c0, // Error in the optional part of the PDU Body
  ESME_RTLVNOTALLWD = 0x000000c1, // TLV not allowed
  ESME_RINVTLVLEN = 0x000000c2, // Invalid Parameter Length
  ESME_RMISSINGTLV = 0x000000c3, // Expected TLV missing
  ESME_RINVTLVVAL = 0x000000c4, // Invalid TLV Value

  // Delivery / unknown (0xFE-0xFF)
  ESME_RDELIVERYFAILURE = 0x000000fe, // Transaction Delivery Failure (data_sm/submit_sm transaction mode)
  ESME_RUNKNOWNERR = 0x000000ff, // Unknown Error

  // service_type, DCS, address-subunit errors (0x100-0x106)
  ESME_RSERTYPUNAUTH = 0x00000100, // ESME Not authorised to use specified service_type
  ESME_RPROHIBITED = 0x00000101, // ESME Prohibited from using specified operation
  ESME_RSERTYPUNAVAIL = 0x00000102, // Specified service_type is unavailable
  ESME_RSERTYPDENIED = 0x00000103, // Specified service_type is denied
  ESME_RINVDCS = 0x00000104, // Invalid Data Coding Scheme
  ESME_RINVSRCADDRSUBUNIT = 0x00000105, // Source Address Sub unit is Invalid
  ESME_RINVDSTADDRSUBUNIT = 0x00000106, // Destination Address Sub unit is Invalid

  // Cell Broadcast errors (0x107-0x112)
  ESME_RINVBCASTFREQINT = 0x00000107, // Broadcast Frequency Interval is invalid
  ESME_RINVBCASTALIAS_NAME = 0x00000108, // Broadcast Alias Name is invalid
  ESME_RINVBCASTAREAFMT = 0x00000109, // Broadcast Area Format is invalid
  ESME_RINVNUMBCAST_AREAS = 0x0000010a, // Number of Broadcast Areas is invalid
  ESME_RINVBCASTCNTTYPE = 0x0000010b, // Broadcast Content Type is invalid
  ESME_RINVBCASTMSGCLASS = 0x0000010c, // Broadcast Message Class is invalid
  ESME_RBCASTFAIL = 0x0000010d, // broadcast_sm operation failed
  ESME_RBCASTQUERYFAIL = 0x0000010e, // query_broadcast_sm operation failed
  ESME_RBCASTCANCELFAIL = 0x0000010f, // cancel_broadcast_sm operation failed
  ESME_RINVBCAST_REP = 0x00000110, // Number of Repeated Broadcasts is invalid
  ESME_RINVBCASTSRVGRP = 0x00000111, // Broadcast Service Group is invalid
  ESME_RINVBCASTCHANIND = 0x00000112, // Broadcast Channel Indicator is invalid
}

// TON (Type of Number)
export enum TON {
  UNKNOWN = 0x00,
  INTERNATIONAL = 0x01,
  NATIONAL = 0x02,
  NETWORK_SPECIFIC = 0x03,
  SUBSCRIBER_NUMBER = 0x04,
  ALPHANUMERIC = 0x05,
  ABBREVIATED = 0x06,
}

// NPI (Numbering Plan Indicator)
export enum NPI {
  UNKNOWN = 0x00,
  ISDN = 0x01,
  DATA = 0x03,
  TELEX = 0x04,
  LAND_MOBILE = 0x06,
  NATIONAL = 0x08,
  PRIVATE = 0x09,
  ERMES = 0x0a,
  INTERNET = 0x0e,
  WAP_CLIENT_ID = 0x12,
}

// ESM Class
/**
 * ESM Class - Bit mask field (SMPP v5 Spec Section 4.7.12, Table 4-48)
 *
 * 8-bit field laid out as three sub-fields (bit 7 is the MSB):
 *
 *   Bits 1-0  Messaging Mode
 *     00 (0x00) Default MC Mode (e.g. Store and Forward)
 *     01 (0x01) Datagram mode
 *     10 (0x02) Forward (i.e. Transaction) mode
 *     11 (0x03) Store and Forward mode
 *
 *   Bits 5-2  Message Type / ANSI-41 (mutually-exclusive code points, NOT OR-able sub-flags)
 *     0000      Default message type (normal message)
 *     0001 0x04 Short Message contains MC Delivery Receipt        (bit 2)
 *     1000 0x20 Short Message contains Intermediate Notification  (bit 5)
 *     0010 0x08 Short Message contains Delivery Acknowledgement   (bit 3, ANSI-41)
 *     0100 0x10 Short Message contains Manual/User Acknowledgement(bit 4, ANSI-41)
 *     0110 0x18 Short Message contains Conversation Abort         (Korean CDMA)
 *
 *   Bits 7-6  GSM Specific
 *     00        No specific features selected
 *     01 (0x40) UDH Indicator (message contains a User Data Header)
 *     10 (0x80) Set Reply Path (GSM only)
 *     11 (0xC0) Set UDHI and Reply Path (GSM only)
 *
 * The default setting of esm_class is 0x00.
 */
export const ESMClass = {
  // Messaging Mode (bits 1-0)
  MODE_DEFAULT: 0x00,           // Default MC mode (store and forward)
  MODE_DATAGRAM: 0x01,          // Datagram mode
  MODE_FORWARD: 0x02,           // Forward (i.e. Transaction) mode
  MODE_STORE_FORWARD: 0x03,     // Store and Forward mode

  // Message Type (bits 5-2) - select at most one
  MC_DELIVERY_RECEIPT: 0x04,         // Short Message contains MC Delivery Receipt
  INTERMEDIATE_NOTIFICATION: 0x20,   // Short Message contains Intermediate Notification
  DELIVERY_ACKNOWLEDGEMENT: 0x08,    // ANSI-41: Delivery Acknowledgement
  MANUAL_USER_ACKNOWLEDGEMENT: 0x10, // ANSI-41: Manual/User Acknowledgement
  CONVERSATION_ABORT: 0x18,          // Korean CDMA: Conversation Abort

  // GSM Specific (bits 7-6)
  UDH_INDICATOR: 0x40,          // User Data Header present
  REPLY_PATH: 0x80,             // Set Reply Path (GSM only)
  UDHI_AND_REPLY_PATH: 0xc0,    // Set UDHI and Reply Path (GSM only)

  // Helper to combine flags
  combine: (...flags: number[]) => flags.reduce((a, b) => a | b, 0),

  // Helper to check if an MC delivery receipt is indicated (bit 2)
  hasDeliveryReceipt: (esmClass: number) => (esmClass & 0x04) !== 0,

  // Helper to get messaging mode (bits 1-0)
  getMessagingMode: (esmClass: number) => esmClass & 0x03,

  // Helper to check if intermediate notification is indicated (bit 5)
  hasIntermediateNotification: (esmClass: number) => (esmClass & 0x20) !== 0,

  // Helper to check if a User Data Header is present (bit 6)
  hasUDHI: (esmClass: number) => (esmClass & 0x40) !== 0,
} as const;

// Type for ESM Class values
export type ESMClassValue = number;

// Legacy enum for backward compatibility
export enum ESMClassLegacy {
  DEFAULT = 0x00,
  DATAGRAM = 0x01,
  FORWARD = 0x02,
  STORE_AND_FORWARD = 0x03,
  MC_DELIVERY_RECEIPT = 0x04,
}

/**
 * Registered Delivery - Bit mask field (SMPP v5 Spec Section 4.7.21, Table 4-52)
 *
 * 8-bit field that requests delivery receipts and acknowledgements (bit 7 is the MSB):
 *
 *   Bits 1-0  MC Delivery Receipt
 *     00 (0x00) No MC Delivery Receipt requested (default)
 *     01 (0x01) MC Delivery Receipt requested on success and failure
 *     10 (0x02) MC Delivery Receipt requested on failure only
 *     11 (0x03) MC Delivery Receipt requested on success only
 *
 *   Bits 3-2  SME Originated Acknowledgement
 *     00 (0x00) No recipient SME acknowledgement requested (default)
 *     01 (0x04) SME Delivery Acknowledgement requested
 *     10 (0x08) SME Manual/User Acknowledgement requested
 *     11 (0x0C) Both Delivery and Manual/User Acknowledgement requested
 *
 *   Bit 4     Intermediate Notification
 *     0 (0x00)  Intermediate notification not requested (default)
 *     1 (0x10)  Intermediate notification requested
 *
 *   Bits 7-5  Reserved (set to 0)
 */
export const RegisteredDelivery = {
  // MC Delivery Receipt (bits 0-1)
  NO_RECEIPT: 0x00,           // 00000000 - No delivery receipt
  DELIVERY_RECEIPT: 0x01,     // 00000001 - Receipt on success and failure
  FAILURE_RECEIPT: 0x02,      // 00000010 - Receipt on failure only
  SUCCESS_RECEIPT: 0x03,      // 00000011 - Receipt on success only
  
  // SME Originated Acknowledgement (bits 2-3)
  SME_DELIVERY_ACK: 0x04,     // 00000100 - SME Delivery Acknowledgement
  SME_MANUAL_ACK: 0x08,       // 00001000 - SME Manual/User Acknowledgement
  SME_BOTH_ACK: 0x0c,         // 00001100 - Both acknowledgements
  
  // Intermediate Notification (bit 4)
  INTERMEDIATE_NOTIF: 0x10,   // 00010000 - Intermediate notification
  
  // Helper function to combine flags
  combine: (...flags: number[]) => flags.reduce((a, b) => a | b, 0),
  
  // Helper to check if delivery receipt is requested
  hasDeliveryReceipt: (regDel: number) => (regDel & 0x03) !== 0,
  
  // Helper to get delivery receipt type (0-3)
  getDeliveryReceiptType: (regDel: number) => regDel & 0x03,
  
  // Helper to check if intermediate notification is requested
  hasIntermediateNotification: (regDel: number) => (regDel & 0x10) !== 0,
  
  // Helper to check if SME acknowledgement is requested
  hasSMEAcknowledgement: (regDel: number) => (regDel & 0x0c) !== 0,
} as const;

// Type for Registered Delivery values
export type RegisteredDeliveryValue = number;

/**
 * Broadcast Area Format Types (SMPP v5 Spec Table 4-65)
 * First octet of the broadcast_area_identifier TLV value.
 * The spec defines exactly three values; all others are reserved.
 */
export enum BroadcastAreaFormat {
  ALIAS_NAME = 0x00,    // Alias (geographic name / abbreviation)
  ELLIPSOID_ARC = 0x01, // Ellipsoid arc
  POLYGON = 0x02,       // Polygon (series of coordinates)
}

// Data Coding
/**
 * Data Coding Scheme (SMPP v5 Spec Section 4.7.7, Table 4-46)
 */
export enum DataCoding {
  // General Data Coding (0x00-0x0F)
  SMSC_DEFAULT = 0x00,          // SMSC Default Alphabet
  IA5_ASCII = 0x01,             // IA5 (CCITT T.50)/ASCII (ANSI X3.4)
  OCTET_UNSPECIFIED = 0x02,     // Octet unspecified (8-bit binary)
  LATIN_1 = 0x03,               // Latin 1 (ISO-8859-1)
  OCTET_UNSPECIFIED_COMMON = 0x04, // Octet unspecified (8-bit binary)
  JIS = 0x05,                   // JIS (X 0208-1990)
  CYRILLIC = 0x06,              // Cyrillic (ISO-8859-5)
  LATIN_HEBREW = 0x07,          // Latin/Hebrew (ISO-8859-8)
  UCS2 = 0x08,                  // UCS2 (ISO/IEC-10646)
  PICTOGRAM = 0x09,             // Pictogram Encoding
  ISO_2022_JP = 0x0a,           // ISO-2022-JP (Music Codes)
  EXTENDED_KANJI = 0x0d,        // Extended Kanji JIS(X 0212-1990)
  KS_C_5601 = 0x0e,             // KS C 5601
  
  // Message Waiting Indication Group (0xC0-0xDF)
  MWI_VOICEMAIL_DISCARD = 0xc0, // Discard Message, Set Indication Active (voicemail)
  MWI_FAX_DISCARD = 0xc1,       // Discard Message, Set Indication Active (fax)
  MWI_EMAIL_DISCARD = 0xc2,     // Discard Message, Set Indication Active (email)
  MWI_OTHER_DISCARD = 0xc3,     // Discard Message, Set Indication Active (other)
  
  MWI_VOICEMAIL_STORE = 0xc4,   // Store Message, Set Indication Active (voicemail)
  MWI_FAX_STORE = 0xc5,         // Store Message, Set Indication Active (fax)
  MWI_EMAIL_STORE = 0xc6,       // Store Message, Set Indication Active (email)
  MWI_OTHER_STORE = 0xc7,       // Store Message, Set Indication Active (other)
  
  MWI_VOICEMAIL_CLEAR = 0xc8,   // Store Message, Set Indication Inactive (voicemail)
  MWI_FAX_CLEAR = 0xc9,         // Store Message, Set Indication Inactive (fax)
  MWI_EMAIL_CLEAR = 0xca,       // Store Message, Set Indication Inactive (email)
  MWI_OTHER_CLEAR = 0xcb,       // Store Message, Set Indication Inactive (other)
  
  // GSM Message Class (0xF0-0xF3)
  GSM_CLASS_0 = 0xf0,           // GSM 7-bit Default Alphabet, Class 0 (Flash SMS)
  GSM_CLASS_1 = 0xf1,           // GSM 7-bit Default Alphabet, Class 1 (ME-specific)
  GSM_CLASS_2 = 0xf2,           // GSM 7-bit Default Alphabet, Class 2 (SIM-specific)
  GSM_CLASS_3 = 0xf3,           // GSM 7-bit Default Alphabet, Class 3 (TE-specific)
  
  GSM_8BIT_CLASS_0 = 0xf4,      // GSM 8-bit data, Class 0
  GSM_8BIT_CLASS_1 = 0xf5,      // GSM 8-bit data, Class 1
  GSM_8BIT_CLASS_2 = 0xf6,      // GSM 8-bit data, Class 2
  GSM_8BIT_CLASS_3 = 0xf7,      // GSM 8-bit data, Class 3
}

// Session States - Using string union for runtime access
export const SessionState = {
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  BOUND_TX: "BOUND_TX",
  BOUND_RX: "BOUND_RX",
  BOUND_TRX: "BOUND_TRX",
  UNBOUND: "UNBOUND",
  OUTBOUND: "OUTBOUND",
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

// PDU Structure
export interface PDU {
  readonly command_length: number;
  readonly command_id: CommandId;
  readonly command_status: CommandStatus;
  readonly sequence_number: number;
  readonly body?: Buffer;
}

// Bind Parameters
export interface BindParams {
  readonly system_id: string;
  readonly password: string;
  readonly system_type?: string;
  readonly interface_version?: number;
  readonly addr_ton?: TON;
  readonly addr_npi?: NPI;
  readonly address_range?: string;
}

// Submit SM Parameters
export interface SubmitSMParams {
  // Mandatory fields
  readonly service_type?: string;
  readonly source_addr_ton?: TON;
  readonly source_addr_npi?: NPI;
  readonly source_addr: string;
  readonly dest_addr_ton?: TON;
  readonly dest_addr_npi?: NPI;
  readonly destination_addr: string;
  readonly esm_class?: ESMClassValue;
  readonly protocol_id?: number;
  readonly priority_flag?: number;
  readonly schedule_delivery_time?: string;
  readonly validity_period?: string;
  readonly registered_delivery?: number;
  readonly replace_if_present_flag?: number;
  readonly data_coding?: DataCoding;
  readonly sm_default_msg_id?: number;
  readonly short_message: string | Buffer;
  
  // Optional TLV parameters (SMPP v5 Spec Section 4.2.1, Table 4-20)
  readonly tlvs?: TLV[];  // Generic TLV support
  
  // Common TLVs (convenience fields - will be converted to TLVs)
  readonly message_payload?: Buffer;         // 0x0424 - For messages > 254 bytes
  readonly source_port?: number;             // 0x020a - Source port number
  readonly destination_port?: number;        // 0x020b - Destination port number
  readonly sar_msg_ref_num?: number;         // 0x020c - SAR reference number
  readonly sar_total_segments?: number;      // 0x020e - Total number of segments
  readonly sar_segment_seqnum?: number;      // 0x020f - Segment sequence number
  readonly user_message_reference?: number;  // 0x0204 - User message reference
  readonly payload_type?: number;            // 0x0019 - Payload type
  readonly receipted_message_id?: string;    // 0x001e - Original message ID (for receipts)
}

// Deliver SM Parameters
export interface DeliverSMParams {
  // Mandatory fields
  readonly service_type: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly dest_addr_ton: TON;
  readonly dest_addr_npi: NPI;
  readonly destination_addr: string;
  readonly esm_class: ESMClassValue;
  readonly protocol_id: number;
  readonly priority_flag: number;
  readonly schedule_delivery_time: string;
  readonly validity_period: string;
  readonly registered_delivery: number;
  readonly replace_if_present_flag: number;
  readonly data_coding: DataCoding;
  readonly sm_default_msg_id: number;
  readonly sm_length: number;
  readonly short_message: Buffer;
  
  // Optional TLV parameters (SMPP v5 Spec Section 4.3.1, Table 4-24)
  readonly tlvs?: TLV[];  // All decoded TLVs
  
  // Common TLVs (convenience fields - extracted from TLVs)
  readonly message_payload?: Buffer;        // 0x0424 - Long message content
  readonly receipted_message_id?: string;   // 0x001e - Original message ID (for delivery receipts)
  readonly message_state?: number;          // 0x0427 - Message state (for delivery receipts)
  readonly network_error_code?: Buffer;     // 0x0423 - Network error code
  readonly user_message_reference?: number; // 0x0204 - User message reference
  readonly source_port?: number;            // 0x020a - Source port number
  readonly destination_port?: number;       // 0x020b - Destination port number
}

// Query SM Parameters (Optional Operation)
export interface QuerySMParams {
  readonly message_id: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
}

export interface QuerySMResp {
  readonly message_id: string;
  readonly final_date: string;
  readonly message_state: number;
  readonly error_code: number;
}

// Cancel SM Parameters (Optional Operation)
export interface CancelSMParams {
  readonly service_type?: string;
  readonly message_id: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly dest_addr_ton: TON;
  readonly dest_addr_npi: NPI;
  readonly destination_addr: string;
}

// Replace SM Parameters (Optional Operation)
export interface ReplaceSMParams {
  readonly message_id: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly schedule_delivery_time?: string;
  readonly validity_period?: string;
  readonly registered_delivery: number;
  readonly sm_default_msg_id: number;
  readonly short_message: string | Buffer;
  // Optional: use message_payload TLV for content > 255 octets (sm_length is then 0)
  readonly message_payload?: Buffer;
  readonly tlvs?: TLV[];
}

// Submit Multi Parameters (Optional Operation)
export interface SubmitMultiParams {
  readonly service_type?: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly dest_addresses: Array<{
    dest_flag: number;  // 1=SME address, 2=Distribution list
    dest_addr_ton?: TON;
    dest_addr_npi?: NPI;
    destination_addr: string;
  }>;
  readonly esm_class?: ESMClassValue;
  readonly protocol_id?: number;
  readonly priority_flag?: number;
  readonly schedule_delivery_time?: string;
  readonly validity_period?: string;
  readonly registered_delivery?: number;
  readonly replace_if_present_flag?: number;
  readonly data_coding?: DataCoding;
  readonly sm_default_msg_id?: number;
  readonly short_message: string | Buffer;
  // Optional: use message_payload TLV for content > 255 octets (sm_length is then 0)
  readonly message_payload?: Buffer;
  readonly tlvs?: TLV[];
}

export interface SubmitMultiResp {
  readonly message_id: string;
  readonly unsuccessful_smes?: Array<{
    dest_addr_ton: TON;
    dest_addr_npi: NPI;
    destination_addr: string;
    error_status_code: number;
  }>;
}

// Data SM Parameters (Optional Operation)
export interface DataSMParams {
  readonly service_type?: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly dest_addr_ton: TON;
  readonly dest_addr_npi: NPI;
  readonly destination_addr: string;
  readonly esm_class?: ESMClassValue;
  readonly registered_delivery?: number;
  readonly data_coding?: DataCoding;
  readonly tlvs?: TLV[];  // DATA_SM uses only TLVs for message content
}

export interface DataSMResp {
  readonly message_id: string;
  readonly tlvs?: TLV[];
}

// Alert Notification Parameters (Optional Operation - MC to ESME only)
export interface AlertNotificationParams {
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly esme_addr_ton: TON;
  readonly esme_addr_npi: NPI;
  readonly esme_addr: string;
  readonly tlvs?: TLV[];
}

// OUTBIND Parameters (Optional Operation - MC to ESME)
// SMPP v5 Spec Section 4.1.1.7
export interface OutbindParams {
  readonly system_id: string;
  readonly password: string;
}

// Broadcast SM Parameters (Optional Operation - Cell Broadcast)
// SMPP v5 Spec Section 4.4.1
export interface BroadcastSMParams {
  readonly service_type?: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
  readonly message_id: string;
  readonly priority_flag?: number;
  readonly schedule_delivery_time?: string;
  readonly validity_period?: string;
  readonly replace_if_present_flag?: number;
  readonly data_coding?: DataCoding;
  readonly sm_default_msg_id?: number;
  // Broadcast-specific TLVs (required for broadcast operations)
  readonly broadcast_area_identifier?: Buffer;  // Required TLV
  readonly broadcast_content_type?: Buffer;     // Required TLV
  readonly broadcast_rep_num?: number;
  readonly broadcast_frequency_interval?: Buffer;
  readonly short_message?: Buffer;
  readonly message_payload?: Buffer;
  readonly tlvs?: TLV[];
}

export interface BroadcastSMResp {
  readonly message_id: string;
  readonly tlvs?: TLV[];
}

// Query Broadcast SM Parameters (Optional Operation)
// SMPP v5 Spec Section 4.6.1
export interface QueryBroadcastSMParams {
  readonly message_id: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
}

export interface QueryBroadcastSMResp {
  readonly message_id: string;
  readonly message_state: number;
  readonly tlvs?: TLV[];
}

// Cancel Broadcast SM Parameters (Optional Operation)
// SMPP v5 Spec Section 4.6.2
export interface CancelBroadcastSMParams {
  readonly service_type?: string;
  readonly message_id: string;
  readonly source_addr_ton: TON;
  readonly source_addr_npi: NPI;
  readonly source_addr: string;
}

// Connection Configuration
export interface SMPPConfig {
  readonly host: string;
  readonly port: number;
  readonly system_id: string;
  readonly password: string;
  readonly system_type?: string;
  readonly interface_version?: number;
  readonly addr_ton?: TON;
  readonly addr_npi?: NPI;
  readonly address_range?: string;

  // Auto-reconnect settings
  readonly auto_reconnect?: boolean;
  readonly reconnect_delay?: number; // Initial delay in ms
  readonly max_reconnect_delay?: number; // Maximum delay in ms
  readonly reconnect_backoff_factor?: number; // Exponential backoff multiplier
  readonly max_reconnect_attempts?: number; // 0 for infinite

  // Keep-alive settings
  readonly enquire_link_interval?: number; // Interval in ms
  readonly enquire_link_timeout?: number; // Timeout in ms
  readonly response_timeout?: number; // General response timeout in ms

  // Connection settings
  readonly bind_timeout?: number; // Bind operation timeout in ms
  readonly socket_timeout?: number; // TCP socket timeout in ms

  // SSL/TLS settings
  readonly use_tls?: boolean; // Enable SSL/TLS
  readonly tls_options?: TLSOptions; // TLS-specific options

  // Logging
  readonly debug?: boolean;
  readonly trace_pdu?: boolean; // Log raw PDU hex on the wire (verbose; may include message content)
  readonly logger?: Logger;
}

// TLS Configuration Options
export interface TLSOptions {
  // Certificate verification
  readonly rejectUnauthorized?: boolean; // Reject unauthorized certificates (default: true)
  readonly checkServerIdentity?: boolean; // Check server identity (default: true)

  // Certificates and keys
  readonly ca?: string | Buffer | Array<string | Buffer>; // Certificate Authority
  readonly cert?: string | Buffer; // Client certificate
  readonly key?: string | Buffer; // Client private key
  readonly passphrase?: string; // Passphrase for private key

  // Certificate files (alternative to direct content)
  readonly caFile?: string; // Path to CA file
  readonly certFile?: string; // Path to certificate file
  readonly keyFile?: string; // Path to key file

  // Protocol versions
  readonly minVersion?: string; // Minimum TLS version (e.g., 'TLSv1.2')
  readonly maxVersion?: string; // Maximum TLS version (e.g., 'TLSv1.3')

  // Cipher suites
  readonly ciphers?: string; // Allowed cipher suites

  // Server name indication
  readonly servername?: string; // SNI server name (defaults to host)

  // Session resumption
  readonly session?: Buffer; // TLS session to resume
  readonly requestCert?: boolean; // Request certificate from server

  // Advanced options
  readonly secureProtocol?: string; // SSL method to use (e.g., 'TLSv1_2_method')
  readonly honorCipherOrder?: boolean; // Use server cipher order
}

// Logger interface
export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

// TLV (Tag-Length-Value) structure for optional parameters
export interface TLV {
  readonly tag: number;
  readonly length?: number;  // Optional - can be computed from value.length
  readonly value: Buffer;
}

// Common TLV Tags
export enum TLVTag {
  DEST_ADDR_SUBUNIT = 0x0005,
  DEST_NETWORK_TYPE = 0x0006,
  DEST_BEARER_TYPE = 0x0007,
  DEST_TELEMATICS_ID = 0x0008,
  SOURCE_ADDR_SUBUNIT = 0x000d,
  SOURCE_NETWORK_TYPE = 0x000e,
  SOURCE_BEARER_TYPE = 0x000f,
  SOURCE_TELEMATICS_ID = 0x0010,
  QOS_TIME_TO_LIVE = 0x0017,
  PAYLOAD_TYPE = 0x0019,
  ADDITIONAL_STATUS_INFO_TEXT = 0x001d,
  RECEIPTED_MESSAGE_ID = 0x001e,
  MS_MSG_WAIT_FACILITIES = 0x0030,
  PRIVACY_INDICATOR = 0x0201,
  SOURCE_SUBADDRESS = 0x0202,
  DEST_SUBADDRESS = 0x0203,
  USER_MESSAGE_REFERENCE = 0x0204,
  USER_RESPONSE_CODE = 0x0205,
  SOURCE_PORT = 0x020a,
  DESTINATION_PORT = 0x020b,
  SAR_MSG_REF_NUM = 0x020c,
  LANGUAGE_INDICATOR = 0x020d,
  SAR_TOTAL_SEGMENTS = 0x020e,
  SAR_SEGMENT_SEQNUM = 0x020f,
  SC_INTERFACE_VERSION = 0x0210,
  CALLBACK_NUM_PRES_IND = 0x0302,
  CALLBACK_NUM_ATAG = 0x0303,
  NUMBER_OF_MESSAGES = 0x0304,
  CALLBACK_NUM = 0x0381,
  DPF_RESULT = 0x0420,
  SET_DPF = 0x0421,
  MS_AVAILABILITY_STATUS = 0x0422,
  NETWORK_ERROR_CODE = 0x0423,
  MESSAGE_PAYLOAD = 0x0424,
  DELIVERY_FAILURE_REASON = 0x0425,
  MORE_MESSAGES_TO_SEND = 0x0426,
  MESSAGE_STATE = 0x0427,
  USSD_SERVICE_OP = 0x0501,
  DISPLAY_TIME = 0x1201,
  SMS_SIGNAL = 0x1203,
  MS_VALIDITY = 0x1204,
  ALERT_ON_MESSAGE_DELIVERY = 0x130c,
  ITS_REPLY_TYPE = 0x1380,
  ITS_SESSION_INFO = 0x1383,
  // Broadcast-specific TLVs (SMPP v5 Spec Table 4-60, 0x0600-0x060B)
  BROADCAST_CHANNEL_INDICATOR = 0x0600,
  BROADCAST_CONTENT_TYPE = 0x0601,
  BROADCAST_CONTENT_TYPE_INFO = 0x0602,
  BROADCAST_MESSAGE_CLASS = 0x0603,
  BROADCAST_REP_NUM = 0x0604,
  BROADCAST_FREQUENCY_INTERVAL = 0x0605,
  BROADCAST_AREA_IDENTIFIER = 0x0606,
  BROADCAST_ERROR_STATUS = 0x0607,
  BROADCAST_AREA_SUCCESS = 0x0608,
  BROADCAST_END_TIME = 0x0609,
  BROADCAST_SERVICE_GROUP = 0x060a,
  BILLING_IDENTIFICATION = 0x060b,
}
