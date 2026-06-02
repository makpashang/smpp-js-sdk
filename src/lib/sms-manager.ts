/**
 * SMPP SMS Manager
 * High-level interface for sending and receiving SMS with queue management
 */

import { EventEmitter } from "node:events";
import { SMPPClient } from "./client.js";
import { MessageQueue, RateLimiter, type QueueStats } from "./queue.js";
import type {
  SMPPConfig,
  SubmitSMParams,
  DeliverSMParams,
  TON,
  NPI,
  DataCoding,
  Logger,
} from "./types.js";

/**
 * GSM 03.38 default alphabet, used for data_coding 0x00 (MC default alphabet).
 * The 128-character basic set maps Unicode <-> single GSM octets; ten characters
 * live in an extension table reached via the ESC (0x1B) prefix. This is the
 * character mapping only - septet bit-packing happens at the air interface, not
 * in the SMPP short_message field.
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM_EXTENSION: Record<string, number> = {
  "\f": 0x0a, "^": 0x14, "{": 0x28, "}": 0x29, "\\": 0x2f,
  "[": 0x3c, "~": 0x3d, "]": 0x3e, "|": 0x40, "€": 0x65,
};

const GSM_BASIC_REVERSE = new Map<string, number>();
for (let i = 0; i < GSM_BASIC.length; i++) GSM_BASIC_REVERSE.set(GSM_BASIC[i]!, i);
const GSM_EXTENSION_REVERSE = new Map<number, string>();
for (const [ch, code] of Object.entries(GSM_EXTENSION)) GSM_EXTENSION_REVERSE.set(code, ch);

/** Encode a string to GSM 03.38 octets. Unsupported characters become '?'. */
function encodeGsm0338(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    if (ch === "") { bytes.push(0x3f); continue; } // never emit a bare ESC
    const basic = GSM_BASIC_REVERSE.get(ch);
    if (basic !== undefined) { bytes.push(basic); continue; }
    const ext = GSM_EXTENSION[ch];
    if (ext !== undefined) { bytes.push(0x1b, ext); continue; }
    bytes.push(0x3f); // '?' for characters outside the GSM alphabet
  }
  return Buffer.from(bytes);
}

/** Decode GSM 03.38 octets back to a string. */
function decodeGsm0338(buf: Buffer): string {
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    if (b === 0x1b) {
      const next = buf[i + 1];
      if (next !== undefined && GSM_EXTENSION_REVERSE.has(next)) {
        out += GSM_EXTENSION_REVERSE.get(next);
        i++;
        continue;
      }
      out += " "; // lone ESC -> display as space
      continue;
    }
    if (b < GSM_BASIC.length) out += GSM_BASIC[b];
  }
  return out;
}

/**
 * Simplified SMS parameters
 */
export interface SMSParams {
  readonly to: string;
  readonly message: string;
  readonly from?: string;
  readonly priority?: number;
  readonly requestDeliveryReceipt?: boolean;
  readonly validityPeriod?: string;
  readonly dataCoding?: DataCoding;
  readonly destTon?: TON;
  readonly destNpi?: NPI;
  readonly sourceTon?: TON;
  readonly sourceNpi?: NPI;
}

/**
 * Received SMS message
 */
export interface ReceivedSMS {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly isDeliveryReceipt: boolean;
  readonly raw: DeliverSMParams;
}

/**
 * Delivery receipt information
 */
export interface DeliveryReceipt {
  readonly messageId: string;
  readonly status: string;
  readonly error?: string;
  readonly timestamp: Date;
}

/**
 * SMS Manager configuration
 */
export interface SMSManagerConfig extends SMPPConfig {
  readonly defaultFrom?: string;
  readonly queueEnabled?: boolean;
  readonly queueMaxSize?: number;
  readonly queueMaxRetries?: number;
  readonly rateLimitPerSecond?: number;
  readonly rateLimitBurst?: number;
  readonly autoProcessQueue?: boolean;
  readonly deliveryReceiptHandler?: (receipt: DeliveryReceipt) => void;
}

/**
 * SMS Manager with Queue and Rate Limiting
 */
export class SMSManager extends EventEmitter {
  readonly #client: SMPPClient;
  readonly #config: SMSManagerConfig;
  readonly #queue: MessageQueue;
  readonly #rateLimiter: RateLimiter;
  readonly #logger: Logger;

  #isProcessingQueue = false;
  #queueProcessingInterval: NodeJS.Timeout | null = null;

