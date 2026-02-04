/**
 * SMPP v5 Compliance Features Demo
 * 
 * This example demonstrates the SMPP v5 compliance improvements:
 * 1. Error code handling (retryable vs permanent)
 * 2. Delivery receipt parsing (TLV + text fallback)
 * 3. Message length validation (encoding-aware)
 * 4. Validity period formatting (relative & absolute)
 */

import { SMSManager } from "../src/lib/sms-manager.js";
import { DataCoding } from "../src/lib/types.js";

async function main() {
  const manager = new SMSManager({
    host: process.env.SMPP_HOST || "localhost",
    port: parseInt(process.env.SMPP_PORT || "2775"),
    system_id: process.env.SMPP_SYSTEM_ID || "test",
    password: process.env.SMPP_PASSWORD || "test",
    
    // Queue settings
    queueEnabled: true,
    queueMaxRetries: 3,
    rateLimitPerSecond: 10,
    
    // Logging
    logger: {
      debug: (msg, meta) => console.log("[DEBUG]", msg, meta),
      info: (msg, meta) => console.log("[INFO]", msg, meta),
      warn: (msg, meta) => console.warn("[WARN]", msg, meta),
      error: (msg, meta) => console.error("[ERROR]", msg, meta),
    },
  });

  // ============================================================================
  // 1. ERROR CODE HANDLING DEMO
  // ============================================================================
  
  console.log("\n=== 1. Error Code Handling Demo ===\n");

  // Listen for retry events
  manager.on("sms_retry", (event) => {
    console.log(`Retrying message ${event.messageId} (attempt ${event.attempt})`);
    console.log(`Error: ${event.error}`);
    console.log(`Will retry: ${event.willRetry}`);
  });

  // Listen for permanent failures
  manager.on("sms_failed", (event) => {
    if (event.permanent) {
      console.error(`❌ PERMANENT FAILURE - DO NOT RETRY`);
      console.error(`Message: ${event.messageId}`);
      console.error(`Error: ${event.error}`);
      console.error(`Destination: ${event.destination}`);
    } else {
      console.warn(`Temporary failure, will retry`);
    }
  });

  // ============================================================================
  // 2. DELIVERY RECEIPT PARSING DEMO
  // ============================================================================
  
  console.log("\n=== 2. Delivery Receipt Parsing Demo ===\n");

  // Listen for delivery receipts (supports both TLV and text format)
  manager.on("delivery_receipt", (receipt) => {
    console.log("Delivery Receipt Received:");
    console.log(`  Message ID: ${receipt.messageId}`);
    console.log(`  Status: ${receipt.status}`);
    if (receipt.error) {
      console.log(`  Error: ${receipt.error}`);
    }
    console.log(`  Timestamp: ${receipt.timestamp.toISOString()}`);
  });

  // ============================================================================
  // 3. MESSAGE LENGTH VALIDATION DEMO
  // ============================================================================
  
  console.log("\n=== 3. Message Length Validation Demo ===\n");

  await manager.connect();

  // Example 3a: GSM 7-bit encoding (160 char limit)
  console.log("Sending GSM 7-bit message (160 char limit)...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "This is a standard GSM message",
      dataCoding: DataCoding.SMSC_DEFAULT, // 0x00
    });
    console.log("✓ GSM message sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 3b: UCS-2/Unicode encoding (70 char limit)
  console.log("\nSending Unicode message (70 char limit)...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Hello 世界! 🌍 Unicode test",
      dataCoding: DataCoding.UCS2, // 0x08
    });
    console.log("✓ Unicode message sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 3c: Long message warning
  console.log("\nSending long Unicode message (will warn)...");
  try {
    const longMessage = "A".repeat(80); // Exceeds 70-char limit for UCS-2
    await manager.sendSMS({
      to: "+1234567890",
      message: longMessage,
      dataCoding: DataCoding.UCS2,
    });
    console.log("✓ Long message sent (check logs for warning)");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // ============================================================================
  // 4. VALIDITY PERIOD FORMATTING DEMO
  // ============================================================================
  
  console.log("\n=== 4. Validity Period Formatting Demo ===\n");

  // Example 4a: Relative validity period (12 hours from now)
  console.log("Creating relative validity period (12 hours)...");
  const relativeValidity = SMSManager.createRelativeValidityPeriod(12);
  console.log(`  Format: ${relativeValidity}`);
  console.log(`  Length: ${relativeValidity.length} octets`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Message with 12-hour validity period",
      validityPeriod: relativeValidity,
      requestDeliveryReceipt: true,
    });
    console.log("✓ Message with relative validity sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 4b: Absolute validity period (specific date/time)
  console.log("\nCreating absolute validity period (Dec 31, 2025)...");
  const expiryDate = new Date("2025-12-31T23:59:00Z");
  const absoluteValidity = SMSManager.createAbsoluteValidityPeriod(expiryDate);
  console.log(`  Expiry Date: ${expiryDate.toISOString()}`);
  console.log(`  Format: ${absoluteValidity}`);
  console.log(`  Length: ${absoluteValidity.length} octets`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Message with absolute validity period",
      validityPeriod: absoluteValidity,
      requestDeliveryReceipt: true,
    });
    console.log("✓ Message with absolute validity sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 4c: Different validity periods
  console.log("\nValidity period examples:");
  console.log(`  1 hour:  ${SMSManager.createRelativeValidityPeriod(1)}`);
  console.log(`  24 hours: ${SMSManager.createRelativeValidityPeriod(24)}`);
  console.log(`  48 hours: ${SMSManager.createRelativeValidityPeriod(48)}`);
  
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  console.log(`  Tomorrow: ${SMSManager.createAbsoluteValidityPeriod(tomorrow)}`);

  // ============================================================================
  // COMPLETE EXAMPLE: All features combined
  // ============================================================================
  
  console.log("\n=== Complete Example: All Features Combined ===\n");

  try {
    const messageId = await manager.sendSMS({
      to: "+1234567890",
      from: "MyApp",
      message: "Hello! This is a test message with all SMPP v5 features 🎉",
      
      // Encoding-aware validation
      dataCoding: DataCoding.UCS2,
      
      // Validity period (expires in 24 hours)
      validityPeriod: SMSManager.createRelativeValidityPeriod(24),
      
      // Request delivery receipt
      requestDeliveryReceipt: true,
      
      // Priority
      priority: 1,
    });

    console.log(`✓ Message sent successfully`);
    console.log(`  Message ID: ${messageId}`);
    console.log(`  Encoding: UCS-2 (max 70 chars)`);
    console.log(`  Validity: 24 hours from now`);
    console.log(`  Delivery Receipt: Requested`);
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // ============================================================================
  // Queue Statistics
  // ============================================================================
  
  console.log("\n=== Queue Statistics ===\n");
  const stats = manager.getQueueStats();
  console.log(`  Total Enqueued: ${stats.totalEnqueued}`);
  console.log(`  Total Sent: ${stats.totalSent}`);
  console.log(`  Total Failed: ${stats.totalFailed}`);
  console.log(`  Currently In Queue: ${stats.inQueue}`);
  console.log(`  Currently Processing: ${stats.processing}`);

  // Wait a bit for any pending operations
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Cleanup
  await manager.disconnect();
  console.log("\n✓ Disconnected from SMPP server");
}

// Run the demo
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

