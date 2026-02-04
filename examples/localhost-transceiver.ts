/**
 * Localhost Transceiver Example
 * Simple example for connecting to an SMPP server on localhost:2775
 */

import type { DeliverSMParams } from "../src/lib/types.js";
import { SMPPClient } from "../src/lib/client.js";
import { TON, NPI, DataCoding } from "../src/lib/types.js";

/**
 * Connect to localhost SMPP transceiver
 */
async function localhostTransceiver() {
  console.log("\n=== Connecting to Localhost SMPP Transceiver ===\n");

  const client = new SMPPClient({
    host: "localhost",
    port: 2775,
    system_id: "test",
    password: "test",
    system_type: "",

    // Auto-reconnect configuration
    auto_reconnect: true,
    reconnect_delay: 1000,
    max_reconnect_delay: 60000,
    reconnect_backoff_factor: 2,
    max_reconnect_attempts: 0, // Infinite attempts

    // Keep-alive configuration
    enquire_link_interval: 30000,
    enquire_link_timeout: 10000,

    // Timeouts
    response_timeout: 30000,
    bind_timeout: 30000,
    socket_timeout: 60000,

    debug: true,
  } as const);

  // Connection events
  client.on("connect", () => {
    console.log("✓ Connected to localhost:2775");
  });

  client.on("bind", (data) => {
    console.log("✓ Bound as transceiver:", data);
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

  // Handle incoming messages and delivery reports
  client.on("deliver_sm", (message: DeliverSMParams) => {
    console.log("\n📨 Received deliver_sm:");
    console.log("  From:", message.source_addr);
    console.log("  To:", message.destination_addr);
    
    // Check if it's a delivery receipt
    if (message.esm_class === 0x04) {
      console.log("  Type: Delivery Receipt");
      console.log("  Status:", message.short_message?.toString("utf8"));
    } else {
      console.log("  Type: Mobile-Originated Message");
      console.log("  Message:", message.short_message?.toString("utf8"));
    }
  });

  try {
    // Connect as transceiver (can send and receive)
    await client.connect("transceiver");
    console.log("\n✓ Successfully connected as transceiver\n");

    // Send a test message
    console.log("Sending test message...");
    const messageId = await client.submitSM({
      source_addr: "1234",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      destination_addr: "+1234567890",
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      short_message: "Hello from localhost transceiver!",
      data_coding: DataCoding.SMSC_DEFAULT,
      registered_delivery: 1, // Request delivery receipt
    });

    console.log("✓ Message sent successfully");
    console.log("  Message ID:", messageId);
    console.log("\nWaiting for delivery reports and incoming messages...");
    console.log("Press Ctrl+C to exit\n");

    // Keep connection alive to receive messages
    await new Promise(() => {}); // Run until interrupted
  } catch (error) {
    console.error("✗ Failed:", error);
  } finally {
    await client.disconnect();
    console.log("\n✓ Disconnected");
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n\nReceived SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the example
localhostTransceiver().catch(console.error);

