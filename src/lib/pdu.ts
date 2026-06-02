/**
 * SMPP PDU Encoder/Decoder
 * Handles encoding and decoding of SMPP Protocol Data Units
 */

import {
  CommandId,
  CommandStatus,
  PDU,
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
  TON,
  NPI,
  ESMClass,
  ESMClassValue,
  DataCoding,
  TLV,
  TLVTag,
} from './types.js';

/**
 * The SMPP header is a mandatory 16-octet prefix on every PDU
 * (SMPP v5 Spec Section 3.2). Any command_length below this is invalid.
 */
export const SMPP_HEADER_LENGTH = 16;

/**
 * Upper bound on a single PDU's command_length. A message_payload TLV is at
 * most 65535 octets, so legitimate PDUs are well under this; the cap exists to
 * reject a malicious/garbled command_length before it can drive unbounded
 * buffering (SMPP v5 Spec: respond generic_nack/ESME_RINVCMDLEN). 1 MiB leaves
 * generous room for vendor extensions.
 */
export const MAX_PDU_LENGTH = 1024 * 1024;

/**
 * Maximum sizes (in octets, including the NULL terminator) of the common
 * C-Octet String fields, per the SMPP v5 PDU definitions. Used to bound the
 * encoded fields so an over-long input cannot produce a malformed PDU.
 */
export const COctetMax = {
  system_id: 16,
  password: 9,
  system_type: 13,
  address: 21, // source_addr / destination_addr / esme_addr
  service_type: 6,
  message_id: 65,
  time: 17, // schedule_delivery_time / validity_period (16 chars + NULL)
} as const;

/** Thrown by the decoder when a PDU header is structurally invalid. */
export class InvalidPDUError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPDUError';
  }
}

export class PDUEncoder {
  /**
   * Encode a C-string (null-terminated string)
   */
  private static encodeCString(str: string, maxLength?: number): Buffer {
    const buf = Buffer.from(str + '\0', 'ascii');
    if (maxLength && buf.length > maxLength) {
      const truncated = buf.slice(0, maxLength - 1);
      return Buffer.concat([truncated, Buffer.from([0])]);
    }
    return buf;
  }

  /**
   * Create PDU header
   */
  private static createHeader(
    command_id: CommandId,
    sequence_number: number,
    command_status: CommandStatus = CommandStatus.ESME_ROK
  ): Buffer {
    const header = Buffer.alloc(16);
    // command_length will be set later
    header.writeUInt32BE(0, 0);
    header.writeUInt32BE(command_id, 4);
    header.writeUInt32BE(command_status, 8);
    header.writeUInt32BE(sequence_number, 12);
    return header;
  }

  /**
   * Encode TLV (Tag-Length-Value)
   */
  private static encodeTLV(tag: number, value: Buffer): Buffer {
    const header = Buffer.alloc(4);
    header.writeUInt16BE(tag, 0);           // Tag (2 bytes)
    header.writeUInt16BE(value.length, 2);  // Length (2 bytes)
    return Buffer.concat([header, value]);   // Header + Value
  }

  /**
   * Encode multiple TLVs
   */
  private static encodeTLVs(tlvs: TLV[]): Buffer {
    if (!tlvs || tlvs.length === 0) {
      return Buffer.alloc(0);
    }
    return Buffer.concat(tlvs.map(tlv => this.encodeTLV(tlv.tag, tlv.value)));
  }

  /**
   * Finalize PDU by setting the correct length
   */
  private static finalizePDU(header: Buffer, body?: Buffer): Buffer {
    const totalLength = header.length + (body ? body.length : 0);
    header.writeUInt32BE(totalLength, 0);
    return body ? Buffer.concat([header, body]) : header;
  }

  /**
   * Encode BIND_TRANSMITTER PDU
   */
  static encodeBindTransmitter(params: BindParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.BIND_TRANSMITTER, sequence_number);
    
    const body = Buffer.concat([
      this.encodeCString(params.system_id, COctetMax.system_id),
      this.encodeCString(params.password, COctetMax.password),
      this.encodeCString(params.system_type ?? '', COctetMax.system_type),
      Buffer.from([params.interface_version ?? 0x50]), // 0x50 = SMPP v5.0
      Buffer.from([params.addr_ton ?? TON.UNKNOWN]),
      Buffer.from([params.addr_npi ?? NPI.UNKNOWN]),
      this.encodeCString(params.address_range ?? '', COctetMax.address),
    ]);