  /**
   * Create a relative validity period (SMPP v5 Spec Section 4.7.29)
   * 
   * @param value - Time value (e.g., 24 for 24 hours)
   * @param unit - Time unit: 'minutes', 'hours', or 'days' (default: 'hours')
   * @returns Formatted validity period (16-character string "YYMMDDhhmmss000R")
   * 
   * @example
   * // 24 hours from now
   * SMSManager.createRelativeValidityPeriod(24, 'hours')
   * 
   * @example
   * // 30 minutes from now
   * SMSManager.createRelativeValidityPeriod(30, 'minutes')
   * 
   * @example
   * // 7 days from now
   * SMSManager.createRelativeValidityPeriod(7, 'days')
   */
  static createRelativeValidityPeriod(
    value: number,
    unit: "minutes" | "hours" | "days" = "hours"
  ): string {
    let years = 0;
    let months = 0;
    let days = 0;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    // Convert value to appropriate time components
    // Format: YYMMDDhhmmss000R
    switch (unit) {
      case "minutes":
        if (value < 1 || value > 1440) {
          throw new Error("Relative validity period minutes must be between 1 and 1440 (24 hours)");
        }
        if (value >= 60) {
          hours = Math.floor(value / 60);
          minutes = value % 60;
        } else {
          minutes = value;
        }
        break;

      case "hours":
        if (value < 1 || value > 99) {
          throw new Error("Relative validity period hours must be between 1 and 99");
        }
        hours = value;
        break;

      case "days":
        if (value < 1 || value > 30) {
          throw new Error("Relative validity period days must be between 1 and 30");
        }
        days = value;
        break;

      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }

    // Format: YYMMDDhhmmss000R
    return (
      String(years).padStart(2, "0") +
      String(months).padStart(2, "0") +
      String(days).padStart(2, "0") +
      String(hours).padStart(2, "0") +
      String(minutes).padStart(2, "0") +
      String(seconds).padStart(2, "0") +
      "000R"
    );
  }

  /**
   * Encode Message Waiting Indication data_coding
   * SMPP v5 Spec Section 4.7.7 (Data Coding - MWI Group 0xC0-0xDF)
   * 
   * Message Waiting Indication allows SMS to activate/deactivate indicators
   * on the mobile device without storing the message text.
   * 
   * @param type - Type of waiting message (voicemail, fax, email, other)
   * @param action - Action to perform ('set' activates indicator, 'clear' deactivates)
   * @param store - Whether to store the message (default: false for 'discard')
   * @returns Data coding value for MWI
   * 
   * @example
   * // Activate voicemail indicator (discard message)
   * const mwiVoicemail = SMSManager.encodeMWI('voicemail', 'set');
   * 
   * @example
   * // Clear email indicator (store message)
   * const mwiEmailClear = SMSManager.encodeMWI('email', 'clear', true);
   */
  static encodeMWI(
    type: "voicemail" | "fax" | "email" | "other",
    action: "set" | "clear",
    store = false
  ): number {
    // Base codes for each type (discard message, set indication active)
    const baseDiscardSet: Record<string, number> = {
      voicemail: 0xc0,
      fax: 0xc1,
      email: 0xc2,
      other: 0xc3,
    };

    // Base codes for store message, set indication active
    const baseStoreSet: Record<string, number> = {
      voicemail: 0xc4,
      fax: 0xc5,
      email: 0xc6,
      other: 0xc7,
    };

    // Base codes for store message, set indication inactive (clear)
    const baseStoreClear: Record<string, number> = {
      voicemail: 0xc8,
      fax: 0xc9,
      email: 0xca,
      other: 0xcb,
    };

    if (action === "clear") {
      // Clear action always stores the message per SMPP v5 spec
      return baseStoreClear[type]!;
    } else {
      // Set action - choose based on store flag
      return store ? baseStoreSet[type]! : baseDiscardSet[type]!;
    }
  }

