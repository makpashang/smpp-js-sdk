/**
 * Mission-Critical SMPP v5.0 Client
 * Features: Auto-reconnect, Keep-alive, Connection pooling, Error handling
 * Modern TypeScript implementation with private fields and latest features
 */

import { EventEmitter } from "node:events";
import * as net from "node:net";
import * as tls from "node:tls";
import { readFileSync } from "node:fs";
import type {
  SMPPConfig,
  SessionState,
  BindParams,
  SubmitSMParams,
  QuerySMParams,
  QuerySMResp,
  CancelSMParams,
  ReplaceSMParams,
  SubmitMultiParams,
  SubmitMultiResp,
  DataSMParams,
  BroadcastSMParams,
  BroadcastSMResp,
  QueryBroadcastSMParams,
  QueryBroadcastSMResp,
  CancelBroadcastSMParams,
  PDU,
  Logger,
} from "./types.js";
import { CommandId, CommandStatus, SessionState as SS } from "./types.js";
import { PDUEncoder, PDUDecoder, InvalidPDUError } from "./pdu.js";

/**
 * Default logger implementation
 */
class ConsoleLogger implements Logger {
  #debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.#debugEnabled = debugEnabled;
  }

  debug(message: string, meta?: unknown): void {
    if (this.#debugEnabled) {
      console.log(`[DEBUG] ${message}`, meta ?? "");
    }
  }

  info(message: string, meta?: unknown): void {
    console.log(`[INFO] ${message}`, meta ?? "");
  }

  warn(message: string, meta?: unknown): void {
    console.warn(`[WARN] ${message}`, meta ?? "");
  }

  error(message: string, meta?: unknown): void {
    console.error(`[ERROR] ${message}`, meta ?? "");
  }
}

interface PendingRequest {
  readonly resolve: (pdu: PDU) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
  readonly command_name: string;
}

type BindType = "transmitter" | "receiver" | "transceiver";

/**
 * SMPP Client with Auto-Reconnect
 */
export class SMPPClient extends EventEmitter {
  readonly #config: Required<SMPPConfig>;
  readonly #logger: Logger;
  readonly #bindParams: BindParams;

  #socket: net.Socket | tls.TLSSocket | null = null;
  #state: SessionState = SS.CLOSED;
  #sequenceNumber = 1;

  // Reconnection management
  #reconnectAttempts = 0;
  #currentReconnectDelay: number;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #isIntentionalClose = false;

  // Keep-alive management
  #enquireLinkTimer: NodeJS.Timeout | null = null;
  #lastActivity = Date.now();
  #enquireLinkPending = false;

  // Request management
  readonly #pendingRequests = new Map<number, PendingRequest>();
  #receiveBuffer = Buffer.alloc(0);

  // Connection state
  #isConnecting = false;
  #lastBindType: BindType = "transceiver";
  #scInterfaceVersion: number | null = null;
  #unbindTimer: NodeJS.Timeout | null = null;

  constructor(config: SMPPConfig) {
    super();

    // Set defaults with nullish coalescing
    this.#config = {
      ...config,
      system_type: config.system_type ?? "",
      interface_version: config.interface_version ?? 0x50,
      addr_ton: config.addr_ton ?? 0,
      addr_npi: config.addr_npi ?? 0,
      address_range: config.address_range ?? "",
      auto_reconnect: config.auto_reconnect ?? true,
      reconnect_delay: config.reconnect_delay ?? 1000,
      max_reconnect_delay: config.max_reconnect_delay ?? 60000,
      reconnect_backoff_factor: config.reconnect_backoff_factor ?? 2,
      max_reconnect_attempts: config.max_reconnect_attempts ?? 0,
      enquire_link_interval: config.enquire_link_interval ?? 30000,
      enquire_link_timeout: config.enquire_link_timeout ?? 10000,
      response_timeout: config.response_timeout ?? 30000,
      bind_timeout: config.bind_timeout ?? 30000,
      socket_timeout: config.socket_timeout ?? 60000,
      use_tls: config.use_tls ?? false,
      tls_options: config.tls_options ?? {},
      debug: config.debug ?? false,
      trace_pdu: config.trace_pdu ?? false,
      logger: config.logger ?? new ConsoleLogger(config.debug ?? false),
    };

    this.#logger = this.#config.logger;
    this.#currentReconnectDelay = this.#config.reconnect_delay;

