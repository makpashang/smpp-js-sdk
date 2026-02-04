/**
 * SMPP Client Usage Examples
 * Demonstrates mission-critical features including auto-reconnect
 * Modern TypeScript with node: imports
 */

import type { DeliverSMParams } from "../src/lib/types.js";
import { SMPPClient } from "../src/lib/client.js";
import { TON, NPI, DataCoding } from "../src/lib/types.js";

/**
 * Example 1: Basic Transmitter Connection with Auto-Reconnect
 */
async function example1_basicTransmitter() {
  console.log("\n=== Example 1: Basic Transmitter with Auto-Reconnect ===\n");

  const client = new SMPPClient({
    host: "smpp.example.com",
    port: 2775,
    system_id: "your_system_id",
    password: "your_password",
    system_type: "your_system_type",

    // Auto-reconnect configuration
    auto_reconnect: true,
    reconnect_delay: 1000, // Start with 1 second
    max_reconnect_delay: 60000, // Max 60 seconds
    reconnect_backoff_factor: 2, // Double delay each time
    max_reconnect_attempts: 0, // Infinite attempts (0 = infinite)

    // Keep-alive configuration
    enquire_link_interval: 30000, // Send enquire_link every 30 seconds
    enquire_link_timeout: 10000, // Timeout after 10 seconds

    // Timeouts
    response_timeout: 30000, // 30 second general timeout
    bind_timeout: 30000, // 30 second bind timeout
    socket_timeout: 60000, // 60 second socket timeout

    debug: true,
  } as const);

  // Event handlers
  client.on("connect", () => {
    console.log("✓ Connected to SMPP server");
  });

  client.on("bind", (data) => {
    console.log("✓ Bound successfully:", data);
  });

  client.on("close", (data) => {
    console.log("✗ Connection closed:", data);
  });

  client.on("error", (error: Error) => {
    console.error("✗ Error:", error.message);
  });

  client.on("reconnecting", (data: { attempt: number }) => {
    console.log(`⟳ Reconnecting (attempt ${data.attempt})...`);
  });

  client.on("reconnected", () => {
    console.log("✓ Reconnected successfully");
  });

  client.on("reconnect_failed", () => {
    console.log("✗ Reconnection failed - max attempts reached");
  });

  try {
    // Connect as transmitter
    await client.connect("transmitter");

    // Send a message
    const messageId = await client.submitSM({
      source_addr: "1234",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      destination_addr: "+1234567890",
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      short_message: "Hello from SMPP client!",
      data_coding: DataCoding.SMSC_DEFAULT,
      registered_delivery: 1, // Request delivery receipt
    });

    console.log("✓ Message sent successfully, ID:", messageId);

    // Keep connection alive
    await new Promise((resolve) => setTimeout(resolve, 60000));
  } catch (error) {
    console.error("✗ Failed:", error);
  } finally {
    await client.disconnect();
  }
}

/**
 * Example 2: Transceiver (Send and Receive) with Delivery Reports
 */
