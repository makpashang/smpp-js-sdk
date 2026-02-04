/**
 * Production SMPP Client Example
 * Connects to real SMPP server with SSL
 */

import { SMSManager, SMPPClient, TON, NPI, DataCoding } from "../src/index.js";

/**
 * Example 1: Using SMSManager (High-Level API)
 */
async function example1_SMSManager() {
  console.log("=== Example 1: SMSManager with Auto-Reconnect ===\n");

  const sms = new SMSManager({
    // Server connection (via AWS SSM port forwarding)
    // AWS SSM forwards 192.168.1.2:2777 → 192.168.1.2:2777
    host: "192.168.1.2",
    port: 2777,
    system_id: "",
    password: "",
    system_type: "ESME",
    interface_version: 0x34, // 52 decimal (matches server config)
    addr_ton: 0, // Matches server config: auth.smpp.addr_ton: 0
    addr_npi: 0, // Matches server config: auth.smpp.addr_npi: 0
    address_range: "",

    // NO TLS - server config shows peer.peer_ssl: 0
    // AWS SSM tunnel already provides encryption
    use_tls: false,

    // Auto-reconnect - server allows this (peer.recon_interval: 5)
    auto_reconnect: true,
    reconnect_delay: 10000, // 10 seconds - give server time to cleanup old session
    max_reconnect_delay: 60000, // 60 seconds max
    reconnect_backoff_factor: 2,
    max_reconnect_attempts: 0, // Infinite retries

    // Keep-alive - matches server timeouts.keep_alive_timeout: 30
    enquire_link_interval: 30000, // 30 seconds
    enquire_link_timeout: 10000, // 10 seconds

    // Timeouts - matches server timeouts.trans_timeout: 30
    response_timeout: 30000, // 30 seconds
    bind_timeout: 60000, // 1 minute
    socket_timeout: 120000, // 2 minutes

    // Enable debug logging
    debug: true,
  });

  // Connection event handlers
  sms.on("connect", () => {
    console.log("✅ Connected to SMPP server");
    console.log("   Host: 192.168.1.2:2777");
    console.log("   System ID: ");
    console.log("   SSL: Enabled\n");
  });

  sms.on("disconnect", () => {
    console.log("⚠️  Disconnected from SMPP server");
  });

  sms.on("reconnecting", ({ attempt, delay }) => {
    console.log(
      `🔄 Reconnecting to server (attempt ${attempt}, delay ${delay}ms)...`,
    );
  });

  sms.on("reconnected", ({ attemptsTaken }) => {
    console.log(`✅ Reconnected successfully after ${attemptsTaken} attempts`);
  });

  sms.on("error", (error) => {
    console.error("❌ Error:", error.message);
  });

  // Message event handlers
  sms.on("sms_sent", ({ messageId, params }) => {
    console.log("✅ SMS sent successfully");
    console.log("   Message ID:", messageId);
    console.log("   To:", params.destination_addr);
  });

  sms.on("sms_received", (msg) => {
    console.log("📩 Received SMS:");
    console.log("   From:", msg.from);
    console.log("   To:", msg.to);
    console.log("   Message:", msg.message);
    console.log("   Time:", msg.timestamp);
  });

  sms.on("delivery_receipt", (receipt) => {
    console.log("📨 Delivery Receipt:");
    console.log("   Message ID:", receipt.messageId);
    console.log("   Status:", receipt.status);
    console.log("   Time:", receipt.timestamp);
    if (receipt.error) {
      console.log("   Error:", receipt.error);
    }
  });

  try {
    // Connect to server
    console.log("Connecting to SMPP server...\n");
    await sms.connect();

    // Send a test SMS
    // console.log("Sending test SMS...");
    // const messageId = await sms.sendSMS({
    //   to: "+1234567890", // Replace with your test number
    //   message: "Test message from SMPP client",
    //   requestDeliveryReceipt: true,
    // });

    // console.log("\n✅ Message queued/sent, ID:", messageId);

    // Keep connection alive to receive messages
    console.log(
      "\n📡 Listening for incoming messages and delivery receipts...",
    );
    console.log("   Press Ctrl+C to stop\n");

    // Keep running
    await new Promise(() => {}); // Run forever
  } catch (error) {
    console.error("\n❌ Failed:", error);
  }
}

/**
 * Example 2: Using SMPPClient (Low-Level API)
 */
async function example2_SMPPClient() {
  console.log("\n=== Example 2: SMPPClient Direct ===\n");

  const client = new SMPPClient({
    // Server connection (via AWS SSM port forwarding)
    host: "192.168.1.2",
    port: 2777,
    system_id: "",
    password: "",
    system_type: "ESME",
    interface_version: 0x34,
    addr_ton: 0,
    addr_npi: 0,
    address_range: "",

    // SSL/TLS for AWS SSM tunnel
    use_tls: true,
    tls_options: {
      rejectUnauthorized: false,
      servername: "192.168.1.2", // Actual server
      checkServerIdentity: false, // Disable for 192.168.1.2 tunnel
    },

    // Auto-reconnect
    auto_reconnect: true,
    reconnect_delay: 5000,

    // Keep-alive
    enquire_link_interval: 30000,

    // Debug
    debug: true,
  });

  // Event handlers
  client.on("connect", () => {
    console.log("✅ Connected and bound");
  });

  client.on("deliver_sm", (pdu) => {
    const message = pdu.short_message.toString("utf8");
    console.log("📩 Received message:");
    console.log("   From:", pdu.source_addr);
    console.log("   Text:", message);
  });

  client.on("reconnecting", ({ attempt }) => {
    console.log(`🔄 Reconnecting (attempt ${attempt})...`);
  });

  try {
    // Connect as transceiver (can send and receive)
    await client.connect("transceiver");

    // Send SMS with full control
    const messageId = await client.submitSM({
      source_addr: "MyApp",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      destination_addr: "+1234567890", // Replace with your test number
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      short_message: "Test from SMPPClient",
      data_coding: DataCoding.SMSC_DEFAULT,
      registered_delivery: 1, // Request delivery receipt
    });

    console.log("✅ Message sent, ID:", messageId);

    // Keep running
    await new Promise(() => {});
  } catch (error) {
    console.error("❌ Failed:", error);
  }
}