  /**
   * Create an absolute validity period (SMPP v5 Spec Section 4.7.29)
   * @param date - Absolute expiry date/time
   * @param utcOffset - UTC offset in quarter-hours, integer in [-48, 48] (default: 0 for UTC)
   * @returns Formatted validity period (16-character string "YYMMDDhhmmsstnnp")
   * @example
   * SMSManager.createAbsoluteValidityPeriod(new Date('2025-12-31T23:59:00Z'))
   */
  static createAbsoluteValidityPeriod(date: Date, utcOffset = 0): string {
    // Format: "YYMMDDhhmmsstnnp" (16 chars)
    // YY = year, MM = month, DD = day, hh = hour, mm = minute, ss = second
    // t = tenths of second (1 digit), nn = UTC offset in quarter-hours (2 digits),
    // p = sign (+/-). Validate utcOffset so nn is always exactly 2 digits and the
    // output stays a fixed 16 characters.
    if (!Number.isInteger(utcOffset) || Math.abs(utcOffset) > 48) {
      throw new Error(
        "utcOffset must be an integer number of quarter-hours in the range [-48, 48]"
      );
    }

    const year = date.getUTCFullYear() % 100;
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const tenths = Math.floor(date.getUTCMilliseconds() / 100);
    
    const offsetAbs = Math.abs(utcOffset);
    const offsetSign = utcOffset >= 0 ? "+" : "-";
    
    return (
      year.toString().padStart(2, "0") +
      month.toString().padStart(2, "0") +
      day.toString().padStart(2, "0") +
      hours.toString().padStart(2, "0") +
      minutes.toString().padStart(2, "0") +
      seconds.toString().padStart(2, "0") +
      tenths.toString() +
      offsetAbs.toString().padStart(2, "0") +
      offsetSign
    );
  }

  constructor(config: SMSManagerConfig) {
    super();

    this.#config = {
      queueEnabled: true,
      queueMaxSize: 10000,
      queueMaxRetries: 3,
      rateLimitPerSecond: 10,
      rateLimitBurst: 20,
      autoProcessQueue: true,
      ...config,
    };