    return this.finalizePDU(header, body);
  }

  /**
   * Encode BIND_RECEIVER PDU
   */
  static encodeBindReceiver(params: BindParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.BIND_RECEIVER, sequence_number);

    const body = Buffer.concat([
      this.encodeCString(params.system_id, COctetMax.system_id),
      this.encodeCString(params.password, COctetMax.password),
      this.encodeCString(params.system_type ?? '', COctetMax.system_type),
      Buffer.from([params.interface_version ?? 0x50]), // 0x50 = SMPP v5.0
      Buffer.from([params.addr_ton ?? TON.UNKNOWN]),
      Buffer.from([params.addr_npi ?? NPI.UNKNOWN]),
      this.encodeCString(params.address_range ?? '', COctetMax.address),
    ]);

    return this.finalizePDU(header, body);
  }

  /**
   * Encode BIND_TRANSCEIVER PDU
   */
  static encodeBindTransceiver(params: BindParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.BIND_TRANSCEIVER, sequence_number);

    const body = Buffer.concat([
      this.encodeCString(params.system_id, COctetMax.system_id),
      this.encodeCString(params.password, COctetMax.password),
      this.encodeCString(params.system_type ?? '', COctetMax.system_type),
      Buffer.from([params.interface_version ?? 0x50]), // 0x50 = SMPP v5.0
      Buffer.from([params.addr_ton ?? TON.UNKNOWN]),
      Buffer.from([params.addr_npi ?? NPI.UNKNOWN]),
      this.encodeCString(params.address_range ?? '', COctetMax.address),
    ]);

    return this.finalizePDU(header, body);
  }

  /**
   * Encode UNBIND PDU
   */
  static encodeUnbind(sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.UNBIND, sequence_number);
    return this.finalizePDU(header);
  }

  /**
   * Encode UNBIND_RESP PDU
   */
  static encodeUnbindResp(sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.UNBIND_RESP, sequence_number);
    return this.finalizePDU(header);
  }

  /**
   * Encode ENQUIRE_LINK PDU
   */
  static encodeEnquireLink(sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.ENQUIRE_LINK, sequence_number);
    return this.finalizePDU(header);
  }

  /**
   * Encode ENQUIRE_LINK_RESP PDU
   */
  static encodeEnquireLinkResp(sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.ENQUIRE_LINK_RESP, sequence_number);
    return this.finalizePDU(header);
  }

  /**
   * Encode SUBMIT_SM PDU
   */
  /**
   * Encode SUBMIT_SM PDU with optional TLV support
   * SMPP v5 Spec Section 4.2.1, Table 4-20
   */
  static encodeSubmitSM(params: SubmitSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.SUBMIT_SM, sequence_number);
    
    // Build TLV list from convenience fields and explicit TLVs
    const tlvs: TLV[] = [...(params.tlvs || [])];
    
    // Use message_payload TLV for long messages (> 254 bytes)
    // SMPP v5 Spec Section 4.8.4.36
    let messageBuffer: Buffer;
    let sm_length: number;
    
    if (params.message_payload) {
      // Use message_payload TLV - set short_message to NULL
      messageBuffer = Buffer.alloc(0);
      sm_length = 0;
      tlvs.push({ tag: TLVTag.MESSAGE_PAYLOAD, value: params.message_payload });
    } else {
      // Use short_message field (max 255 bytes)
      if (typeof params.short_message === 'string') {
        messageBuffer = Buffer.from(params.short_message, 'utf8');
      } else {
        messageBuffer = params.short_message;
      }
      sm_length = Math.min(messageBuffer.length, 255);
      messageBuffer = messageBuffer.slice(0, sm_length);
    }
    
    // Add convenience TLV fields if provided
    if (params.source_port !== undefined) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(params.source_port, 0);
      tlvs.push({ tag: TLVTag.SOURCE_PORT, value: buf });
    }
    if (params.destination_port !== undefined) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(params.destination_port, 0);
      tlvs.push({ tag: TLVTag.DESTINATION_PORT, value: buf });
    }
    if (params.sar_msg_ref_num !== undefined) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(params.sar_msg_ref_num, 0);
      tlvs.push({ tag: TLVTag.SAR_MSG_REF_NUM, value: buf });
    }
    if (params.sar_total_segments !== undefined) {
      tlvs.push({ tag: TLVTag.SAR_TOTAL_SEGMENTS, value: Buffer.from([params.sar_total_segments]) });
    }
    if (params.sar_segment_seqnum !== undefined) {
      tlvs.push({ tag: TLVTag.SAR_SEGMENT_SEQNUM, value: Buffer.from([params.sar_segment_seqnum]) });
    }
    if (params.user_message_reference !== undefined) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(params.user_message_reference, 0);
      tlvs.push({ tag: TLVTag.USER_MESSAGE_REFERENCE, value: buf });
    }
    if (params.payload_type !== undefined) {
      tlvs.push({ tag: TLVTag.PAYLOAD_TYPE, value: Buffer.from([params.payload_type]) });
    }
    
    // Encode mandatory fields. Use ?? (not ||) so an explicit 0 (e.g.
    // TON.UNKNOWN / NPI.UNKNOWN) is preserved rather than replaced by a default.
    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      Buffer.from([params.source_addr_ton ?? TON.UNKNOWN]),
      Buffer.from([params.source_addr_npi ?? NPI.UNKNOWN]),
      this.encodeCString(params.source_addr, COctetMax.address),
      Buffer.from([params.dest_addr_ton ?? TON.INTERNATIONAL]),
      Buffer.from([params.dest_addr_npi ?? NPI.ISDN]),
      this.encodeCString(params.destination_addr, COctetMax.address),
      Buffer.from([params.esm_class ?? ESMClass.MODE_DEFAULT]),
      Buffer.from([params.protocol_id ?? 0]),
      Buffer.from([params.priority_flag ?? 0]),
      this.encodeCString(params.schedule_delivery_time ?? '', COctetMax.time),
      this.encodeCString(params.validity_period ?? '', COctetMax.time),
      Buffer.from([params.registered_delivery ?? 0]),
      Buffer.from([params.replace_if_present_flag ?? 0]),
      Buffer.from([params.data_coding ?? DataCoding.SMSC_DEFAULT]),
      Buffer.from([params.sm_default_msg_id ?? 0]),
      Buffer.from([sm_length]),
      messageBuffer,
      // Append optional TLVs
      this.encodeTLVs(tlvs),
    ]);

    return this.finalizePDU(header, body);
  }

  /**
   * Encode DELIVER_SM_RESP PDU
   */
  static encodeDeliverSMResp(
    sequence_number: number,
    message_id: string = '',
    status: CommandStatus = CommandStatus.ESME_ROK
  ): Buffer {
    const header = this.createHeader(CommandId.DELIVER_SM_RESP, sequence_number, status);
    const body = this.encodeCString(message_id, COctetMax.message_id);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode QUERY_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  static encodeQuerySM(params: QuerySMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.QUERY_SM, sequence_number);
    const body = Buffer.concat([
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode CANCEL_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.9.1
   */
  static encodeCancelSM(params: CancelSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.CANCEL_SM, sequence_number);
    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
      Buffer.from([params.dest_addr_ton]),
      Buffer.from([params.dest_addr_npi]),
      this.encodeCString(params.destination_addr, COctetMax.address),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode REPLACE_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.10.1
   */
  static encodeReplaceSM(params: ReplaceSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.REPLACE_SM, sequence_number);

    const tlvs: TLV[] = [...(params.tlvs || [])];

    // For content > 255 octets the spec requires message_payload with sm_length=0.
    let messageBuffer: Buffer;
    let sm_length: number;
    if (params.message_payload) {
      messageBuffer = Buffer.alloc(0);
      sm_length = 0;
      tlvs.push({ tag: TLVTag.MESSAGE_PAYLOAD, value: params.message_payload });
    } else {
      messageBuffer =
        typeof params.short_message === 'string'
          ? Buffer.from(params.short_message, 'utf8')
          : params.short_message;
      sm_length = Math.min(messageBuffer.length, 255);
      messageBuffer = messageBuffer.slice(0, sm_length);
    }

    const body = Buffer.concat([
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
      this.encodeCString(params.schedule_delivery_time || '', COctetMax.time),
      this.encodeCString(params.validity_period || '', COctetMax.time),
      Buffer.from([params.registered_delivery]),
      Buffer.from([params.sm_default_msg_id]),
      Buffer.from([sm_length]),
      messageBuffer,
      this.encodeTLVs(tlvs),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode SUBMIT_MULTI PDU (Optional Operation)
   * SMPP v5 Spec Section 4.4.1
   */
  static encodeSubmitMulti(params: SubmitMultiParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.SUBMIT_MULTI, sequence_number);

    // number_of_dests is a single octet (1..255).
    if (params.dest_addresses.length < 1 || params.dest_addresses.length > 255) {
      throw new RangeError(
        `submit_multi requires 1..255 destinations, got ${params.dest_addresses.length}`
      );
    }

    const tlvs: TLV[] = [...(params.tlvs || [])];

    // For content > 255 octets the spec requires message_payload with sm_length=0.
    let messageBuffer: Buffer;
    let sm_length: number;
    if (params.message_payload) {
      messageBuffer = Buffer.alloc(0);
      sm_length = 0;
      tlvs.push({ tag: TLVTag.MESSAGE_PAYLOAD, value: params.message_payload });
    } else {
      messageBuffer =
        typeof params.short_message === 'string'
          ? Buffer.from(params.short_message, 'utf8')
          : params.short_message;
      sm_length = Math.min(messageBuffer.length, 255);
      messageBuffer = messageBuffer.slice(0, sm_length);
    }

    // Encode destination addresses
    const destBuffers = params.dest_addresses.map(dest => {
      if (dest.dest_flag === 1) {
        // SME address
        return Buffer.concat([
          Buffer.from([dest.dest_flag]),
          Buffer.from([dest.dest_addr_ton ?? TON.UNKNOWN]),
          Buffer.from([dest.dest_addr_npi ?? NPI.UNKNOWN]),
          this.encodeCString(dest.destination_addr, COctetMax.address),
        ]);
      } else {
        // Distribution list
        return Buffer.concat([
          Buffer.from([dest.dest_flag]),
          this.encodeCString(dest.destination_addr),
        ]);
      }
    });

    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
      Buffer.from([params.dest_addresses.length]),  // number_of_dests
      ...destBuffers,
      Buffer.from([params.esm_class ?? ESMClass.MODE_DEFAULT]),
      Buffer.from([params.protocol_id ?? 0]),
      Buffer.from([params.priority_flag ?? 0]),
      this.encodeCString(params.schedule_delivery_time ?? '', COctetMax.time),
      this.encodeCString(params.validity_period ?? '', COctetMax.time),
      Buffer.from([params.registered_delivery ?? 0]),
      Buffer.from([params.replace_if_present_flag ?? 0]),
      Buffer.from([params.data_coding ?? DataCoding.SMSC_DEFAULT]),
      Buffer.from([params.sm_default_msg_id ?? 0]),
      Buffer.from([sm_length]),
      messageBuffer,
      this.encodeTLVs(tlvs),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode DATA_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.7.1
   */
  static encodeDataSM(params: DataSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.DATA_SM, sequence_number);
    
    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
      Buffer.from([params.dest_addr_ton]),
      Buffer.from([params.dest_addr_npi]),
      this.encodeCString(params.destination_addr, COctetMax.address),
      Buffer.from([params.esm_class ?? ESMClass.MODE_DEFAULT]),
      Buffer.from([params.registered_delivery ?? 0]),
      Buffer.from([params.data_coding ?? DataCoding.SMSC_DEFAULT]),
      // TLVs for message content (message_payload is the only means of text in data_sm)
      this.encodeTLVs(params.tlvs || []),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode DATA_SM_RESP PDU (response to an MC-initiated data_sm)
   * SMPP v5 Spec Section 4.7.2, Table 4-17
   */
  static encodeDataSMResp(
    sequence_number: number,
    message_id: string = '',
    status: CommandStatus = CommandStatus.ESME_ROK,
    tlvs: TLV[] = []
  ): Buffer {
    const header = this.createHeader(CommandId.DATA_SM_RESP, sequence_number, status);
    const body = Buffer.concat([
      this.encodeCString(message_id, COctetMax.message_id),
      this.encodeTLVs(tlvs),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode OUTBIND PDU (Optional Operation - MC to ESME)
   * SMPP v5 Spec Section 4.1.1.7
   */
  static encodeOutbind(params: OutbindParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.OUTBIND, sequence_number);
    const body = Buffer.concat([
      this.encodeCString(params.system_id, COctetMax.system_id),
      this.encodeCString(params.password, COctetMax.password),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode BROADCAST_SM PDU (Optional Operation - Cell Broadcast)
   * SMPP v5 Spec Section 4.4.1
   */
  static encodeBroadcastSM(params: BroadcastSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.BROADCAST_SM, sequence_number);
    
    // Build TLV list (broadcast operations are TLV-heavy)
    const tlvs: TLV[] = [...(params.tlvs || [])];

    // broadcast_area_identifier and broadcast_content_type are mandatory for
    // broadcast_sm (Table 4-26). Accept them either as convenience fields or as
    // explicit TLVs, but require both to be present.
    const hasTlv = (tag: number) =>
      tlvs.some(t => t.tag === tag) ||
      (tag === TLVTag.BROADCAST_AREA_IDENTIFIER && !!params.broadcast_area_identifier) ||
      (tag === TLVTag.BROADCAST_CONTENT_TYPE && !!params.broadcast_content_type);
    if (!hasTlv(TLVTag.BROADCAST_AREA_IDENTIFIER) || !hasTlv(TLVTag.BROADCAST_CONTENT_TYPE)) {
      throw new Error(
        'broadcast_sm requires broadcast_area_identifier and broadcast_content_type'
      );
    }

    // Add convenience broadcast TLVs
    if (params.broadcast_area_identifier) {
      tlvs.push({ tag: TLVTag.BROADCAST_AREA_IDENTIFIER, value: params.broadcast_area_identifier });
    }
    if (params.broadcast_content_type) {
      tlvs.push({ tag: TLVTag.BROADCAST_CONTENT_TYPE, value: params.broadcast_content_type });
    }
    if (params.broadcast_rep_num !== undefined) {
      const buf = Buffer.alloc(2);
      buf.writeUInt16BE(params.broadcast_rep_num, 0);
      tlvs.push({ tag: TLVTag.BROADCAST_REP_NUM, value: buf });
    }
    if (params.broadcast_frequency_interval) {
      tlvs.push({ tag: TLVTag.BROADCAST_FREQUENCY_INTERVAL, value: params.broadcast_frequency_interval });
    }
    if (params.message_payload) {
      tlvs.push({ tag: TLVTag.MESSAGE_PAYLOAD, value: params.message_payload });
    }

    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.priority_flag ?? 0]),
      this.encodeCString(params.schedule_delivery_time ?? '', COctetMax.time),
      this.encodeCString(params.validity_period ?? '', COctetMax.time),
      Buffer.from([params.replace_if_present_flag ?? 0]),
      Buffer.from([params.data_coding ?? DataCoding.SMSC_DEFAULT]),
      Buffer.from([params.sm_default_msg_id ?? 0]),
      // Broadcast operations use TLVs for message content
      this.encodeTLVs(tlvs),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode QUERY_BROADCAST_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  static encodeQueryBroadcastSM(params: QueryBroadcastSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.QUERY_BROADCAST_SM, sequence_number);
    const body = Buffer.concat([
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode CANCEL_BROADCAST_SM PDU (Optional Operation)
   * SMPP v5 Spec Section 4.6.2
   */
  static encodeCancelBroadcastSM(params: CancelBroadcastSMParams, sequence_number: number): Buffer {
    const header = this.createHeader(CommandId.CANCEL_BROADCAST_SM, sequence_number);
    const body = Buffer.concat([
      this.encodeCString(params.service_type ?? '', COctetMax.service_type),
      this.encodeCString(params.message_id, COctetMax.message_id),
      Buffer.from([params.source_addr_ton]),
      Buffer.from([params.source_addr_npi]),
      this.encodeCString(params.source_addr, COctetMax.address),
    ]);
    return this.finalizePDU(header, body);
  }

  /**
   * Encode GENERIC_NACK PDU
   */
  static encodeGenericNack(
    sequence_number: number,
    status: CommandStatus = CommandStatus.ESME_RINVCMDID
  ): Buffer {
    const header = this.createHeader(CommandId.GENERIC_NACK, sequence_number, status);
    return this.finalizePDU(header);
  }

  /**
   * Encode TLV parameter
   */
}

export class PDUDecoder {
  /**
   * Decode C-string from buffer
   */
  private static decodeCString(buffer: Buffer, offset: number): { value: string; length: number } {
    // Guard against reads at/after the end of a truncated body.
    if (offset >= buffer.length) {
      return { value: '', length: 0 };
    }
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) {
      end++;
    }
    const value = buffer.toString('ascii', offset, end);
    // Count the NULL terminator only if one was actually present; a string that
    // runs to the end of the buffer without a terminator consumes only its bytes.
    const length = end < buffer.length ? end - offset + 1 : end - offset;
    return { value, length };
  }

  /**
   * Decode PDU header
   */
  static decodePDUHeader(buffer: Buffer): PDU | null {
    if (buffer.length < SMPP_HEADER_LENGTH) {
      return null;
    }

    const command_length = buffer.readUInt32BE(0);
    const command_id = buffer.readUInt32BE(4);
    const command_status = buffer.readUInt32BE(8);
    const sequence_number = buffer.readUInt32BE(12);

    // Reject structurally invalid lengths BEFORE any framing decision. A
    // command_length below the 16-octet header (e.g. 0) would otherwise let the
    // caller advance zero bytes and spin forever; an absurd length would drive
    // unbounded buffering. Per spec the peer must be answered with a
    // generic_nack/ESME_RINVCMDLEN and the connection torn down - the caller
    // turns this thrown error into exactly that.
    if (command_length < SMPP_HEADER_LENGTH || command_length > MAX_PDU_LENGTH) {
      throw new InvalidPDUError(
        `Invalid command_length ${command_length} (must be ${SMPP_HEADER_LENGTH}..${MAX_PDU_LENGTH})`
      );
    }

    if (buffer.length < command_length) {
      return null; // Incomplete PDU - wait for more data
    }

    if (command_length > SMPP_HEADER_LENGTH) {
      return {
        command_length,
        command_id,
        command_status,
        sequence_number,
        body: buffer.slice(16, command_length),
      };
    }

    return {
      command_length,
      command_id,
      command_status,
      sequence_number,
    };
  }

  /**
   * Decode BIND_*_RESP PDU
   * SMPP v5 Spec Section 4.1.1.2, Table 4-2: bind_transmitter_resp PDU
   * May contain optional sc_interface_version TLV (0x0210)
   */
  static decodeBindResp(pdu: PDU): { system_id: string; sc_interface_version?: number } {
    if (!pdu.body) {
      return { system_id: '' };
    }

    let offset = 0;
    const { value: system_id, length } = this.decodeCString(pdu.body, offset);
    offset += length;
    
    // Decode optional TLVs (may include sc_interface_version)
    if (offset < pdu.body.length) {
      const tlvs = this.decodeTLVs(pdu.body, offset);
      const scVersionTlv = tlvs.find(t => t.tag === TLVTag.SC_INTERFACE_VERSION);
      
      const result: { system_id: string; sc_interface_version?: number } = { system_id };
      if (scVersionTlv && scVersionTlv.value.length > 0) {
        result.sc_interface_version = scVersionTlv.value.readUInt8(0);
      }
      return result;
    }
    
    return { system_id };
  }

  /**
   * Decode SUBMIT_SM_RESP PDU
   */
  static decodeSubmitSMResp(pdu: PDU): { message_id: string } {
    if (!pdu.body) {
      return { message_id: '' };
    }

    const { value: message_id } = this.decodeCString(pdu.body, 0);
    return { message_id };
  }

  /**
   * Decode DELIVER_SM PDU
   */
  static decodeDeliverSM(pdu: PDU): DeliverSMParams | null {
    if (!pdu.body) {
      return null;
    }

    let offset = 0;
    const body = pdu.body;

    // service_type
    const service_type_result = this.decodeCString(body, offset);
    offset += service_type_result.length;

    // source address
    const source_addr_ton = body[offset++];
    const source_addr_npi = body[offset++];
    const source_addr_result = this.decodeCString(body, offset);
    offset += source_addr_result.length;

    // destination address
    const dest_addr_ton = body[offset++];
    const dest_addr_npi = body[offset++];
    const dest_addr_result = this.decodeCString(body, offset);
    offset += dest_addr_result.length;

    // esm_class
    const esm_class = body[offset++];

    // protocol_id
    const protocol_id = body[offset++];

    // priority_flag
    const priority_flag = body[offset++];

    // schedule_delivery_time
    const schedule_delivery_time_result = this.decodeCString(body, offset);
    offset += schedule_delivery_time_result.length;

    // validity_period
    const validity_period_result = this.decodeCString(body, offset);
    offset += validity_period_result.length;

    // registered_delivery
    const registered_delivery = body[offset++];

    // replace_if_present_flag
    const replace_if_present_flag = body[offset++];

    // data_coding
    const data_coding = body[offset++];

    // sm_default_msg_id
    const sm_default_msg_id = body[offset++];

    // sm_length
    const sm_length = body[offset];
    if (sm_length === undefined) return null;
    offset++;

    // short_message - clamp to the bytes actually available so a bogus
    // sm_length cannot overshoot and silently drop the trailing TLVs.
    const available = Math.max(0, body.length - offset);
    const actualLen = Math.min(sm_length, available);
    const short_message = body.slice(offset, offset + actualLen);
    offset += actualLen;

    // Optional TLVs may follow (SMPP v5 Spec Section 4.3.1, Table 4-24)
    const tlvs = offset < body.length ? this.decodeTLVs(body, offset) : [];
    
    // Extract common TLVs into convenience fields
    const message_payload_tlv = tlvs.find(t => t.tag === TLVTag.MESSAGE_PAYLOAD);
    const receipted_msg_id_tlv = tlvs.find(t => t.tag === TLVTag.RECEIPTED_MESSAGE_ID);
    const message_state_tlv = tlvs.find(t => t.tag === TLVTag.MESSAGE_STATE);
    const network_error_tlv = tlvs.find(t => t.tag === TLVTag.NETWORK_ERROR_CODE);
    const user_msg_ref_tlv = tlvs.find(t => t.tag === TLVTag.USER_MESSAGE_REFERENCE);
    const source_port_tlv = tlvs.find(t => t.tag === TLVTag.SOURCE_PORT);
    const dest_port_tlv = tlvs.find(t => t.tag === TLVTag.DESTINATION_PORT);

    // Build result object with all fields at once (readonly properties)
    const result: DeliverSMParams = {
      service_type: service_type_result.value,
      source_addr_ton: (source_addr_ton ?? 0) as TON,
      source_addr_npi: (source_addr_npi ?? 0) as NPI,
      source_addr: source_addr_result.value,
      dest_addr_ton: (dest_addr_ton ?? 0) as TON,
      dest_addr_npi: (dest_addr_npi ?? 0) as NPI,
      destination_addr: dest_addr_result.value,
      esm_class: (esm_class ?? 0) as ESMClassValue,
      protocol_id: protocol_id ?? 0,
      priority_flag: priority_flag ?? 0,
      schedule_delivery_time: schedule_delivery_time_result.value,
      validity_period: validity_period_result.value,
      registered_delivery: registered_delivery ?? 0,
      replace_if_present_flag: replace_if_present_flag ?? 0,
      data_coding: (data_coding ?? 0) as DataCoding,
      sm_default_msg_id: sm_default_msg_id ?? 0,
      sm_length,
      short_message,
      // Optional TLV fields
      ...(tlvs.length > 0 && { tlvs }),
      ...(message_payload_tlv && { message_payload: message_payload_tlv.value }),
      ...(receipted_msg_id_tlv && { receipted_message_id: receipted_msg_id_tlv.value.toString('ascii').replace(/\0/g, '') }),
      ...(message_state_tlv && message_state_tlv.value.length > 0 && { message_state: message_state_tlv.value.readUInt8(0) }),
      ...(network_error_tlv && { network_error_code: network_error_tlv.value }),
      ...(user_msg_ref_tlv && user_msg_ref_tlv.value.length >= 2 && { user_message_reference: user_msg_ref_tlv.value.readUInt16BE(0) }),
      ...(source_port_tlv && source_port_tlv.value.length >= 2 && { source_port: source_port_tlv.value.readUInt16BE(0) }),
      ...(dest_port_tlv && dest_port_tlv.value.length >= 2 && { destination_port: dest_port_tlv.value.readUInt16BE(0) }),
    };
    
    return result;
  }

  /**
   * Decode DATA_SM PDU (MC-initiated delivery request received by the ESME)
   * SMPP v5 Spec Section 4.7.1, Table 4-16
   */
  static decodeDataSM(pdu: PDU): DataSMParams | null {
    if (!pdu.body) {
      return null;
    }

    let offset = 0;
    const body = pdu.body;

    const service_type_result = this.decodeCString(body, offset);
    offset += service_type_result.length;

    const source_addr_ton = body[offset++];
    const source_addr_npi = body[offset++];
    const source_addr_result = this.decodeCString(body, offset);
    offset += source_addr_result.length;

    const dest_addr_ton = body[offset++];
    const dest_addr_npi = body[offset++];
    const dest_addr_result = this.decodeCString(body, offset);
    offset += dest_addr_result.length;

    const esm_class = body[offset++];
    const registered_delivery = body[offset++];
    const data_coding = body[offset++];

    // data_sm conveys its message content (if any) via TLVs (message_payload).
    const tlvs = offset < body.length ? this.decodeTLVs(body, offset) : [];

    return {
      service_type: service_type_result.value,
      source_addr_ton: (source_addr_ton ?? 0) as TON,
      source_addr_npi: (source_addr_npi ?? 0) as NPI,
      source_addr: source_addr_result.value,
      dest_addr_ton: (dest_addr_ton ?? 0) as TON,
      dest_addr_npi: (dest_addr_npi ?? 0) as NPI,
      destination_addr: dest_addr_result.value,
      esm_class: (esm_class ?? 0) as ESMClassValue,
      registered_delivery: registered_delivery ?? 0,
      data_coding: (data_coding ?? 0) as DataCoding,
      ...(tlvs.length > 0 && { tlvs }),
    };
  }

  /**
   * Decode TLV parameters from PDU body
   */
  static decodeTLVs(buffer: Buffer, offset: number = 0): TLV[] {
    const tlvs: TLV[] = [];
    
    while (offset + 4 <= buffer.length) {
      const tag = buffer.readUInt16BE(offset);
      const length = buffer.readUInt16BE(offset + 2);
      
      if (offset + 4 + length > buffer.length) {
        break; // Incomplete TLV
      }
      
      const value = buffer.slice(offset + 4, offset + 4 + length);
      tlvs.push({ tag, length, value });
      
      offset += 4 + length;
    }
    
    return tlvs;
  }

  /**
   * Get command name from command ID
   */
  static getCommandName(command_id: number): string {
    const names: Record<number, string> = {
      [CommandId.GENERIC_NACK]: 'GENERIC_NACK',
      [CommandId.BIND_RECEIVER]: 'BIND_RECEIVER',
      [CommandId.BIND_RECEIVER_RESP]: 'BIND_RECEIVER_RESP',
      [CommandId.BIND_TRANSMITTER]: 'BIND_TRANSMITTER',
      [CommandId.BIND_TRANSMITTER_RESP]: 'BIND_TRANSMITTER_RESP',
      [CommandId.QUERY_SM]: 'QUERY_SM',
      [CommandId.QUERY_SM_RESP]: 'QUERY_SM_RESP',
      [CommandId.SUBMIT_SM]: 'SUBMIT_SM',
      [CommandId.SUBMIT_SM_RESP]: 'SUBMIT_SM_RESP',
      [CommandId.DELIVER_SM]: 'DELIVER_SM',
      [CommandId.DELIVER_SM_RESP]: 'DELIVER_SM_RESP',
      [CommandId.UNBIND]: 'UNBIND',
      [CommandId.UNBIND_RESP]: 'UNBIND_RESP',
      [CommandId.REPLACE_SM]: 'REPLACE_SM',
      [CommandId.REPLACE_SM_RESP]: 'REPLACE_SM_RESP',
      [CommandId.CANCEL_SM]: 'CANCEL_SM',
      [CommandId.CANCEL_SM_RESP]: 'CANCEL_SM_RESP',
      [CommandId.BIND_TRANSCEIVER]: 'BIND_TRANSCEIVER',
      [CommandId.BIND_TRANSCEIVER_RESP]: 'BIND_TRANSCEIVER_RESP',
      [CommandId.OUTBIND]: 'OUTBIND',
      [CommandId.ENQUIRE_LINK]: 'ENQUIRE_LINK',
      [CommandId.ENQUIRE_LINK_RESP]: 'ENQUIRE_LINK_RESP',
      [CommandId.SUBMIT_MULTI]: 'SUBMIT_MULTI',
      [CommandId.SUBMIT_MULTI_RESP]: 'SUBMIT_MULTI_RESP',
      [CommandId.ALERT_NOTIFICATION]: 'ALERT_NOTIFICATION',
      [CommandId.DATA_SM]: 'DATA_SM',
      [CommandId.DATA_SM_RESP]: 'DATA_SM_RESP',
      [CommandId.BROADCAST_SM]: 'BROADCAST_SM',
      [CommandId.BROADCAST_SM_RESP]: 'BROADCAST_SM_RESP',
      [CommandId.QUERY_BROADCAST_SM]: 'QUERY_BROADCAST_SM',
      [CommandId.QUERY_BROADCAST_SM_RESP]: 'QUERY_BROADCAST_SM_RESP',
      [CommandId.CANCEL_BROADCAST_SM]: 'CANCEL_BROADCAST_SM',
      [CommandId.CANCEL_BROADCAST_SM_RESP]: 'CANCEL_BROADCAST_SM_RESP',
    };
    return names[command_id] || `UNKNOWN(0x${command_id.toString(16)})`;
  }

  /**
   * Get status name from status code
   */
  static getStatusName(status: number): string {
    // CommandStatus is a numeric enum, so the reverse mapping yields the name
    // for every spec-defined code (not just a hand-maintained subset).
    const name = CommandStatus[status];
    return name ?? `UNKNOWN(0x${status.toString(16).toUpperCase().padStart(8, '0')})`;
  }

  /**
   * Decode QUERY_SM_RESP PDU (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  static decodeQuerySMResp(pdu: PDU): QuerySMResp | null {
    if (!pdu.body) return null;

    let offset = 0;
    const body = pdu.body;

    const message_id_result = this.decodeCString(body, offset);
    offset += message_id_result.length;

    const final_date_result = this.decodeCString(body, offset);
    offset += final_date_result.length;

    const message_state = body[offset++];
    const error_code = body[offset++];

    return {
      message_id: message_id_result.value,
      final_date: final_date_result.value,
      message_state: message_state ?? 0,
      error_code: error_code ?? 0,
    };
  }

  /**
   * Decode SUBMIT_MULTI_RESP PDU (Optional Operation)
   * SMPP v5 Spec Section 4.4.1
   */
  static decodeSubmitMultiResp(pdu: PDU): SubmitMultiResp | null {
    if (!pdu.body) return null;

    let offset = 0;
    const body = pdu.body;

    const message_id_result = this.decodeCString(body, offset);
    offset += message_id_result.length;

    const no_unsuccess = body[offset++];
    const unsuccessful_smes: Array<{
      dest_addr_ton: TON;
      dest_addr_npi: NPI;
      destination_addr: string;
      error_status_code: number;
    }> = [];

    for (let i = 0; i < (no_unsuccess ?? 0); i++) {
      const dest_addr_ton = body[offset++];
      const dest_addr_npi = body[offset++];
      const dest_addr_result = this.decodeCString(body, offset);
      offset += dest_addr_result.length;

      // Stop if the (untrusted) no_unsuccess count over-claims and there aren't
      // 4 octets left for error_status_code - avoids a RangeError throw.
      if (offset + 4 > body.length) break;
      const error_status_code = body.readUInt32BE(offset);
      offset += 4;

      unsuccessful_smes.push({
        dest_addr_ton: (dest_addr_ton ?? 0) as TON,
        dest_addr_npi: (dest_addr_npi ?? 0) as NPI,
        destination_addr: dest_addr_result.value,
        error_status_code,
      });
    }

    return {
      message_id: message_id_result.value,
      ...(unsuccessful_smes.length > 0 && { unsuccessful_smes }),
    };
  }

  /**
   * Decode DATA_SM_RESP PDU (Optional Operation)
   * SMPP v5 Spec Section 4.7.1
   */
  static decodeDataSMResp(pdu: PDU): DataSMResp | null {
    if (!pdu.body) return null;

    let offset = 0;
    const body = pdu.body;

    const message_id_result = this.decodeCString(body, offset);
    offset += message_id_result.length;

    // Optional TLVs may follow
    const tlvs = offset < body.length ? this.decodeTLVs(body, offset) : [];

    return {
      message_id: message_id_result.value,
      ...(tlvs.length > 0 && { tlvs }),
    };
  }

  /**
   * Decode ALERT_NOTIFICATION PDU (Optional Operation - MC to ESME)
   * SMPP v5 Spec Section 4.12.1
   */
  static decodeAlertNotification(pdu: PDU): AlertNotificationParams | null {
    if (!pdu.body) return null;

    let offset = 0;
    const body = pdu.body;

    const source_addr_ton = body[offset++];
    const source_addr_npi = body[offset++];
    const source_addr_result = this.decodeCString(body, offset);
    offset += source_addr_result.length;

    const esme_addr_ton = body[offset++];
    const esme_addr_npi = body[offset++];
    const esme_addr_result = this.decodeCString(body, offset);
    offset += esme_addr_result.length;

    // Optional TLVs may follow
    const tlvs = offset < body.length ? this.decodeTLVs(body, offset) : [];

    return {
      source_addr_ton: (source_addr_ton ?? 0) as TON,
      source_addr_npi: (source_addr_npi ?? 0) as NPI,
      source_addr: source_addr_result.value,
      esme_addr_ton: (esme_addr_ton ?? 0) as TON,
      esme_addr_npi: (esme_addr_npi ?? 0) as NPI,
      esme_addr: esme_addr_result.value,
      ...(tlvs.length > 0 && { tlvs }),
    };
  }

  /**
   * Decode OUTBIND PDU (Optional Operation - MC to ESME)
   * SMPP v5 Spec Section 4.1.1.7
   */
  static decodeOutbind(pdu: PDU): OutbindParams | null {
    if (!pdu.body) return null;

    let offset = 0;
    const system_id_result = this.decodeCString(pdu.body, offset);
    offset += system_id_result.length;

    const password_result = this.decodeCString(pdu.body, offset);

    return {
      system_id: system_id_result.value,
      password: password_result.value,
    };
  }

  /**
   * Decode BROADCAST_SM_RESP PDU (Optional Operation)
   * SMPP v5 Spec Section 4.4.1
   */
  static decodeBroadcastSMResp(pdu: PDU): BroadcastSMResp | null {
    if (!pdu.body) return null;

    let offset = 0;
    const message_id_result = this.decodeCString(pdu.body, offset);
    offset += message_id_result.length;

    // Optional TLVs may follow
    const tlvs = offset < pdu.body.length ? this.decodeTLVs(pdu.body, offset) : [];

    return {
      message_id: message_id_result.value,
      ...(tlvs.length > 0 && { tlvs }),
    };
  }

  /**
   * Decode QUERY_BROADCAST_SM_RESP PDU (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  static decodeQueryBroadcastSMResp(pdu: PDU): QueryBroadcastSMResp | null {
    if (!pdu.body) return null;

    let offset = 0;
    const message_id_result = this.decodeCString(pdu.body, offset);
    offset += message_id_result.length;

    // In query_broadcast_sm_resp, message_state is a TLV (0x0427), NOT a fixed
    // mandatory octet. Everything after message_id is the TLV stream (which also
    // carries broadcast_area_identifier 0x0606 and broadcast_area_success 0x0608).
    const tlvs = offset < pdu.body.length ? this.decodeTLVs(pdu.body, offset) : [];
    const messageStateTlv = tlvs.find(t => t.tag === TLVTag.MESSAGE_STATE);
    const message_state =
      messageStateTlv && messageStateTlv.value.length > 0
        ? messageStateTlv.value.readUInt8(0)
        : 0;

    return {
      message_id: message_id_result.value,
      message_state,
      ...(tlvs.length > 0 && { tlvs }),
    };
  }
}
