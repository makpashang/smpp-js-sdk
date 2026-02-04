/**
 * SMPP v5 Enhanced Features Demo
 * 
 * This example demonstrates the latest SMPP v5 enhancements:
 * 1. Extended data_coding support (JIS, Cyrillic, Hebrew, etc.)
 * 2. Additional SMPP v5.0 error codes (service type restrictions)
 * 3. Enhanced relative validity periods (minutes, hours, days)
 * 4. Detailed ESM class bit field documentation and helpers
 */

import { SMSManager } from "../src/lib/sms-manager.js";
import { DataCoding, ESMClass } from "../src/lib/types.js";

async function main() {
  const manager = new SMSManager({
    host: process.env.SMPP_HOST || "localhost",
    port: parseInt(process.env.SMPP_PORT || "2775"),
    system_id: process.env.SMPP_SYSTEM_ID || "test",
    password: process.env.SMPP_PASSWORD || "test",
    
    logger: {
      debug: (msg, meta) => console.log("[DEBUG]", msg, meta),
      info: (msg, meta) => console.log("[INFO]", msg, meta),
      warn: (msg, meta) => console.warn("[WARN]", msg, meta),
      error: (msg, meta) => console.error("[ERROR]", msg, meta),
    },
  });

  await manager.connect();

  // ============================================================================
  // 1. EXTENDED DATA CODING SUPPORT
  // ============================================================================
  
  console.log("\n=== 1. Extended Data Coding Support ===\n");

  // Example 1a: Latin-1 encoding (ISO-8859-1)
  console.log("Sending Latin-1 encoded message...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Café résumé naïve", // Latin-1 special characters
      dataCoding: DataCoding.LATIN_1, // 0x03
    });
    console.log("✓ Latin-1 message sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 1b: 8-bit binary data
  console.log("\nSending 8-bit binary data...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Binary data message",
      dataCoding: DataCoding.OCTET_UNSPECIFIED, // 0x02
    });
    console.log("✓ Binary data message sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 1c: Cyrillic encoding (with UTF-8 fallback)
  console.log("\nSending Cyrillic message (ISO-8859-5 with UTF-8 fallback)...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Привет мир!", // Cyrillic text
      dataCoding: DataCoding.CYRILLIC, // 0x06
    });
    console.log("✓ Cyrillic message sent (check logs for encoding fallback)");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 1d: Hebrew/Latin encoding (with UTF-8 fallback)
  console.log("\nSending Hebrew message (ISO-8859-8 with UTF-8 fallback)...");
  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "שלום עולם!", // Hebrew text
      dataCoding: DataCoding.LATIN_HEBREW, // 0x07
    });
    console.log("✓ Hebrew message sent (check logs for encoding fallback)");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // ============================================================================
  // 2. ENHANCED ERROR HANDLING (SMPP v5.0 Error Codes)
  // ============================================================================
  
  console.log("\n=== 2. Enhanced Error Handling ===\n");

  // Listen for permanent failures (including new service type errors)
  manager.on("sms_failed", (event) => {
    if (event.permanent) {
      console.error("❌ PERMANENT FAILURE - Service Configuration Issue");
      console.error(`   Error: ${event.error}`);
      console.error(`   Possible causes:`);
      
      if (event.error.includes("ESME_RSERTYPUNAUTH")) {
        console.error("   - Service type is not authorized for this account");
      } else if (event.error.includes("ESME_RSERTYPDENIED")) {
        console.error("   - Service type access has been denied");
      } else if (event.error.includes("ESME_RSERTYPUNAVAIL")) {
        console.error("   - Service type is currently unavailable");
      } else if (event.error.includes("ESME_RPROHIBITED_DEST")) {
        console.error("   - Destination is blocked or prohibited");
      }
      
      console.error("   Action: Check account configuration and permissions");
    }
  });

  console.log("Error handling configured for SMPP v5.0 error codes:");
  console.log("  ✓ ESME_RSERTYPUNAUTH - Service type unauthorized");
  console.log("  ✓ ESME_RSERTYPDENIED - Service type denied");
  console.log("  ✓ ESME_RSERTYPUNAVAIL - Service type unavailable");
  console.log("  ✓ ESME_RPROHIBITED_DEST - Prohibited destination");

  // ============================================================================
  // 3. ENHANCED VALIDITY PERIODS (Minutes, Hours, Days)
  // ============================================================================
  
  console.log("\n=== 3. Enhanced Validity Periods ===\n");

  // Example 3a: 30 minutes validity
  console.log("Creating 30-minute validity period...");
  const validity30min = SMSManager.createRelativeValidityPeriod(30, "minutes");
  console.log(`  Format: ${validity30min}`);
  console.log(`  Expires: 30 minutes from now`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Urgent: Verify within 30 minutes",
      validityPeriod: validity30min,
      requestDeliveryReceipt: true,
    });
    console.log("✓ Message with 30-minute validity sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 3b: 24 hours validity
  console.log("\nCreating 24-hour validity period...");
  const validity24h = SMSManager.createRelativeValidityPeriod(24, "hours");
  console.log(`  Format: ${validity24h}`);
  console.log(`  Expires: 24 hours from now`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Standard notification (24h validity)",
      validityPeriod: validity24h,
    });
    console.log("✓ Message with 24-hour validity sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 3c: 7 days validity
  console.log("\nCreating 7-day validity period...");
  const validity7days = SMSManager.createRelativeValidityPeriod(7, "days");
  console.log(`  Format: ${validity7days}`);
  console.log(`  Expires: 7 days from now`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Non-urgent reminder (7-day validity)",
      validityPeriod: validity7days,
    });
    console.log("✓ Message with 7-day validity sent");
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // Example 3d: Various validity period examples
  console.log("\nValidity Period Examples:");
  console.log(`  5 minutes:  ${SMSManager.createRelativeValidityPeriod(5, "minutes")}`);
  console.log(`  15 minutes: ${SMSManager.createRelativeValidityPeriod(15, "minutes")}`);
  console.log(`  30 minutes: ${SMSManager.createRelativeValidityPeriod(30, "minutes")}`);
  console.log(`  1 hour:     ${SMSManager.createRelativeValidityPeriod(1, "hours")}`);
  console.log(`  12 hours:   ${SMSManager.createRelativeValidityPeriod(12, "hours")}`);
  console.log(`  24 hours:   ${SMSManager.createRelativeValidityPeriod(24, "hours")}`);
  console.log(`  2 days:     ${SMSManager.createRelativeValidityPeriod(2, "days")}`);
  console.log(`  7 days:     ${SMSManager.createRelativeValidityPeriod(7, "days")}`);

  // ============================================================================
  // 4. ESM CLASS BIT FIELD HELPERS
  // ============================================================================
  
  console.log("\n=== 4. ESM Class Bit Field Usage ===\n");

  // Example 4a: Basic delivery receipt request
  console.log("Example: Simple delivery receipt request");
  const esmSimple = ESMClass.MC_DELIVERY_RECEIPT;
  console.log(`  ESM Class: 0x${esmSimple.toString(16).padStart(2, "0")} (${esmSimple.toString(2).padStart(8, "0")})`);
  console.log(`  Breakdown:`);
  console.log(`    - Messaging Mode: ${ESMClass.getMessagingMode(esmSimple)} (Default)`);
  console.log(`    - Delivery Receipt: ${ESMClass.hasDeliveryReceipt(esmSimple) ? "Yes" : "No"}`);
  console.log(`    - Intermediate Notification: ${ESMClass.hasIntermediateNotification(esmSimple) ? "Yes" : "No"}`);

  // Example 4b: Delivery receipt + SME delivery ack
  console.log("\nExample: Delivery receipt + SME delivery acknowledgement");
  const esmWithAck = ESMClass.combine(
    ESMClass.MC_DELIVERY_RECEIPT,
    ESMClass.SME_DELIVERY_ACK
  );
  console.log(`  ESM Class: 0x${esmWithAck.toString(16).padStart(2, "0")} (${esmWithAck.toString(2).padStart(8, "0")})`);
  console.log(`  Breakdown:`);
  console.log(`    - Messaging Mode: ${ESMClass.getMessagingMode(esmWithAck)} (Default)`);
  console.log(`    - Delivery Receipt: ${ESMClass.hasDeliveryReceipt(esmWithAck) ? "Yes" : "No"}`);
  console.log(`    - SME Delivery Ack: Yes`);
  console.log(`    - Intermediate Notification: ${ESMClass.hasIntermediateNotification(esmWithAck) ? "Yes" : "No"}`);

  // Example 4c: Full feature set
  console.log("\nExample: Full feature set");
  const esmFull = ESMClass.combine(
    ESMClass.MC_DELIVERY_RECEIPT,
    ESMClass.SME_BOTH_ACK,
    ESMClass.INTERMEDIATE_NOTIFICATION
  );
  console.log(`  ESM Class: 0x${esmFull.toString(16).padStart(2, "0")} (${esmFull.toString(2).padStart(8, "0")})`);
  console.log(`  Breakdown:`);
  console.log(`    - Messaging Mode: ${ESMClass.getMessagingMode(esmFull)} (Default)`);
  console.log(`    - Delivery Receipt: ${ESMClass.hasDeliveryReceipt(esmFull) ? "Yes" : "No"}`);
  console.log(`    - SME Delivery Ack: Yes`);
  console.log(`    - SME Manual Ack: Yes`);
  console.log(`    - Intermediate Notification: ${ESMClass.hasIntermediateNotification(esmFull) ? "Yes" : "No"}`);

  // Example 4d: Datagram mode with delivery receipt
  console.log("\nExample: Datagram mode with delivery receipt");
  const esmDatagram = ESMClass.combine(
    ESMClass.MODE_DATAGRAM,
    ESMClass.MC_DELIVERY_RECEIPT
  );
  console.log(`  ESM Class: 0x${esmDatagram.toString(16).padStart(2, "0")} (${esmDatagram.toString(2).padStart(8, "0")})`);
  console.log(`  Breakdown:`);
  console.log(`    - Messaging Mode: ${ESMClass.getMessagingMode(esmDatagram)} (Datagram)`);
  console.log(`    - Delivery Receipt: ${ESMClass.hasDeliveryReceipt(esmDatagram) ? "Yes" : "No"}`);

  // ============================================================================
  // COMPLETE EXAMPLE: All enhancements combined
  // ============================================================================
  
  console.log("\n=== Complete Example: All Enhancements Combined ===\n");

  try {
    // Send a Unicode message with:
    // - 30-minute validity period
    // - Full delivery receipt and acknowledgement
    // - Intermediate notification
    const messageId = await manager.sendSMS({
      to: "+1234567890",
      from: "MyApp",
      message: "🎉 Multi-language: Hello! Привет! שלום! 你好!",
      
      // Unicode encoding
      dataCoding: DataCoding.UCS2,
      
      // 30-minute validity
      validityPeriod: SMSManager.createRelativeValidityPeriod(30, "minutes"),
      
      // Request all delivery features
      // Note: ESM class will be set by the client based on requestDeliveryReceipt
      requestDeliveryReceipt: true,
      
      priority: 1,
    });

    console.log("✓ Advanced message sent successfully");
    console.log(`  Message ID: ${messageId}`);
    console.log(`  Features:`);
    console.log(`    - Encoding: UCS-2 (Unicode)`);
    console.log(`    - Validity: 30 minutes`);
    console.log(`    - Delivery Receipt: Requested`);
    console.log(`    - Multi-language content: ✓`);
  } catch (error) {
    console.error("✗ Failed:", (error as Error).message);
  }

  // ============================================================================
  // ESM Class Bit Field Reference
  // ============================================================================
  
  console.log("\n=== ESM Class Bit Field Reference ===\n");
  console.log("Bit Layout:");
  console.log("┌───┬───┬───┬───┬───┬───┬───┬───┐");
  console.log("│ 7 │ 6 │ 5 │ 4 │ 3 │ 2 │ 1 │ 0 │");
  console.log("└───┴───┴───┴───┴───┴───┴───┴───┘");
  console.log("  │   │   │   │   │   │   └─┴───── Bits 0-1: Messaging Mode");
  console.log("  │   │   │   │   │   └─────────── Bit 2: MC Delivery Receipt");
  console.log("  │   │   │   └───┴─────────────── Bits 3-4: SME Acknowledgement");
  console.log("  │   └─────────────────────────── Bit 5: Intermediate Notification");
  console.log("  └─────────────────────────────── Bits 6-7: Reserved/Network Specific");
  console.log("");
  console.log("Common Values:");
  console.log(`  0x00 (${(0x00).toString(2).padStart(8, "0")}) - Default message (no receipt)`);
  console.log(`  0x04 (${(0x04).toString(2).padStart(8, "0")}) - Request delivery receipt`);
  console.log(`  0x0C (${(0x0C).toString(2).padStart(8, "0")}) - Delivery receipt + SME delivery ack`);
  console.log(`  0x14 (${(0x14).toString(2).padStart(8, "0")}) - Delivery receipt + SME manual ack`);
  console.log(`  0x1C (${(0x1C).toString(2).padStart(8, "0")}) - Delivery receipt + both SME acks`);
  console.log(`  0x24 (${(0x24).toString(2).padStart(8, "0")}) - Delivery receipt + intermediate notification`);

  // Wait for pending operations
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await manager.disconnect();
  console.log("\n✓ Disconnected from SMPP server");
}

// Run the demo
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