    this.#logger = config.logger ?? {
      debug: (msg, meta) => { if (config.debug) console.log(`[DEBUG] ${msg}`, meta ?? ""); },
      info: (msg, meta) => console.log(`[INFO] ${msg}`, meta ?? ""),
      warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta ?? ""),
      error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ?? ""),
    };

    this.#client = new SMPPClient(config);
    this.#queue = new MessageQueue({
      maxSize: this.#config.queueMaxSize!,
      maxRetries: this.#config.queueMaxRetries!,
      logger: this.#logger,
    });

    this.#rateLimiter = new RateLimiter(
      this.#config.rateLimitPerSecond!,
      this.#config.rateLimitBurst!
    );

    this.#setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  #setupEventHandlers(): void {
    // Forward client events
    this.#client.on("connect", () => this.emit("connect"));
    this.#client.on("disconnect", () => this.emit("disconnect"));
    this.#client.on("bind", (data) => this.emit("bind", data));
    this.#client.on("unbind", () => this.emit("unbind"));
    // Re-emit errors, but guard against the EventEmitter crash when no 'error'
    // listener is attached (emitting 'error' with no listener throws). Log it
    // either way so a failure is never silently lost.
    this.#client.on("error", (error) => {
      this.#logger.error("SMPP client error", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.listenerCount("error") > 0) {
        this.emit("error", error);
      }
    });

    this.#client.on("reconnecting", (data) => {
      this.emit("reconnecting", data);
      this.#stopQueueProcessing();
    });

    this.#client.on("reconnected", () => {
      this.emit("reconnected");
      if (this.#config.autoProcessQueue) {
        this.#startQueueProcessing();
      }
    });

    // Handle incoming messages
    this.#client.on("deliver_sm", (pdu: DeliverSMParams) => {
      this.#handleIncomingSMS(pdu);
    });
  }

  /**
   * Connect to SMPP server
   */
  async connect(): Promise<void> {
    await this.#client.connect("transceiver");

    if (this.#config.autoProcessQueue) {
      this.#startQueueProcessing();
    }
  }

  /**
   * Disconnect from SMPP server
   */
  async disconnect(): Promise<void> {
    this.#stopQueueProcessing();
    await this.#client.disconnect();
  }

  /**
   * Send SMS (with automatic queuing if not connected)
   */
  async sendSMS(params: SMSParams): Promise<string> {
    // Validate parameters
    this.#validateSMSParams(params);

    // Convert to SMPP format
    const smppParams = this.#convertToSMPPParams(params);

    // If connected and queue is enabled, use queue
    if (this.#config.queueEnabled) {
      return this.#queue.enqueue(smppParams, params.priority ?? 1);
    }

    // Otherwise send directly
    return this.#sendDirectly(smppParams);
  }

  /**
   * Send SMS directly (bypass queue)
   */
  async sendSMSDirect(params: SMSParams): Promise<string> {
    this.#validateSMSParams(params);
    const smppParams = this.#convertToSMPPParams(params);
    return this.#sendDirectly(smppParams);
  }

  /**
   * Send multiple SMS messages
   */
  async sendBulkSMS(
    messages: SMSParams[]
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    const results = await Promise.allSettled(
      messages.map((msg) => this.sendSMS(msg))
    );

    return results.map((result) => {
      if (result.status === "fulfilled") {
        return { success: true, messageId: result.value };
      } else {
        return { success: false, error: result.reason.message };
      }
    });
  }

  /**
   * Process message queue
   */
  #startQueueProcessing(): void {
    if (this.#isProcessingQueue) return;

    this.#isProcessingQueue = true;
    this.#queueProcessingInterval = setInterval(() => {
      this.#processQueue().catch((err) => {
        this.#logger.error("Queue processing error", err);
      });
    }, 100);

    this.#logger.info("Started queue processing");
  }

  /**
   * Stop processing queue
   */
  #stopQueueProcessing(): void {
    if (this.#queueProcessingInterval) {
      clearInterval(this.#queueProcessingInterval);
      this.#queueProcessingInterval = null;
    }
    this.#isProcessingQueue = false;
    this.#logger.info("Stopped queue processing");
  }

  /**
   * Process queued messages with retry logic
   */
  async #processQueue(): Promise<void> {
    if (!this.#client.isConnected()) {
      this.#logger.debug("Queue processing skipped - not connected to SMPP server");
      return;
    }

    if (this.#queue.isEmpty) {
      return;
    }

    // Rate limiting check
    if (!this.#rateLimiter.tryConsume()) {
      this.#logger.debug("Rate limit reached - waiting for token", {
        availableTokens: this.#rateLimiter.availableTokens,
      });
      return;
    }

    const message = this.#queue.dequeue();
    if (!message) return;

    this.#logger.debug("Processing queued message", {
      messageId: message.id,
      attempt: message.retryCount + 1,
      priority: message.priority,
      queueSize: this.#queue.size,
    });

    try {
      const messageId = await this.#client.submitSM(message.params);
      
      this.#queue.markSuccess(message, messageId);
      
      this.#logger.info("Queued message sent successfully", {
        queueMessageId: message.id,
        smppMessageId: messageId,
        destination: message.params.destination_addr,
        attempt: message.retryCount + 1,
      });

      this.emit("sms_sent", { messageId, params: message.params });
    } catch (error) {
      const err = error as Error;
      const errorMessage = err.message;

      this.#logger.warn("Queued message failed", {
        messageId: message.id,
        error: errorMessage,
        attempt: message.retryCount + 1,
        destination: message.params.destination_addr,
      });

      // Check if error is retryable
      if (this.#isRetryableError(errorMessage)) {
        this.#logger.warn(
          `Message will be retried (attempt ${message.retryCount + 2})`,
          {
            messageId: message.id,
            error: errorMessage,
            isRetryable: true,
            maxRetries: this.#config.queueMaxRetries,
          }
        );

        this.#queue.requeue(message, errorMessage);

        this.emit("sms_retry", {
          messageId: message.id,
          attempt: message.retryCount + 1,
          error: errorMessage,
          willRetry: message.retryCount + 1 < (this.#config.queueMaxRetries ?? 3),
        });
      } else {
        // Non-retryable error, fail permanently. Use markFailed so the caller's
        // promise REJECTS (markSuccess would resolve it with "" - a fake id -
        // making a permanent failure look like a successful send).
        this.#logger.error("Message failed permanently - non-retryable error", {
          messageId: message.id,
          error: errorMessage,
          isRetryable: false,
          destination: message.params.destination_addr,
        });

        this.#queue.markFailed(message, err);

        this.emit("sms_failed", {
          messageId: message.id,
          error: errorMessage,
          permanent: true,
          destination: message.params.destination_addr,
        });
      }
    }
  }

  /**
   * Send message directly
   */
  async #sendDirectly(params: SubmitSMParams): Promise<string> {
    if (!this.#client.isConnected()) {
      throw new Error("Not connected to SMPP server");
    }

    // Rate limiting
    await this.#rateLimiter.waitForToken();

    const messageId = await this.#client.submitSM(params);
    this.emit("sms_sent", { messageId, params });
    return messageId;
  }

  /**
   * Handle incoming SMS
   */
  #handleIncomingSMS(pdu: DeliverSMParams): void {
    const isDeliveryReceipt = (pdu.esm_class & 0x04) !== 0;

    if (isDeliveryReceipt) {
      const receipt = this.#parseDeliveryReceipt(pdu);
      this.emit("delivery_receipt", receipt);
      this.#config.deliveryReceiptHandler?.(receipt);
    } else {
      const sms = this.#parseReceivedSMS(pdu);
      this.emit("sms_received", sms);
    }
  }

  /**
   * Parse received SMS
   */
  #parseReceivedSMS(pdu: DeliverSMParams): ReceivedSMS {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      from: pdu.source_addr,
      to: pdu.destination_addr,
      message: this.#decodeMessage(pdu.short_message, pdu.data_coding),
      timestamp: new Date(),
      isDeliveryReceipt: false,
      raw: pdu,
    };
  }

  /**
   * Parse delivery receipt (SMPP v5 Spec Section 4.4.1)
   * Priority: Check TLV parameters first (SMPP v3.4+), fallback to text parsing
   */
  #parseDeliveryReceipt(pdu: DeliverSMParams): DeliveryReceipt {
    // Try TLV parameters first (modern SMPP v3.4+ implementations)
    // SMPP v5 Spec Section 4.8.4 - TLV parameters are the recommended method
    if (pdu.receipted_message_id) {
      const messageState = pdu.message_state;
      const networkError = pdu.network_error_code;

      return {
        messageId: pdu.receipted_message_id,
        status: messageState !== undefined ? this.#mapMessageState(messageState) : "UNKNOWN",
        // network_error_code is a 3-octet buffer; ignore an empty/short one.
        ...(networkError && networkError.length >= 3
          ? { error: this.#formatNetworkError(networkError) }
          : {}),
        timestamp: new Date(),
      };
    }

    // Fallback to text parsing for legacy format
    // Format is product-specific per SMPP v5 spec, but this is the common format
    const text = pdu.short_message.toString("ascii");

    // Parse standard delivery receipt format
    // Example: "id:1234567890 sub:001 dlvrd:001 submit date:2101011200 done date:2101011201 stat:DELIVRD err:000"
    const idMatch = text.match(/id:(\S+)/);
    const statMatch = text.match(/stat:(\S+)/);
    const errMatch = text.match(/err:(\d+)/);

    const errorCode = errMatch?.[1];
    const hasError = errorCode && errorCode !== "000";

    return {
      messageId: idMatch?.[1] ?? "",
      status: statMatch?.[1] ?? "UNKNOWN",
      ...(hasError ? { error: errorCode } : {}),
      timestamp: new Date(),
    };
  }

  /**
   * Map message_state TLV value to status string
   * SMPP v5 Spec Section 4.7.15 - message_state values
   */
  #mapMessageState(state: number): string {
    const stateMap: Record<number, string> = {
      0: "SCHEDULED",        // Message is scheduled (SMPP v5.0)
      1: "ENROUTE",          // Message is in transit
      2: "DELIVERED",        // Message delivered to destination
      3: "EXPIRED",          // Message validity period has expired
      4: "DELETED",          // Message has been deleted
      5: "UNDELIVERABLE",    // Message is undeliverable
      6: "ACCEPTED",         // Message is in accepted state
      7: "UNKNOWN",          // Message is in unknown state
      8: "REJECTED",         // Message is rejected
      9: "SKIPPED",          // Message was skipped
    };
    return stateMap[state] ?? "UNKNOWN";
  }

  /**
   * Format network error code from TLV
   * SMPP v5 Spec Section 4.8.4.23 - network_error_code TLV
   */
  #formatNetworkError(errorBuffer: Buffer): string {
    if (errorBuffer.length < 3) return "000";
    
    // Format: network type (1 byte) + error code (2 bytes)
    const networkType = errorBuffer[0];
    const errorCode = errorBuffer.readUInt16BE(1);
    
    return `${networkType}:${errorCode.toString().padStart(4, "0")}`;
  }

  /**
   * Decode message based on data coding scheme
   * SMPP v5 Spec Section 4.7.7 (data_coding)
   */
  #decodeMessage(buffer: Buffer, dataCoding: number): string {
    switch (dataCoding) {
      case 0x00: // SMSC Default Alphabet (GSM 03.38)
        return decodeGsm0338(buffer);

      case 0x01: // IA5/ASCII (CCITT T.50/ANSI X3.4)
        return buffer.toString("ascii");
        
      case 0x02: // Octet unspecified (8-bit binary)
      case 0x04: // Octet unspecified (8-bit binary)
        // For binary data, try UTF-8 as fallback
        try {
          return buffer.toString("utf8");
        } catch {
          return buffer.toString("binary");
        }
        
      case 0x03: // Latin-1 (ISO-8859-1)
        return buffer.toString("latin1");
        
      case 0x05: // JIS (X 0208-1990)
        // Node.js doesn't have native JIS support, use UTF-8 as fallback
        this.#logger.warn("JIS encoding (0x05) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x06: // Cyrillic (ISO-8859-5)
        // Node.js doesn't have native ISO-8859-5 support
        // Most Cyrillic content is sent as UTF-8 nowadays
        this.#logger.warn("Cyrillic ISO-8859-5 (0x06) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x07: // Latin/Hebrew (ISO-8859-8)
        // Node.js doesn't have native ISO-8859-8 support
        this.#logger.warn("Latin/Hebrew ISO-8859-8 (0x07) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x08: // UCS-2 (ISO/IEC-10646)
        return buffer.toString("ucs2");
        
      case 0x09: // Pictogram Encoding
        this.#logger.warn("Pictogram encoding (0x09) not supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x0a: // ISO-2022-JP (Music Codes)
        this.#logger.warn("ISO-2022-JP (0x0a) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x0d: // Extended Kanji JIS (X 0212-1990)
        this.#logger.warn("Extended Kanji (0x0d) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      case 0x0e: // KS C 5601
        this.#logger.warn("KS C 5601 (0x0e) not natively supported, using UTF-8");
        return buffer.toString("utf8");
        
      default:
        // For GSM message class and other encodings, use UTF-8 as default
        return buffer.toString("utf8");
    }
  }

  /**
   * Encode message text to Buffer based on data_coding
   * SMPP v5 Spec Section 4.7.7 (data_coding)
   */
  #encodeMessage(message: string, dataCoding: number): Buffer {
    switch (dataCoding) {
      case 0x00: // SMSC Default alphabet (GSM 03.38)
        return encodeGsm0338(message);

      case 0x01: // IA5/ASCII
        return Buffer.from(message, "ascii");
        
      case 0x02: // Octet unspecified (8-bit binary)
      case 0x04: // Octet unspecified (8-bit binary)
        return Buffer.from(message, "binary");
        
      case 0x03: // Latin-1 (ISO-8859-1)
        return Buffer.from(message, "latin1");
        
      case 0x08: // UCS-2 (ISO/IEC-10646)
        return Buffer.from(message, "ucs2");
        
      case 0x05: // JIS
      case 0x06: // Cyrillic
      case 0x07: // Hebrew
      case 0x09: // Pictogram
      case 0x0a: // ISO-2022-JP
      case 0x0d: // Extended Kanji
      case 0x0e: // KS C 5601
        // For encodings not natively supported by Node.js, use UTF-8
        return Buffer.from(message, "utf8");
        
      default:
        // Default to UTF-8 for unknown encodings
        return Buffer.from(message, "utf8");
    }
  }

  /**
   * Convert SMS params to SMPP format
   * Handles proper encoding and message_payload TLV for long messages
   * SMPP v5 Spec Section 4.2.1 (submit_sm)
   */
  #convertToSMPPParams(params: SMSParams): SubmitSMParams {
    const from = params.from ?? this.#config.defaultFrom ?? "SMS";
    const dataCoding = params.dataCoding ?? 0x00;
    
    // Encode message based on data_coding
    const messageBuffer = this.#encodeMessage(params.message, dataCoding);
    const messageLength = messageBuffer.length;

    // SMPP v5 spec (Table 4-58): short_message / sm_length holds 1-255 octets;
    // message_payload must be used for user data larger than 255 octets.
    const useMessagePayload = messageLength > 255;

    if (useMessagePayload) {
      this.#logger.debug(
        `Message length (${messageLength} bytes) exceeds 255 bytes, using message_payload TLV`,
        {
          messageLength,
          dataCoding: `0x${dataCoding.toString(16).padStart(2, "0")}`,
        }
      );
    }

    // Build the SMPP parameters object
    // For long messages (> 254 bytes), use message_payload TLV instead of short_message
    return {
      source_addr: from,
      source_addr_ton:
        params.sourceTon ?? (this.#isNumeric(from) ? 0x01 : 0x05),
      source_addr_npi:
        params.sourceNpi ?? (this.#isNumeric(from) ? 0x01 : 0x00),
      destination_addr: params.to,
      dest_addr_ton: params.destTon ?? 0x01, // International
      dest_addr_npi: params.destNpi ?? 0x01, // ISDN
      data_coding: dataCoding,
      registered_delivery: params.requestDeliveryReceipt ? 1 : 0,
      validity_period: params.validityPeriod ?? "",
      
      // Use short_message for messages <= 255 bytes, empty for longer messages
      short_message: useMessagePayload ? "" : messageBuffer,
      
      // For long messages, add message_payload TLV
      ...(useMessagePayload ? { message_payload: messageBuffer } : {}),
    };
  }

  /**
   * Validate SMS parameters
   */
  #validateSMSParams(params: SMSParams): void {
    if (!params.to) {
      throw new Error("Recipient phone number (to) is required");
    }

    if (!params.message) {
      throw new Error("Message text is required");
    }

    if (params.message.length === 0) {
      throw new Error("Message cannot be empty");
    }

    // Validate message length based on data_coding (SMPP v5 Spec Section 4.7.28)
    this.#validateMessageLength(params.message, params.dataCoding ?? 0x00);

    // Validate phone number format (basic)
    if (!/^[+]?[\d\s\-()]+$/.test(params.to)) {
      throw new Error("Invalid phone number format");
    }

    // Validate validity period format if provided
    if (params.validityPeriod) {
      this.#validateValidityPeriod(params.validityPeriod);
    }
  }

  /**
   * Validate message length based on data coding scheme
   * SMPP v5 Spec Section 4.7.28 (sm_length) and Section 4.7.7 (data_coding)
   * 
   * Note: The SMPP protocol supports:
   * - short_message field: 0-254 bytes (255 is reserved)
   * - message_payload TLV: For messages > 254 bytes
   * 
   * This validation warns about typical SMS length limits for user convenience.
   */
  #validateMessageLength(message: string, dataCoding: number): void {
    // Encode message to get actual byte length
    const messageBuffer = this.#encodeMessage(message, dataCoding);
    const byteLength = messageBuffer.length;

    let typicalMaxChars: number;
    let encoding: string;

    switch (dataCoding) {
      case 0x00: // SMSC Default (GSM 7-bit)
      case 0x01: // IA5/ASCII
        typicalMaxChars = 160;
        encoding = "GSM 7-bit/ASCII";
        break;
      case 0x03: // Latin-1 (ISO-8859-1)
        typicalMaxChars = 160;
        encoding = "Latin-1";
        break;
      case 0x08: // UCS-2 (Unicode)
        typicalMaxChars = 70;
        encoding = "UCS-2";
        break;
      case 0x02: // Binary (8-bit)
      case 0x04: // Binary (8-bit)
        typicalMaxChars = 140;
        encoding = "8-bit binary";
        break;
      default:
        typicalMaxChars = 160;
        encoding = "default";
    }

    // Warn if message exceeds typical SMS length for single message
    if (message.length > typicalMaxChars) {
      this.#logger.warn(
        `Message length (${message.length} characters, ${byteLength} bytes) exceeds ` +
        `typical single SMS limit of ${typicalMaxChars} characters for ${encoding} encoding.`,
        {
          characters: message.length,
          bytes: byteLength,
          typicalMaxChars,
          encoding,
          dataCoding: `0x${dataCoding.toString(16).padStart(2, "0")}`,
          willUseTLV: byteLength > 255,
        }
      );
    }

    // Info log if using message_payload TLV (> 255 bytes)
    if (byteLength > 255) {
      this.#logger.info(
        `Message size (${byteLength} bytes) exceeds short_message limit (255 bytes). ` +
        `Will use message_payload TLV instead.`,
        {
          bytes: byteLength,
          encoding,
          dataCoding: `0x${dataCoding.toString(16).padStart(2, "0")}`,
        }
      );
    }

    // Warn if message is extremely large (some SMSCs have limits)
    if (byteLength > 2000) {
      this.#logger.warn(
        `Message size (${byteLength} bytes) is very large. ` +
        `Some SMSCs may have limits on message_payload size.`,
        {
          bytes: byteLength,
          encoding,
        }
      );
    }
  }

  /**
   * Validate validity period format
   * SMPP v5 Spec Section 4.7.23.4 (validity_period), Tables 4-54 / 4-55
   *
   * The time is a 16-character string "YYMMDDhhmmsstnnp" (encoded on the wire as
   * a 17-octet C-Octet String - the 17th octet is the NULL terminator and is NOT
   * part of this JS string). Both forms are 16 characters:
   * - Absolute Time: "YYMMDDhhmmsstnnp" where p is '+' or '-'
   * - Relative Time: "YYMMDDhhmmss000R" where p is 'R'
   */
  #validateValidityPeriod(validityPeriod: string): void {
    if (validityPeriod.length === 0) {
      return; // Empty is valid (no validity period)
    }

    if (validityPeriod.length !== 16) {
      this.#logger.warn(
        `Validity period should be a 16-character string, got ${validityPeriod.length}`,
        { validityPeriod }
      );
      return;
    }

    // Last character is the sign: 'R' (relative) or '+'/'-' (absolute).
    const lastChar = validityPeriod[15];
    if (lastChar !== "R" && lastChar !== "+" && lastChar !== "-") {
      this.#logger.warn(
        `Validity period format invalid. Last character should be 'R' (relative) or '+'/'-' (absolute), got '${lastChar}'`,
        { validityPeriod }
      );
    }

    // The first 15 characters (YYMMDDhhmmss + t + nn) must all be digits.
    const timeDigits = validityPeriod.slice(0, 15);
    if (!/^\d{15}$/.test(timeDigits)) {
      this.#logger.warn(
        "Validity period format invalid. First 15 characters should be digits (YYMMDDhhmmsstnn)",
        { validityPeriod }
      );
    }
  }

  /**
   * Check if string is numeric
   */
  #isNumeric(str: string): boolean {
    return /^[+]?\d+$/.test(str);
  }

  /**
   * Check if error is retryable (SMPP v5 spec: Table 4-45 - Command Status Codes)
   * Retryable errors are temporary and may succeed on retry
   * Non-retryable errors are permanent and should fail immediately
   */
  #isRetryableError(error: string): boolean {
    // Permanent errors that should NEVER be retried (SMPP v5 spec)
    // These indicate configuration or validation issues that won't resolve on retry
    const permanentErrors = [
      // Protocol / bind / validation errors (won't resolve on retry)
      "ESME_RINVMSGLEN",    // 0x01 - Message Length is invalid
      "ESME_RINVCMDID",     // 0x03 - Invalid Command ID
      "ESME_RINVBNDSTS",    // 0x04 - Incorrect BIND Status
      "ESME_RALYBND",       // 0x05 - Already in Bound State
      "ESME_RINVSRCADR",    // 0x0A - Invalid Source Address
      "ESME_RINVDSTADR",    // 0x0B - Invalid Destination Address
      "ESME_RINVMSGID",     // 0x0C - Message ID is invalid
      "ESME_RBINDFAIL",     // 0x0D - Bind Failed
      "ESME_RINVPASWD",     // 0x0E - Invalid Password
      "ESME_RINVSYSID",     // 0x0F - Invalid System ID

      // Address / field validation errors
      "ESME_RINVESMCLASS",  // 0x43 - Invalid esm_class field data
      "ESME_RSUBMITFAIL",   // 0x45 - submit_sm/data_sm/submit_multi failed (generic)
      "ESME_RINVSRCTON",    // 0x48 - Invalid Source address TON
      "ESME_RINVSRCNPI",    // 0x49 - Invalid Source address NPI
      "ESME_RINVDSTTON",    // 0x50 - Invalid Destination address TON
      "ESME_RINVDSTNPI",    // 0x51 - Invalid Destination address NPI
      "ESME_RINVDCS",       // 0x104 - Invalid Data Coding Scheme

      // service_type / permission denials (permanent)
      "ESME_RSERTYPUNAUTH", // 0x100 - not authorised to use service_type
      "ESME_RPROHIBITED",   // 0x101 - operation prohibited for this ESME
      "ESME_RSERTYPDENIED", // 0x103 - service_type denied
    ];

    // Check for permanent errors first
    if (permanentErrors.some((err) => error.includes(err))) {
      this.#logger.debug("Error is permanent - will not retry", {
        error,
        isRetryable: false,
        errorType: "permanent",
      });
      return false;
    }

    // Temporary/retryable errors that may succeed on retry
    const retryableErrors = [
      // Timeout errors
      "timeout",
      "ETIMEDOUT",
      
      // SMPP throttling errors (temporary)
      "ESME_RTHROTTLED",    // 0x00000058 - Throttling error (ESME exceeded message limits)
      "ESME_RMSGQFUL",      // 0x00000014 - Message Queue Full
      
      // System / transient service errors (temporary)
      "ESME_RSYSERR",       // 0x00000008 - System Error (MC unavailable)
      "ESME_RSERTYPUNAVAIL",// 0x00000102 - service_type unavailable (MC outage)

      // Connection errors (temporary network issues)
      "Connection closed",
      "not connected",
      "Socket not connected",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
      
      // Session errors (temporary)
      "Connection lost",
      "ENQUIRE_LINK timeout",
    ];

    const isRetryable = retryableErrors.some((err) => error.includes(err));

    this.#logger.debug("Error retry check", {
      error,
      isRetryable,
      errorType: isRetryable ? "temporary" : "unknown",
      matchedPattern: retryableErrors.find((err) => error.includes(err)),
    });

    return isRetryable;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    return this.#queue.getStats();
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.#queue.size;
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.#queue.clear();
    this.#logger.info("Message queue cleared");
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.#client.isConnected();
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus(): { availableTokens: number } {
    return {
      availableTokens: this.#rateLimiter.availableTokens,
    };
  }
}