/**
 * Example 3: Production Service with Error Handling
 */
class ProductionSMSService {
  private sms: SMSManager;
  private isRunning = false;

  constructor() {
    this.sms = new SMSManager({
      // AWS SSM port forwarding: 192.168.1.2:2777 → 192.168.1.2:2777
      host: "192.168.1.2",
      port: 2777,
      system_id: "",
      password: "",
      system_type: "ESME",
      interface_version: 0x34,

      // SSL/TLS for tunneled connection
      use_tls: true,
      tls_options: {
        rejectUnauthorized: false,
        servername: "192.168.1.2",
        checkServerIdentity: false,
      },

      // Auto-reconnect (handles server downtime)
      auto_reconnect: true,
      reconnect_delay: 5000,
      max_reconnect_delay: 60000,
      max_reconnect_attempts: 0, // Never give up

      // Keep-alive
      enquire_link_interval: 30000,
      enquire_link_timeout: 10000,

      // Timeouts
      response_timeout: 30000,

      // Queue settings
      queueEnabled: true,
      queueMaxRetries: 5,
      rateLimitPerSecond: 10,

      // Debug
      debug: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.sms.on("connect", () => {
      console.log("[SERVICE] ✅ Connected to SMPP server");
    });

    this.sms.on("disconnect", () => {
      console.log("[SERVICE] ⚠️  Disconnected - will auto-reconnect");
    });

    this.sms.on("reconnecting", ({ attempt, delay }) => {
      console.log(
        `[SERVICE] 🔄 Reconnecting... (attempt ${attempt}, delay ${delay}ms)`,
      );
    });

    this.sms.on("reconnected", ({ attemptsTaken }) => {
      console.log(`[SERVICE] ✅ Reconnected after ${attemptsTaken} attempts`);
    });

    this.sms.on("error", (error) => {
      console.error("[SERVICE] ❌ Error:", error.message);
    });

    this.sms.on("sms_sent", ({ messageId }) => {
      console.log(`[SERVICE] ✅ SMS sent: ${messageId}`);
    });

    this.sms.on("sms_failed", ({ error, permanent }) => {
      console.error(
        `[SERVICE] ❌ SMS failed: ${error} (permanent: ${permanent})`,
      );
    });

    this.sms.on("sms_retry", ({ messageId, attempt, willRetry }) => {
      console.log(
        `[SERVICE] 🔄 Retrying SMS ${messageId} (attempt ${attempt}, willRetry: ${willRetry})`,
      );
    });

    this.sms.on("sms_received", (msg) => {
      console.log(`[SERVICE] 📩 Received SMS from ${msg.from}: ${msg.message}`);
    });

    this.sms.on("delivery_receipt", (receipt) => {
      console.log(
        `[SERVICE] 📨 Delivery receipt: ${receipt.messageId} - ${receipt.status}`,
      );
    });
  }

  async start() {
    console.log("[SERVICE] Starting SMPP service...");
    console.log("[SERVICE] Server: 192.168.1.2:2777 (SSL)");
    console.log("[SERVICE] System ID: \n");

    this.isRunning = true;
    await this.sms.connect();

    console.log("[SERVICE] Service started successfully");
    console.log("[SERVICE] Listening for incoming messages...\n");
  }

  async stop() {
    console.log("\n[SERVICE] Stopping...");
    this.isRunning = false;
    await this.sms.disconnect();
    console.log("[SERVICE] Stopped");
  }

  async sendTestMessage(to: string, message: string) {
    try {
      const messageId = await this.sms.sendSMS({
        to,
        message,
        requestDeliveryReceipt: true,
      });
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}

/**
 * Main function
 */
async function main() {
  const exampleNum = process.argv[2] || "1";

  switch (exampleNum) {
    case "1":
      await example1_SMSManager();
      break;
    case "2":
      await example2_SMPPClient();
      break;
    case "3": {
      const service = new ProductionSMSService();

      // Graceful shutdown
      process.on("SIGTERM", async () => {
        console.log("\nSIGTERM received");
        await service.stop();
        process.exit(0);
      });

      process.on("SIGINT", async () => {
        console.log("\nSIGINT received");
        await service.stop();
        process.exit(0);
      });

      await service.start();

      // Send a test message
      const result = await service.sendTestMessage(
        "+1234567890", // Replace with your test number
        "Test from production service",
      );
      console.log("[SERVICE] Test message result:", result);

      // Keep running
      await new Promise(() => {});
      break;
    }
    default:
      console.log("Usage: node examples/production-example.js [1|2|3]");
      console.log("  1: SMSManager with auto-reconnect");
      console.log("  2: SMPPClient direct");
      console.log("  3: Production service");
  }
}

// Run if executed directly
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