    this.#bindParams = {
      system_id: this.#config.system_id,
      password: this.#config.password,
      system_type: this.#config.system_type,
      interface_version: this.#config.interface_version,
      addr_ton: this.#config.addr_ton,
      addr_npi: this.#config.addr_npi,
      address_range: this.#config.address_range,
    };
  }

  /**
   * Connect to SMPP server and bind
   */
  async connect(bindType: BindType = "transceiver"): Promise<void> {
    if (this.#isConnecting) {
      const error = new Error("Connection already in progress");
      this.#logger.warn("Connect called while connection in progress");
      throw error;
    }

    if (this.#state !== SS.CLOSED && this.#state !== SS.UNBOUND) {
      const error = new Error(
        `Cannot connect from state: ${this.#state}. Must be CLOSED or UNBOUND.`
      );
      this.#logger.error("Invalid state for connect operation", {
        currentState: this.#state,
        requiredStates: ["CLOSED", "UNBOUND"],
      });
      throw error;
    }

    this.#isIntentionalClose = false;
    this.#isConnecting = true;
    this.#lastBindType = bindType;

    // Begin each session with a fresh sequence number (SMPP v5 Spec 2.7.1) and
    // discard any bytes left over from a previous (dropped) connection so a
    // partial PDU cannot corrupt the new session's framing.
    this.#sequenceNumber = 1;
    this.#receiveBuffer = Buffer.alloc(0);

    this.#logger.info("Initiating connection to SMPP server", {
      host: this.#config.host,
      port: this.#config.port,
      bindType,
      useTLS: this.#config.use_tls,
      autoReconnect: this.#config.auto_reconnect,
    });

    try {
      // Step 1: Create socket connection
      await this.#createSocket();
      this.#logger.debug("Socket connected - proceeding to bind");

      // Step 2: Bind to SMPP server
      await this.#bind(bindType);
      this.#logger.debug("Bind successful - starting keep-alive");

      // Step 3: Start keep-alive mechanism
      this.#startKeepAlive();

      // Step 4: Reset reconnection state
      this.#reconnectAttempts = 0;
      this.#currentReconnectDelay = this.#config.reconnect_delay;

      this.#logger.info("SMPP connection fully established", {
        state: this.#state,
        bindType,
        systemId: this.#bindParams.system_id,
      });

      this.emit("connect");
    } catch (error) {
      const err = error as Error;
      this.#logger.error("Failed to connect to SMPP server", {
        error: err.message,
        host: this.#config.host,
        port: this.#config.port,
        bindType,
        stack: this.#config.debug ? err.stack : undefined,
      });
      throw error;
    } finally {
      this.#isConnecting = false;
    }
  }

  /**
   * Create and configure socket (TCP or TLS)
   */
  #createSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.#config.use_tls) {
        this.#createTLSSocket(resolve, reject);
      } else {
        this.#createTCPSocket(resolve, reject);
      }
    });
  }

  /**
   * Create plain TCP socket
   */
  #createTCPSocket(resolve: () => void, reject: (error: Error) => void): void {
    this.#logger.debug("Creating TCP socket connection", {
      host: this.#config.host,
      port: this.#config.port,
      timeout: this.#config.socket_timeout,
    });

    const socket = new net.Socket();
    this.#socket = socket;
    socket.setKeepAlive(true, 60000); // TCP keep-alive

    let settled = false;

    // Explicit connect deadline. socket.setTimeout only arms an INACTIVITY timer
    // that does not fire during the TCP handshake, so we guard the connect phase
    // ourselves and tear the socket down if it stalls (e.g. a black-holed host).
    const connectTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.#logger.error("TCP socket connection timeout", {
        timeout: this.#config.socket_timeout,
        host: this.#config.host,
        port: this.#config.port,
      });
      cleanup();
      socket.destroy();
      reject(new Error(`Connection timeout after ${this.#config.socket_timeout}ms`));
    }, this.#config.socket_timeout);

    const cleanup = () => {
      clearTimeout(connectTimer);
      socket.removeListener("error", onError);
      socket.removeListener("connect", onConnect);
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      const nodeError = error as NodeJS.ErrnoException;
      this.#logger.error("TCP socket connection error", {
        error: error.message,
        code: nodeError.code,
        errno: nodeError.errno,
        host: this.#config.host,
        port: this.#config.port,
      });
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onConnect = () => {
      if (settled) return;
      settled = true;
      this.#logger.info("TCP socket connected successfully", {
        host: this.#config.host,
        port: this.#config.port,
        localAddress: socket.localAddress,
        localPort: socket.localPort,
      });
      this.#state = SS.OPEN;
      this.#lastActivity = Date.now();
      cleanup();
      // Attach the persistent handlers ONLY after a successful connect. During
      // the connect phase a socket error is reported solely via reject(); this
      // avoids the persistent #handleError re-emitting 'error' on the client
      // (which would crash the process if the caller has no 'error' listener yet).
      this.#attachSocketHandlers(socket);
      resolve();
    };

    socket.once("error", onError);
    socket.once("connect", onConnect);

    this.#logger.debug("Connecting TCP socket...");
    socket.connect(this.#config.port, this.#config.host);
  }

  /**
   * Attach the persistent data/close/error handlers to a connected socket.
   */
  #attachSocketHandlers(socket: net.Socket | tls.TLSSocket): void {
    socket.on("data", this.#handleData.bind(this));
    socket.on("close", this.#handleClose.bind(this));
    socket.on("error", this.#handleError.bind(this));
  }

  /**
   * Create TLS socket
   */
  #createTLSSocket(resolve: () => void, reject: (error: Error) => void): void {
    const tlsOptions = this.#prepareTLSOptions();

    const socket = tls.connect(
      this.#config.port,
      this.#config.host,
      tlsOptions
    );
    this.#socket = socket;

    let settled = false;

    // Explicit connect/handshake deadline (see #createTCPSocket). tls.connect's
    // setTimeout does not guarantee firing before 'secureConnect'.
    const connectTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.#logger.error("TLS connection timeout", {
        timeout: this.#config.socket_timeout,
        host: this.#config.host,
        port: this.#config.port,
      });
      cleanup();
      socket.destroy();
      reject(new Error(`TLS connection timeout after ${this.#config.socket_timeout}ms`));
    }, this.#config.socket_timeout);

    const cleanup = () => {
      clearTimeout(connectTimer);
      socket.removeListener("error", onError);
      socket.removeListener("secureConnect", onSecureConnect);
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      this.#logger.error("TLS socket error", error);
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onSecureConnect = () => {
      if (settled) return;

      // Log TLS information
      if (this.#config.debug) {
        this.#logger.debug("TLS connection established", {
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name,
          authorized: socket.authorized,
        });
      }

      // Check if certificate is authorized
      if (
        !socket.authorized &&
        this.#config.tls_options?.rejectUnauthorized !== false
      ) {
        settled = true;
        const authError = socket.authorizationError;
        this.#logger.error("TLS certificate not authorized", authError);
        cleanup();
        socket.destroy();
        reject(
          new Error(`TLS certificate error: ${authError?.message || "Unknown"}`)
        );
        return;
      }

      settled = true;
      this.#logger.info("TLS socket connected securely");
      this.#state = SS.OPEN;
      this.#lastActivity = Date.now();
      cleanup();
      // Attach persistent handlers only after the handshake succeeds (see #createTCPSocket).
      this.#attachSocketHandlers(socket);
      resolve();
    };

    socket.once("error", onError);
    socket.once("secureConnect", onSecureConnect);
  }

  /**
   * Prepare TLS options from configuration
   */
  #prepareTLSOptions(): tls.ConnectionOptions {
    const tlsOpts = this.#config.tls_options || {};
    const options: tls.ConnectionOptions = {
      // Server name indication
      servername: tlsOpts.servername || this.#config.host,

      // Certificate verification
      rejectUnauthorized: tlsOpts.rejectUnauthorized ?? true,
      
      // Protocol versions
      minVersion: tlsOpts.minVersion as tls.SecureVersion,
      maxVersion: tlsOpts.maxVersion as tls.SecureVersion,

      // Cipher suites
      ciphers: tlsOpts.ciphers,

      // Session resumption
      session: tlsOpts.session,

      // Advanced options
      secureProtocol: tlsOpts.secureProtocol,
      honorCipherOrder: tlsOpts.honorCipherOrder,
      requestCert: tlsOpts.requestCert,
    };

    // Handle checkServerIdentity
    if (tlsOpts.checkServerIdentity === false) {
      // Disable server identity checking (for tunnels, etc.)
      options.checkServerIdentity = () => undefined;
    } else if (tlsOpts.checkServerIdentity === true) {
      // Use default checking
      options.checkServerIdentity = tls.checkServerIdentity;
    }
    // If undefined, don't set it (use Node.js default)

    // Load certificates from files if specified
    if (tlsOpts.caFile) {
      try {
        options.ca = readFileSync(tlsOpts.caFile);
        this.#logger.debug("Loaded CA from file:", tlsOpts.caFile);
      } catch (error) {
        this.#logger.warn("Failed to load CA file:", error);
      }
    } else if (tlsOpts.ca) {
      options.ca = tlsOpts.ca;
    }

    if (tlsOpts.certFile) {
      try {
        options.cert = readFileSync(tlsOpts.certFile);
        this.#logger.debug("Loaded certificate from file:", tlsOpts.certFile);
      } catch (error) {
        this.#logger.warn("Failed to load certificate file:", error);
      }
    } else if (tlsOpts.cert) {
      options.cert = tlsOpts.cert;
    }

    if (tlsOpts.keyFile) {
      try {
        options.key = readFileSync(tlsOpts.keyFile);
        this.#logger.debug("Loaded key from file:", tlsOpts.keyFile);
      } catch (error) {
        this.#logger.warn("Failed to load key file:", error);
      }
    } else if (tlsOpts.key) {
      options.key = tlsOpts.key;
    }

    if (tlsOpts.passphrase) {
      options.passphrase = tlsOpts.passphrase;
    }

    return options;
  }

  /**
   * Bind to SMPP server (SMPP v5 spec: Section 4.1)
   */
  async #bind(bindType: BindType): Promise<void> {
    const seq = this.#getNextSequence();
    
    this.#logger.debug(`Sending BIND_${bindType.toUpperCase()} request`, {
      sequence: seq,
      systemId: this.#bindParams.system_id,
      systemType: this.#bindParams.system_type,
      interfaceVersion: `0x${(this.#bindParams.interface_version || 0x50).toString(16)}`,
    });

    const pdu =
      bindType === "transmitter"
        ? PDUEncoder.encodeBindTransmitter(this.#bindParams, seq)
        : bindType === "receiver"
          ? PDUEncoder.encodeBindReceiver(this.#bindParams, seq)
          : PDUEncoder.encodeBindTransceiver(this.#bindParams, seq);

    const response = await this.#sendPDUWithResponse(
      pdu,
      seq,
      "BIND",
      this.#config.bind_timeout
    );

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      const statusCode = `0x${response.command_status.toString(16).toUpperCase().padStart(8, '0')}`;
      
      this.#logger.error("BIND rejected by server", {
        sequence: seq,
        bindType,
        status: statusName,
        statusCode,
        systemId: this.#bindParams.system_id,
        possibleReasons: this.#getBindFailureReasons(response.command_status),
      });

      throw new Error(`BIND failed: ${statusName} (${statusCode})`);
    }

    const bindResult = PDUDecoder.decodeBindResp(response);

    // Record the MC's advertised SMPP version (sc_interface_version TLV). If
    // absent, the MC does not support TLVs (SMPP v5 Spec 4.1.1.2).
    this.#scInterfaceVersion = bindResult.sc_interface_version ?? null;

    this.#state =
      bindType === "transmitter"
        ? SS.BOUND_TX
        : bindType === "receiver"
          ? SS.BOUND_RX
          : SS.BOUND_TRX;

    this.#logger.info(`BIND successful - now in ${this.#state} state`, {
      sequence: seq,
      bindType,
      systemId: bindResult.system_id,
      serverSystemId: bindResult.system_id,
      scInterfaceVersion: this.#scInterfaceVersion,
      state: this.#state,
    });

    this.emit("bind", { bindType, system_id: bindResult.system_id });
  }

  /**
   * Get possible reasons for bind failure
   */
  #getBindFailureReasons(status: CommandStatus): string[] {
    switch (status) {
      case CommandStatus.ESME_RINVPASWD:
        return ["Invalid password", "Check credentials"];
      case CommandStatus.ESME_RINVSYSID:
        return ["Invalid system_id", "Check username"];
      case CommandStatus.ESME_RALYBND:
        return ["Already bound", "Disconnect existing session first"];
      case CommandStatus.ESME_RBINDFAIL:
        return ["Bind failed", "Check server configuration", "IP may not be whitelisted"];
      case CommandStatus.ESME_RINVSERTYP:
        return ["Invalid system_type", "Check configuration"];
      default:
        return ["Check server logs", "Verify configuration"];
    }
  }

  /**
   * Submit a short message (SMPP v5 spec: Section 4.4)
   */
  async submitSM(params: SubmitSMParams): Promise<string> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      const error = new Error(
        `Cannot submit SM - not in correct state. Current: ${this.#state}, Required: BOUND_TX or BOUND_TRX`
      );
      this.#logger.error("SUBMIT_SM rejected due to invalid state", {
        currentState: this.#state,
        requiredStates: ["BOUND_TX", "BOUND_TRX"],
        destination: params.destination_addr,
      });
      throw error;
    }

    const seq = this.#getNextSequence();

    this.#logger.debug("Sending SUBMIT_SM", {
      sequence: seq,
      from: params.source_addr,
      to: params.destination_addr,
      messageLength: typeof params.short_message === 'string' 
        ? params.short_message.length 
        : params.short_message.length,
      registeredDelivery: params.registered_delivery,
    });

    const pdu = PDUEncoder.encodeSubmitSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "SUBMIT_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      const statusCode = `0x${response.command_status.toString(16).toUpperCase().padStart(8, '0')}`;
      
      this.#logger.error("SUBMIT_SM failed - server rejected message", {
        sequence: seq,
        status: statusName,
        statusCode,
        destination: params.destination_addr,
      });

      throw new Error(`SUBMIT_SM failed: ${statusName} (${statusCode})`);
    }

    const result = PDUDecoder.decodeSubmitSMResp(response);
    
    this.#logger.info("Message submitted successfully", {
      sequence: seq,
      messageId: result.message_id,
      destination: params.destination_addr,
    });

    return result.message_id;
  }

  /**
   * Query SM - Query status of previously submitted message (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  async querySM(params: QuerySMParams): Promise<QuerySMResp> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot query SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending QUERY_SM", { sequence: seq, messageId: params.message_id });

    const pdu = PDUEncoder.encodeQuerySM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "QUERY_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`QUERY_SM failed: ${statusName}`);
    }

    const result = PDUDecoder.decodeQuerySMResp(response);
    if (!result) throw new Error("Failed to decode QUERY_SM_RESP");
    
    return result;
  }

  /**
   * Cancel SM - Cancel previously submitted message (Optional Operation)
   * SMPP v5 Spec Section 4.9.1
   */
  async cancelSM(params: CancelSMParams): Promise<void> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot cancel SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending CANCEL_SM", { sequence: seq, messageId: params.message_id });

    const pdu = PDUEncoder.encodeCancelSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "CANCEL_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`CANCEL_SM failed: ${statusName}`);
    }

    this.#logger.info("Message cancelled successfully", { messageId: params.message_id });
  }

  /**
   * Replace SM - Replace previously submitted message (Optional Operation)
   * SMPP v5 Spec Section 4.10.1
   */
  async replaceSM(params: ReplaceSMParams): Promise<void> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot replace SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending REPLACE_SM", { sequence: seq, messageId: params.message_id });

    const pdu = PDUEncoder.encodeReplaceSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "REPLACE_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`REPLACE_SM failed: ${statusName}`);
    }

    this.#logger.info("Message replaced successfully", { messageId: params.message_id });
  }

  /**
   * Submit Multi - Submit message to multiple destinations (Optional Operation)
   * SMPP v5 Spec Section 4.4.1
   */
  async submitMulti(params: SubmitMultiParams): Promise<SubmitMultiResp> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot submit multi - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending SUBMIT_MULTI", { 
      sequence: seq, 
      from: params.source_addr, 
      destinations: params.dest_addresses.length 
    });

    const pdu = PDUEncoder.encodeSubmitMulti(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "SUBMIT_MULTI");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`SUBMIT_MULTI failed: ${statusName}`);
    }

    const result = PDUDecoder.decodeSubmitMultiResp(response);
    if (!result) throw new Error("Failed to decode SUBMIT_MULTI_RESP");
    
    this.#logger.info("Multi message submitted successfully", { 
      messageId: result.message_id,
      unsuccessful: result.unsuccessful_smes?.length || 0 
    });

    return result;
  }

  /**
   * Data SM - Streamlined message transfer using TLVs (Optional Operation)
   * SMPP v5 Spec Section 4.7.1
   */
  async dataSM(params: DataSMParams): Promise<string> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot send data SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending DATA_SM", { sequence: seq, from: params.source_addr, to: params.destination_addr });

    const pdu = PDUEncoder.encodeDataSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "DATA_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`DATA_SM failed: ${statusName}`);
    }

    const result = PDUDecoder.decodeDataSMResp(response);
    if (!result) throw new Error("Failed to decode DATA_SM_RESP");
    
    this.#logger.info("Data message sent successfully", { messageId: result.message_id });

    return result.message_id;
  }

  /**
   * Broadcast SM - Send message to cell broadcast areas (Optional Operation)
   * SMPP v5 Spec Section 4.4.1
   */
  async broadcastSM(params: BroadcastSMParams): Promise<BroadcastSMResp> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot send broadcast SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending BROADCAST_SM", { 
      sequence: seq, 
      messageId: params.message_id,
      from: params.source_addr 
    });

    const pdu = PDUEncoder.encodeBroadcastSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "BROADCAST_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`BROADCAST_SM failed: ${statusName}`);
    }

    const result = PDUDecoder.decodeBroadcastSMResp(response);
    if (!result) throw new Error("Failed to decode BROADCAST_SM_RESP");
    
    this.#logger.info("Broadcast message sent successfully", { messageId: result.message_id });

    return result;
  }

  /**
   * Query Broadcast SM - Query status of broadcast message (Optional Operation)
   * SMPP v5 Spec Section 4.6.1
   */
  async queryBroadcastSM(params: QueryBroadcastSMParams): Promise<QueryBroadcastSMResp> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot query broadcast SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending QUERY_BROADCAST_SM", { sequence: seq, messageId: params.message_id });

    const pdu = PDUEncoder.encodeQueryBroadcastSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "QUERY_BROADCAST_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`QUERY_BROADCAST_SM failed: ${statusName}`);
    }

    const result = PDUDecoder.decodeQueryBroadcastSMResp(response);
    if (!result) throw new Error("Failed to decode QUERY_BROADCAST_SM_RESP");
    
    return result;
  }

  /**
   * Cancel Broadcast SM - Cancel broadcast message (Optional Operation)
   * SMPP v5 Spec Section 4.6.2
   */
  async cancelBroadcastSM(params: CancelBroadcastSMParams): Promise<void> {
    if (this.#state !== SS.BOUND_TX && this.#state !== SS.BOUND_TRX) {
      throw new Error(`Cannot cancel broadcast SM - not in correct state. Current: ${this.#state}`);
    }

    const seq = this.#getNextSequence();
    this.#logger.debug("Sending CANCEL_BROADCAST_SM", { sequence: seq, messageId: params.message_id });

    const pdu = PDUEncoder.encodeCancelBroadcastSM(params, seq);
    const response = await this.#sendPDUWithResponse(pdu, seq, "CANCEL_BROADCAST_SM");

    if (response.command_status !== CommandStatus.ESME_ROK) {
      const statusName = PDUDecoder.getStatusName(response.command_status);
      throw new Error(`CANCEL_BROADCAST_SM failed: ${statusName}`);
    }

    this.#logger.info("Broadcast message cancelled successfully", { messageId: params.message_id });
  }

  /**
   * Send enquire_link (SMPP v5 spec: Section 4.11 - Connection testing)
   */
  async #sendEnquireLink(): Promise<void> {
    if (this.#enquireLinkPending) {
      this.#logger.error(
        "ENQUIRE_LINK timeout - previous enquire_link not responded",
        {
          pendingTime: Date.now() - this.#lastActivity,
          state: this.#state,
        }
      );
      this.#handleConnectionFailure(new Error("ENQUIRE_LINK timeout - connection lost"));
      return;
    }

    try {
      this.#enquireLinkPending = true;
      const seq = this.#getNextSequence();
      const pdu = PDUEncoder.encodeEnquireLink(seq);

      this.#logger.debug("Sending ENQUIRE_LINK", {
        sequence: seq,
        idleTime: Date.now() - this.#lastActivity,
      });

      await this.#sendPDUWithResponse(
        pdu,
        seq,
        "ENQUIRE_LINK",
        this.#config.enquire_link_timeout
      );

      this.#enquireLinkPending = false;
      this.#logger.debug("ENQUIRE_LINK_RESP received - connection alive", {
        sequence: seq,
      });
    } catch (error) {
      this.#enquireLinkPending = false;
      const err = error as Error;
      this.#logger.error("ENQUIRE_LINK failed - initiating reconnect", {
        error: err.message,
        state: this.#state,
        lastActivity: new Date(this.#lastActivity).toISOString(),
      });
      this.#handleConnectionFailure(err);
    }
  }

  /**
   * Start keep-alive mechanism (SMPP v5 spec: Section 2.11 - Session Timers)
   * Checks inactivity and sends enquire_link to test connection
   */
  #startKeepAlive(): void {
    this.#stopKeepAlive();

    // Check every 5 seconds or half the interval, whichever is smaller
    const checkInterval = Math.min(this.#config.enquire_link_interval / 2, 5000);

    this.#logger.debug("Starting keep-alive mechanism", {
      enquireLinkInterval: this.#config.enquire_link_interval,
      checkInterval,
      timeout: this.#config.enquire_link_timeout,
    });

    this.#enquireLinkTimer = setInterval(
      () => {
        const idleTime = Date.now() - this.#lastActivity;

        if (idleTime >= this.#config.enquire_link_interval) {
          this.#logger.debug(
            "Inactivity detected - sending ENQUIRE_LINK",
            {
              idleTime,
              threshold: this.#config.enquire_link_interval,
              state: this.#state,
            }
          );

          this.#sendEnquireLink().catch((err) => {
            this.#logger.error("Keep-alive check failed", {
              error: err.message,
              willReconnect: this.#config.auto_reconnect,
            });
          });
        }
      },
      checkInterval
    );
  }

  /**
   * Stop keep-alive mechanism
   */
  #stopKeepAlive(): void {
    if (this.#enquireLinkTimer) {
      clearInterval(this.#enquireLinkTimer);
      this.#enquireLinkTimer = null;
      this.#logger.debug("Keep-alive mechanism stopped");
    }
    this.#enquireLinkPending = false;
  }

  /**
   * Gracefully unbind and disconnect
   */
  async disconnect(): Promise<void> {
    this.#isIntentionalClose = true;
    this.#stopReconnect();
    this.#stopKeepAlive();

    if (
      this.#state === SS.BOUND_TX ||
      this.#state === SS.BOUND_RX ||
      this.#state === SS.BOUND_TRX
    ) {
      try {
        await this.#unbind();
      } catch (error) {
        this.#logger.error("Error during unbind", error);
      }
    }

    this.#closeSocket();
    this.#state = SS.CLOSED;
    this.emit("disconnect");
    this.#logger.info("Disconnected from SMPP server");
  }

  /**
   * Unbind from SMPP server
   */
  async #unbind(): Promise<void> {
    const seq = this.#getNextSequence();
    const pdu = PDUEncoder.encodeUnbind(seq);

    try {
      await this.#sendPDUWithResponse(pdu, seq, "UNBIND", 5000);
      this.#state = SS.UNBOUND;
      this.#logger.info("Unbound successfully");
      this.emit("unbind");
    } catch (error) {
      this.#logger.error("Unbind failed", error);
      throw error;
    }
  }

  /**
   * Handle incoming data from socket (SMPP v5 spec: Section 3 - PDU Reception)
   */
  #handleData(data: Buffer): void {
    this.#lastActivity = Date.now();
    this.#receiveBuffer = Buffer.concat([this.#receiveBuffer, data]);

    this.#logger.debug("Received data from socket", {
      bytes: data.length,
      bufferSize: this.#receiveBuffer.length,
    });

    // Process all complete PDUs in buffer
    let pduCount = 0;
    while (this.#receiveBuffer.length >= 16) {
      let pdu: PDU | null;
      try {
        pdu = PDUDecoder.decodePDUHeader(this.#receiveBuffer);
      } catch (error) {
        if (!(error instanceof InvalidPDUError)) throw error;
        // Structurally invalid command_length (too short or too large). Per spec
        // respond generic_nack/ESME_RINVCMDLEN and tear the connection down -
        // continuing would risk an infinite loop or unbounded buffering.
        const seq = this.#receiveBuffer.length >= 16 ? this.#receiveBuffer.readUInt32BE(12) : 0;
        this.#logger.error("Invalid PDU framing - sending GENERIC_NACK and closing", {
          error: (error as Error).message,
          bufferSize: this.#receiveBuffer.length,
        });
        try {
          this.#sendPDU(
            PDUEncoder.encodeGenericNack(seq, CommandStatus.ESME_RINVCMDLEN)
          );
        } catch (nackErr) {
          this.#logger.debug("Could not send GENERIC_NACK (socket unwritable)", {
            error: (nackErr as Error).message,
          });
        }
        this.#receiveBuffer = Buffer.alloc(0);
        this.#handleConnectionFailure(error as Error);
        return;
      }

      if (!pdu) {
        // Incomplete PDU - need more data
        if (this.#receiveBuffer.length > 0) {
          this.#logger.debug("Waiting for more data - incomplete PDU", {
            bufferSize: this.#receiveBuffer.length,
            needAtLeast: 16,
          });
        }
        break;
      }

      // Check if we have the complete PDU
      if (this.#receiveBuffer.length < pdu.command_length) {
        this.#logger.debug("Waiting for complete PDU body", {
          have: this.#receiveBuffer.length,
          need: pdu.command_length,
        });
        break;
      }

      // Remove processed PDU from buffer (command_length is guaranteed >= 16 here)
      if (this.#config.trace_pdu) {
        this.#logger.debug("PDU RX (wire)", {
          bytes: pdu.command_length,
          hex: this.#receiveBuffer.slice(0, pdu.command_length).toString("hex"),
        });
      }
      this.#receiveBuffer = this.#receiveBuffer.slice(pdu.command_length);
      pduCount++;

      this.#logger.debug("Received PDU", {
        pduNumber: pduCount,
        command: PDUDecoder.getCommandName(pdu.command_id),
        status: PDUDecoder.getStatusName(pdu.command_status),
        sequence: pdu.sequence_number,
        length: pdu.command_length,
      });

      this.#handlePDU(pdu);
    }

    if (pduCount > 1) {
      this.#logger.debug(`Processed ${pduCount} PDUs from buffer`);
    }
  }

  /**
   * Handle parsed PDU
   */
  #handlePDU(pdu: PDU): void {
    // A PDU is a response iff bit 31 of command_id is set (generic_nack=0x80000000
    // included). Only responses are correlated to a pending request by sequence
    // number; MC-originated REQUESTS (bit 31 clear) are always dispatched to a
    // handler, because the ESME and MC sequence-number spaces are independent and
    // their values may collide (SMPP v5 Spec 2.6 / 4.7.5).
    const isResponse = (pdu.command_id & 0x80000000) !== 0;

    if (isResponse) {
      const pending = this.#pendingRequests.get(pdu.sequence_number);

      if (pending) {
        clearTimeout(pending.timeout);
        this.#pendingRequests.delete(pdu.sequence_number);

        // Handle GENERIC_NACK specially - reject with error
        if (pdu.command_id === CommandId.GENERIC_NACK) {
          const statusName = PDUDecoder.getStatusName(pdu.command_status);
          const statusCode = `0x${pdu.command_status.toString(16).toUpperCase().padStart(8, '0')}`;

          this.#logger.error("Received GENERIC_NACK from SMSC", {
            sequence: pdu.sequence_number,
            command: pending.command_name,
            status: statusName,
            statusCode,
          });

          pending.reject(new Error(
            `SMSC sent GENERIC_NACK for ${pending.command_name}: ${statusName} (${statusCode})`
          ));
        } else {
          pending.resolve(pdu);
        }
        return;
      }

      // No matching request. An unsolicited generic_nack is surfaced as an event;
      // any other unmatched response is logged and dropped.
      if (pdu.command_id === CommandId.GENERIC_NACK) {
        this.#handleGenericNack(pdu);
      } else {
        this.#logger.warn("Unsolicited response with no matching request", {
          command: PDUDecoder.getCommandName(pdu.command_id),
          sequence: pdu.sequence_number,
        });
      }
      return;
    }

    // MC-originated requests
    switch (pdu.command_id) {
      case CommandId.DELIVER_SM:
        this.#handleDeliverSM(pdu);
        break;
      case CommandId.DATA_SM:
        this.#handleDataSM(pdu);
        break;
      case CommandId.ALERT_NOTIFICATION:
        this.#handleAlertNotification(pdu);
        break;
      case CommandId.OUTBIND:
        this.#handleOutbind(pdu);
        break;
      case CommandId.ENQUIRE_LINK:
        this.#handleEnquireLink(pdu);
        break;
      case CommandId.UNBIND:
        this.#handleUnbind(pdu);
        break;
      default:
        this.#handleUnknownPDU(pdu);
    }
  }

  /**
   * Handle an unrecognised inbound request PDU. Per SMPP v5 Spec 3.2 the peer
   * must be answered with a generic_nack/ESME_RINVCMDID.
   */
  #handleUnknownPDU(pdu: PDU): void {
    this.#logger.warn("Unknown PDU - sending GENERIC_NACK (ESME_RINVCMDID)", {
      command: PDUDecoder.getCommandName(pdu.command_id),
      sequence: pdu.sequence_number,
    });
    try {
      this.#sendPDU(
        PDUEncoder.encodeGenericNack(pdu.sequence_number, CommandStatus.ESME_RINVCMDID)
      );
    } catch (error) {
      this.#logger.error("Failed to send GENERIC_NACK", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle DATA_SM PDU (MC-initiated delivery - SMPP v5 Spec 4.7.1)
   * data_sm is symmetric; the ESME must answer with data_sm_resp.
   */
  #handleDataSM(pdu: PDU): void {
    const data = PDUDecoder.decodeDataSM(pdu);

    if (!data) {
      this.#logger.error("Failed to decode DATA_SM PDU - invalid format", {
        sequence: pdu.sequence_number,
        bodyLength: pdu.body?.length,
      });
      this.#sendPDU(
        PDUEncoder.encodeDataSMResp(
          pdu.sequence_number,
          "",
          CommandStatus.ESME_RINVMSGLEN
        )
      );
      return;
    }

    const esmClass = data.esm_class ?? 0;
    const isDeliveryReceipt = (esmClass & 0x04) !== 0;

    this.#logger.debug(
      isDeliveryReceipt ? "Received delivery receipt (data_sm)" : "Received message (data_sm)",
      {
        sequence: pdu.sequence_number,
        from: data.source_addr,
        to: data.destination_addr,
        esmClass: `0x${esmClass.toString(16).padStart(2, '0')}`,
        dataCoding: data.data_coding,
        isDeliveryReceipt,
      }
    );

    // Emit event for the application to handle
    this.#safeEmit("data_sm", data);

    // Acknowledge per spec (data_sm_resp)
    this.#sendPDU(PDUEncoder.encodeDataSMResp(pdu.sequence_number));
  }

  /**
   * Handle DELIVER_SM PDU (SMPP v5 spec: Section 4.6)
   */
  #handleDeliverSM(pdu: PDU): void {
    const delivery = PDUDecoder.decodeDeliverSM(pdu);

    if (!delivery) {
      this.#logger.error("Failed to decode DELIVER_SM PDU - invalid format", {
        sequence: pdu.sequence_number,
        bodyLength: pdu.body?.length,
      });
      this.#sendPDU(
        PDUEncoder.encodeDeliverSMResp(
          pdu.sequence_number,
          "",
          CommandStatus.ESME_RINVMSGLEN
        )
      );
      return;
    }

    const isDeliveryReceipt = (delivery.esm_class & 0x04) !== 0;

    this.#logger.debug(
      isDeliveryReceipt ? "Received delivery receipt" : "Received mobile-originated message",
      {
        sequence: pdu.sequence_number,
        from: delivery.source_addr,
        to: delivery.destination_addr,
        messageLength: delivery.sm_length,
        esmClass: `0x${delivery.esm_class.toString(16).padStart(2, '0')}`,
        dataCoding: delivery.data_coding,
        isDeliveryReceipt,
      }
    );

    // Emit event for application to handle
    this.#safeEmit("deliver_sm", delivery);

    // Send success response (SMPP spec requires DELIVER_SM_RESP)
    this.#sendPDU(PDUEncoder.encodeDeliverSMResp(pdu.sequence_number));
    
    this.#logger.debug("Sent DELIVER_SM_RESP", {
      sequence: pdu.sequence_number,
    });
  }

  /**
   * Handle ALERT_NOTIFICATION PDU (Optional Operation - MC to ESME)
   * SMPP v5 Spec Section 4.12.1
   */
  #handleAlertNotification(pdu: PDU): void {
    const alert = PDUDecoder.decodeAlertNotification(pdu);

    if (!alert) {
      this.#logger.error("Failed to decode ALERT_NOTIFICATION PDU", {
        sequence: pdu.sequence_number,
      });
      return;
    }

    this.#logger.debug("Received ALERT_NOTIFICATION", {
      sequence: pdu.sequence_number,
      sourceAddr: alert.source_addr,
      esmeAddr: alert.esme_addr,
    });

    // Emit event for application to handle
    this.#safeEmit("alert_notification", alert);
  }

  /**
   * Handle OUTBIND PDU (Optional Operation - MC to ESME)
   * SMPP v5 Spec Section 4.1.1.7
   */
  #handleOutbind(pdu: PDU): void {
    const outbind = PDUDecoder.decodeOutbind(pdu);

    if (!outbind) {
      this.#logger.error("Failed to decode OUTBIND PDU", {
        sequence: pdu.sequence_number,
      });
      return;
    }

    this.#logger.info("Received OUTBIND from MC - MC requesting ESME to initiate bind_receiver", {
      sequence: pdu.sequence_number,
      systemId: outbind.system_id,
    });

    // Emit event for application to handle
    // Application should respond by initiating bind_receiver to the MC
    this.#safeEmit("outbind", outbind);
  }

  /**
   * Handle ENQUIRE_LINK PDU from server (SMPP v5 spec: Section 4.11)
   */
  #handleEnquireLink(pdu: PDU): void {
    this.#logger.debug("Received ENQUIRE_LINK from server - sending response", {
      sequence: pdu.sequence_number,
      state: this.#state,
    });
    
    try {
      this.#sendPDU(PDUEncoder.encodeEnquireLinkResp(pdu.sequence_number));
      this.#logger.debug("Sent ENQUIRE_LINK_RESP", {
        sequence: pdu.sequence_number,
      });
    } catch (error) {
      this.#logger.error("Failed to send ENQUIRE_LINK_RESP", {
        sequence: pdu.sequence_number,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle GENERIC_NACK PDU (SMPP v5 spec: Section 3.2)
   * Received when SMSC cannot parse or process a PDU
   */
  #handleGenericNack(pdu: PDU): void {
    const statusName = PDUDecoder.getStatusName(pdu.command_status);
    const statusCode = `0x${pdu.command_status.toString(16).toUpperCase().padStart(8, '0')}`;

    this.#logger.error("Received unsolicited GENERIC_NACK from SMSC", {
      sequence: pdu.sequence_number,
      status: statusName,
      statusCode,
      message: "SMSC rejected a PDU or encountered a protocol error",
    });

    // Emit event for application-level handling
    this.#safeEmit("generic_nack", {
      sequence: pdu.sequence_number,
      status: pdu.command_status,
      statusName,
    });
  }

  /**
   * Handle UNBIND PDU
   */
  #handleUnbind(pdu: PDU): void {
    this.#logger.info("Received UNBIND from server");
    this.#sendPDU(PDUEncoder.encodeUnbindResp(pdu.sequence_number));
    this.#state = SS.UNBOUND;
    this.#safeEmit("unbind");

    // Give the unbind_resp a moment to flush, then close. Track the timer so it
    // can be cancelled (it is cleared in #closeSocket) - otherwise a close that
    // races ahead would leave a dangling timer firing on a new socket.
    if (this.#unbindTimer) clearTimeout(this.#unbindTimer);
    this.#unbindTimer = setTimeout(() => {
      this.#unbindTimer = null;
      this.#closeSocket();
    }, 1000);
  }

  /**
   * Handle socket close
   */
  #handleClose(hadError: boolean): void {
    const previousState = this.#state;
    
    this.#logger.warn("Socket closed - connection lost", {
      hadError,
      previousState,
      intentionalClose: this.#isIntentionalClose,
      reconnectEnabled: this.#config.auto_reconnect,
      pendingRequests: this.#pendingRequests.size,
    });

    this.#stopKeepAlive();
    if (this.#unbindTimer) {
      clearTimeout(this.#unbindTimer);
      this.#unbindTimer = null;
    }
    this.#socket = null;
    // Discard any buffered partial PDU from the dropped connection.
    this.#receiveBuffer = Buffer.alloc(0);

    const wasBound =
      this.#state === SS.BOUND_TX ||
      this.#state === SS.BOUND_RX ||
      this.#state === SS.BOUND_TRX;
    this.#state = SS.CLOSED;

    // Clean up all pending requests
    const pendingCount = this.#pendingRequests.size;
    this.#rejectAllPendingRequests(new Error("Connection closed"));
    
    if (pendingCount > 0) {
      this.#logger.warn(`Rejected ${pendingCount} pending requests due to connection close`);
    }

    if (wasBound) {
      this.#safeEmit("close", { had_error: hadError });
    }

    // Auto-reconnect if enabled and not intentional disconnect
    if (this.#config.auto_reconnect && !this.#isIntentionalClose) {
      this.#logger.info("Auto-reconnect enabled - will attempt to reconnect", {
        currentAttempts: this.#reconnectAttempts,
        maxAttempts: this.#config.max_reconnect_attempts || "infinite",
      });
      this.#scheduleReconnect();
    } else if (this.#isIntentionalClose) {
      this.#logger.info("Connection closed intentionally - not reconnecting");
    } else {
      this.#logger.warn("Auto-reconnect disabled - connection will not be restored");
    }
  }

  /**
   * Handle socket error
   */
  #handleError(error: Error): void {
    const nodeError = error as NodeJS.ErrnoException;
    
    this.#logger.error("Socket error occurred", {
      error: error.message,
      code: nodeError.code,
      errno: nodeError.errno,
      syscall: nodeError.syscall,
      state: this.#state,
      reconnectWillAttempt: this.#config.auto_reconnect && !this.#isIntentionalClose,
    });

    // Only emit 'error' when a listener exists. EventEmitter throws an uncaught
    // exception (crashing the process) if 'error' is emitted with no listener;
    // the socket 'close' handler already drives reconnection independently.
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    }
  }

  /**
   * Emit an application-facing event without letting a throwing listener break
   * PDU processing or crash the process. A listener exception is caught and
   * logged rather than propagating back into the socket 'data' handler.
   */
  #safeEmit(event: string, ...args: unknown[]): void {
    try {
      this.emit(event, ...args);
    } catch (error) {
      const err = error as Error;
      this.#logger.error(`Listener for '${event}' threw an exception`, {
        event,
        error: err?.message,
        stack: this.#config.debug ? err?.stack : undefined,
      });
    }
  }

  /**
   * Handle connection failure (triggers reconnection)
   */
  #handleConnectionFailure(error: Error): void {
    this.#logger.error("Connection failure detected - closing socket", {
      error: error.message,
      state: this.#state,
      reconnectEnabled: this.#config.auto_reconnect,
      stack: this.#config.debug ? error.stack : undefined,
    });
    this.#closeSocket();
  }

  /**
   * Schedule reconnection attempt (Exponential backoff)
   */
  #scheduleReconnect(): void {
    if (this.#reconnectTimer) {
      this.#logger.debug("Reconnect already scheduled, skipping");
      return;
    }

    if (
      this.#config.max_reconnect_attempts > 0 &&
      this.#reconnectAttempts >= this.#config.max_reconnect_attempts
    ) {
      this.#logger.error("Max reconnect attempts reached - giving up", {
        attempts: this.#reconnectAttempts,
        maxAttempts: this.#config.max_reconnect_attempts,
      });
      this.#safeEmit("reconnect_failed", {
        attempts: this.#reconnectAttempts,
        lastError: "Max attempts exceeded",
      });
      return;
    }

    this.#reconnectAttempts++;
    const nextDelay = this.#currentReconnectDelay;

    this.#logger.info(
      `Scheduling reconnect attempt #${this.#reconnectAttempts}`,
      {
        attempt: this.#reconnectAttempts,
        delayMs: nextDelay,
        maxAttempts: this.#config.max_reconnect_attempts || "infinite",
        nextDelayMs: Math.min(
          nextDelay * this.#config.reconnect_backoff_factor,
          this.#config.max_reconnect_delay
        ),
      }
    );

    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#attemptReconnect();
    }, nextDelay);

    // Calculate next delay for subsequent attempt (exponential backoff)
    this.#currentReconnectDelay = Math.min(
      this.#currentReconnectDelay * this.#config.reconnect_backoff_factor,
      this.#config.max_reconnect_delay
    );
  }

  /**
   * Attempt to reconnect to SMPP server
   */
  async #attemptReconnect(): Promise<void> {
    this.#logger.info(
      `Attempting to reconnect to SMPP server`,
      {
        attempt: this.#reconnectAttempts,
        host: this.#config.host,
        port: this.#config.port,
        useTLS: this.#config.use_tls,
      }
    );

    this.#safeEmit("reconnecting", {
      attempt: this.#reconnectAttempts,
      delay: this.#currentReconnectDelay,
    });

    // Capture the attempt count before connect() succeeds and resets it to 0.
    const attemptNumber = this.#reconnectAttempts;

    try {
      // Re-establish using the SAME bind type the session originally used,
      // not a hard-coded transceiver bind.
      await this.connect(this.#lastBindType);

      // connect() already reset #reconnectAttempts / #currentReconnectDelay on success.
      this.#logger.info("Successfully reconnected to SMPP server", {
        attempt: attemptNumber,
        bindType: this.#lastBindType,
        state: this.#state,
      });

      this.#safeEmit("reconnected", {
        attemptsTaken: attemptNumber,
      });
    } catch (error) {
      const err = error as Error;
      this.#logger.error("Reconnect attempt failed - will retry", {
        attempt: this.#reconnectAttempts,
        error: err.message,
        nextDelayMs: this.#currentReconnectDelay,
        stack: this.#config.debug ? err.stack : undefined,
      });

      // Schedule next attempt
      this.#scheduleReconnect();
    }
  }

  /**
   * Stop reconnection attempts
   */
  #stopReconnect(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    this.#reconnectAttempts = 0;
    this.#currentReconnectDelay = this.#config.reconnect_delay;
  }

  /**
   * Send PDU and wait for response (SMPP v5 spec: Section 2.7 - PDU Sequencing)
   */
  #sendPDUWithResponse(
    pdu: Buffer,
    sequenceNumber: number,
    commandName: string,
    timeout = this.#config.response_timeout
  ): Promise<PDU> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Wrap resolve to emit an RTT trace line for every matched response.
      const tracedResolve = (responsePdu: PDU) => {
        this.#logger.debug(`${commandName}_RESP received`, {
          sequence: sequenceNumber,
          status: PDUDecoder.getStatusName(responsePdu.command_status),
          rttMs: Date.now() - startTime,
        });
        resolve(responsePdu);
      };

      const timer = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        this.#pendingRequests.delete(sequenceNumber);
        
        this.#logger.error(`${commandName} timeout - no response received`, {
          sequence: sequenceNumber,
          timeout,
          elapsed,
          state: this.#state,
          pendingRequests: this.#pendingRequests.size,
        });

        reject(new Error(
          `${commandName} timeout after ${timeout}ms (sequence: ${sequenceNumber})`
        ));
      }, timeout);

      this.#pendingRequests.set(sequenceNumber, {
        resolve: tracedResolve,
        reject,
        timeout: timer,
        command_name: commandName,
      });

      this.#logger.debug(`Waiting for ${commandName}_RESP`, {
        sequence: sequenceNumber,
        timeout,
      });

      try {
        this.#sendPDU(pdu);
      } catch (error) {
        clearTimeout(timer);
        this.#pendingRequests.delete(sequenceNumber);
        throw error;
      }
    });
  }

  /**
   * Send PDU without waiting for response
   */
  #sendPDU(pdu: Buffer): void {
    if (!this.#socket?.writable) {
      throw new Error("Socket not connected");
    }

    if (this.#config.trace_pdu) {
      this.#logger.debug("PDU TX (wire)", {
        bytes: pdu.length,
        hex: pdu.toString("hex"),
      });
    }

    this.#socket.write(pdu);
    this.#lastActivity = Date.now();
  }

  /**
   * Reject all pending requests (on connection loss)
   */
  #rejectAllPendingRequests(error: Error): void {
    if (this.#pendingRequests.size === 0) {
      return;
    }

    this.#logger.warn(`Rejecting ${this.#pendingRequests.size} pending requests`, {
      reason: error.message,
    });

    for (const [seq, pending] of this.#pendingRequests.entries()) {
      this.#logger.debug(`Rejecting pending request`, {
        sequence: seq,
        command: pending.command_name,
      });
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    
    this.#pendingRequests.clear();
  }

  /**
   * Close socket
   */
  #closeSocket(): void {
    if (this.#unbindTimer) {
      clearTimeout(this.#unbindTimer);
      this.#unbindTimer = null;
    }
    this.#socket?.destroy();
    this.#socket = null;
    // Drop any buffered partial PDU so it cannot bleed into the next session.
    this.#receiveBuffer = Buffer.alloc(0);
  }

  /**
   * Get next sequence number
   * SMPP v5 Spec Section 2.7.1: Sequence numbers wrap from 0x7FFFFFFF to 0x00000001
   */
  #getNextSequence(): number {
    const seq = this.#sequenceNumber;
    this.#sequenceNumber++;
    
    // Wrap from 0x7FFFFFFF to 0x00000001 (skip 0)
    if (this.#sequenceNumber > 0x7fffffff || this.#sequenceNumber < 1) {
      this.#sequenceNumber = 1;
    }
    
    return seq;
  }

  /**
   * Get current session state
   */
  getState(): SessionState {
    return this.#state;
  }

  /**
   * SMPP version advertised by the MC in the bind response (sc_interface_version
   * TLV), or null if the MC did not include it (implying no TLV support).
   */
  getInterfaceVersion(): number | null {
    return this.#scInterfaceVersion;
  }

  /**
   * Check if connected and bound
   */
  isConnected(): boolean {
    return (
      this.#state === SS.BOUND_TX ||
      this.#state === SS.BOUND_RX ||
      this.#state === SS.BOUND_TRX
    );
  }
}