async function example2_transceiver() {
  console.log("\n=== Example 2: Transceiver with Delivery Reports ===\n");

  const client = new SMPPClient({
    host: "smpp.example.com",
    port: 2775,
    system_id: "your_system_id",
    password: "your_password",

    auto_reconnect: true,
    debug: true,
  });

  // Handle incoming messages
  client.on("deliver_sm", (message: DeliverSMParams) => {
    console.log("✉ Received message:");
    console.log("  From:", message.source_addr);
    console.log("  To:", message.destination_addr);
    console.log("  Text:", message.short_message.toString("utf8"));

    // Check if it's a delivery receipt
    if (message.esm_class === 0x04) {
      console.log("  📨 This is a delivery receipt");
    }
  });

  client.on("connect", () => {
    console.log("✓ Connected as transceiver");
  });

  try {
    // Connect as transceiver (can send and receive)
    await client.connect("transceiver");

    // Send multiple messages
    for (let i = 0; i < 3; i++) {
      const messageId = await client.submitSM({
        source_addr: "MyApp",
        source_addr_ton: TON.ALPHANUMERIC,
        source_addr_npi: NPI.UNKNOWN,
        destination_addr: "+1234567890",
        dest_addr_ton: TON.INTERNATIONAL,
        dest_addr_npi: NPI.ISDN,
        short_message: `Test message ${i + 1}`,
        data_coding: DataCoding.SMSC_DEFAULT,
        registered_delivery: 1,
      });

      console.log(`✓ Message ${i + 1} sent, ID:`, messageId);

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Wait for delivery reports
    console.log("\nWaiting for delivery reports (60 seconds)...");
    await new Promise((resolve) => setTimeout(resolve, 60000));
  } catch (error) {
    console.error("✗ Failed:", error);
  } finally {
    await client.disconnect();
  }
}

/**
 * Example 3: Production-Ready with Error Handling and Monitoring
 */
class ProductionSMPPService {
  private client: SMPPClient;
  private message_queue: Array<{ params: any; retry_count: number }> = [];
  private is_processing: boolean = false;
  private metrics = {
    sent: 0,
    failed: 0,
    received: 0,
    reconnects: 0,
  };

  constructor() {
    this.client = new SMPPClient({
      host: process.env["SMPP_HOST"] || "smpp.example.com",
      port: parseInt(process.env["SMPP_PORT"] || "2775"),
      system_id: process.env["SMPP_SYSTEM_ID"] || "your_system_id",
      password: process.env["SMPP_PASSWORD"] || "your_password",

      // Production settings
      auto_reconnect: true,
      reconnect_delay: 2000,
      max_reconnect_delay: 120000,
      reconnect_backoff_factor: 2,
      max_reconnect_attempts: 0, // Never give up in production

      enquire_link_interval: 30000,
      enquire_link_timeout: 15000,
      response_timeout: 60000,

      debug: process.env["NODE_ENV"] !== "production",
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on("connect", () => {
      console.log("[SERVICE] Connected to SMPP server");
      // Process queued messages
      this.processQueue();
    });

    this.client.on("reconnecting", (data) => {
      console.log(`[SERVICE] Reconnecting (attempt ${data.attempt})...`);
      this.metrics.reconnects++;
    });

    this.client.on("reconnected", () => {
      console.log("[SERVICE] Reconnected successfully");
      // Process any queued messages
      this.processQueue();
    });

    this.client.on("deliver_sm", (message: DeliverSMParams) => {
      this.metrics.received++;
      console.log("[SERVICE] Received message from", message.source_addr);
      // Handle the message (store in DB, forward, etc.)
      this.handleIncomingMessage(message);
    });

    this.client.on("error", (error) => {
      console.error("[SERVICE] Error:", error.message);
      // Log to monitoring system
      this.logError(error);
    });

    this.client.on("close", () => {
      console.log("[SERVICE] Connection closed, will auto-reconnect...");
    });
  }

  async start() {
    console.log("[SERVICE] Starting SMPP service...");
    await this.client.connect("transceiver");
    console.log("[SERVICE] Service started successfully");

    // Log metrics every minute
    setInterval(() => {
      console.log("[METRICS]", this.metrics);
    }, 60000);
  }

  async stop() {
    console.log("[SERVICE] Stopping SMPP service...");
    await this.client.disconnect();
    console.log("[SERVICE] Service stopped");
  }

  async sendMessage(to: string, message: string): Promise<string> {
    const params = {
      source_addr: "YourApp",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      destination_addr: to,
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      short_message: message,
      data_coding: DataCoding.SMSC_DEFAULT,
      registered_delivery: 1,
    };

    try {
      if (!this.client.isConnected()) {
        // Queue the message if not connected
        this.message_queue.push({ params, retry_count: 0 });
        console.log("[SERVICE] Message queued (not connected)");
        return "QUEUED";
      }

      const messageId = await this.client.submitSM(params);
      this.metrics.sent++;
      console.log("[SERVICE] Message sent successfully:", messageId);
      return messageId;
    } catch (error) {
      this.metrics.failed++;
      console.error("[SERVICE] Failed to send message:", error);

      // Queue for retry
      this.message_queue.push({ params, retry_count: 0 });
      throw error;
    }
  }

  private async processQueue() {
    if (this.is_processing || this.message_queue.length === 0) {
      return;
    }

    this.is_processing = true;
    console.log(
      `[SERVICE] Processing ${this.message_queue.length} queued messages`
    );

    while (this.message_queue.length > 0 && this.client.isConnected()) {
      const item = this.message_queue.shift();
      if (!item) break;

      try {
        const messageId = await this.client.submitSM(item.params);
        this.metrics.sent++;
        console.log("[SERVICE] Queued message sent:", messageId);
      } catch (error) {
        console.error("[SERVICE] Failed to send queued message:", error);

        // Retry logic
        if (item.retry_count < 3) {
          item.retry_count++;
          this.message_queue.push(item);
        } else {
          this.metrics.failed++;
          console.error("[SERVICE] Message failed after 3 retries");
        }
      }

      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.is_processing = false;
  }

  private handleIncomingMessage(message: DeliverSMParams) {
    // Store in database, forward to application, etc.
    console.log("[SERVICE] Processing incoming message");

    // Example: Check if it's a delivery receipt
    if (message.esm_class === 0x04) {
      console.log("[SERVICE] Delivery receipt received");
      // Update message status in database
    } else {
      console.log("[SERVICE] MO message received");
      // Forward to application
    }
  }

  private logError(error: Error) {
    // Send to monitoring system (e.g., Sentry, CloudWatch, etc.)
    console.error("[MONITORING] Error logged:", error);
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

/**
 * Example 4: Running the production service
 */
async function example3_productionService() {
  console.log("\n=== Example 3: Production Service ===\n");

  const service = new ProductionSMPPService();

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down gracefully...");
    await service.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down gracefully...");
    await service.stop();
    process.exit(0);
  });

  try {
    await service.start();

    // Send test messages
    await service.sendMessage("+1234567890", "Test message 1");
    await service.sendMessage("+1234567890", "Test message 2");

    // Get metrics
    console.log("Current metrics:", service.getMetrics());

    // Keep service running
    console.log("Service running... Press Ctrl+C to stop");
    await new Promise(() => {}); // Run forever
  } catch (error) {
    console.error("Service error:", error);
    await service.stop();
    process.exit(1);
  }
}

/**
 * Main function to run examples
 */
async function main() {
  const example = process.argv[2] || "1";

  switch (example) {
    case "1":
      await example1_basicTransmitter();
      break;
    case "2":
      await example2_transceiver();
      break;
    case "3":
      await example3_productionService();
      break;
    default:
      console.log("Usage: ts-node examples.ts [1|2|3]");
      console.log("  1: Basic transmitter with auto-reconnect");
      console.log("  2: Transceiver with delivery reports");
      console.log("  3: Production service with queue and monitoring");
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { ProductionSMPPService };
