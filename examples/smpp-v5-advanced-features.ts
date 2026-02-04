/**
 * SMPP v5 Advanced Features Demo
 * 
 * This example demonstrates advanced SMPP v5 features:
 * 1. Broadcast Area Format types (for Cell Broadcast)
 * 2. Message Waiting Indication (MWI) support
 * 3. Registered Delivery bit field helpers
 * 4. Complete bit field manipulation examples
 */

import { SMSManager } from "../src/lib/sms-manager.js";
import {
  DataCoding,
  ESMClass,
  RegisteredDelivery,
  BroadcastAreaFormat,
} from "../src/lib/types.js";

async function main() {
  console.log("=".repeat(70));
  console.log("SMPP v5 Advanced Features Demonstration");
  console.log("=".repeat(70));

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
  // 1. MESSAGE WAITING INDICATION (MWI)
  // ============================================================================
  
  console.log("\n" + "=".repeat(70));
  console.log("1. Message Waiting Indication (MWI)");
  console.log("=".repeat(70) + "\n");

  console.log("MWI allows activating/deactivating device indicators without storing SMS\n");

  // Example 1a: Activate voicemail indicator (discard message)
  console.log("Example 1a: Activate voicemail indicator (discard message)");
  const mwiVoicemailSet = SMSManager.encodeMWI("voicemail", "set", false);
  console.log(`  Data Coding: 0x${mwiVoicemailSet.toString(16).toUpperCase()} (${mwiVoicemailSet})`);
  console.log(`  Effect: Voicemail indicator ON, message discarded`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "You have 3 new voicemail messages",
      dataCoding: mwiVoicemailSet,
    });
    console.log("  ✓ Voicemail indicator activated\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // Example 1b: Clear voicemail indicator (store message)
  console.log("Example 1b: Clear voicemail indicator (store message)");
  const mwiVoicemailClear = SMSManager.encodeMWI("voicemail", "clear");
  console.log(`  Data Coding: 0x${mwiVoicemailClear.toString(16).toUpperCase()} (${mwiVoicemailClear})`);
  console.log(`  Effect: Voicemail indicator OFF, message stored`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "No more voicemail messages",
      dataCoding: mwiVoicemailClear,
    });
    console.log("  ✓ Voicemail indicator cleared\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // Example 1c: Email waiting indicator
  console.log("Example 1c: Activate email indicator (store message)");
  const mwiEmailSet = SMSManager.encodeMWI("email", "set", true);
  console.log(`  Data Coding: 0x${mwiEmailSet.toString(16).toUpperCase()} (${mwiEmailSet})`);
  console.log(`  Effect: Email indicator ON, message stored`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "You have 5 new emails",
      dataCoding: mwiEmailSet,
    });
    console.log("  ✓ Email indicator activated\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // Example 1d: MWI Reference Table
  console.log("MWI Data Coding Reference:");
  console.log("┌─────────────┬────────┬─────────┬──────────────┐");
  console.log("│ Type        │ Action │ Store   │ Data Coding  │");
  console.log("├─────────────┼────────┼─────────┼──────────────┤");
  console.log(`│ Voicemail   │ Set    │ Discard │ 0x${SMSManager.encodeMWI("voicemail", "set", false).toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("voicemail", "set", false).toString().padEnd(3)}) │`);
  console.log(`│ Voicemail   │ Set    │ Store   │ 0x${SMSManager.encodeMWI("voicemail", "set", true).toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("voicemail", "set", true).toString().padEnd(3)}) │`);
  console.log(`│ Voicemail   │ Clear  │ Store   │ 0x${SMSManager.encodeMWI("voicemail", "clear").toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("voicemail", "clear").toString().padEnd(3)}) │`);
  console.log(`│ Fax         │ Set    │ Discard │ 0x${SMSManager.encodeMWI("fax", "set", false).toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("fax", "set", false).toString().padEnd(3)}) │`);
  console.log(`│ Email       │ Set    │ Discard │ 0x${SMSManager.encodeMWI("email", "set", false).toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("email", "set", false).toString().padEnd(3)}) │`);
  console.log(`│ Email       │ Clear  │ Store   │ 0x${SMSManager.encodeMWI("email", "clear").toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("email", "clear").toString().padEnd(3)}) │`);
  console.log(`│ Other       │ Set    │ Discard │ 0x${SMSManager.encodeMWI("other", "set", false).toString(16).toUpperCase().padEnd(2)} (${SMSManager.encodeMWI("other", "set", false).toString().padEnd(3)}) │`);
  console.log("└─────────────┴────────┴─────────┴──────────────┘\n");

  // ============================================================================
  // 2. REGISTERED DELIVERY BIT FIELD HELPERS
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("2. Registered Delivery Bit Field Helpers");
  console.log("=".repeat(70) + "\n");

  console.log("Registered Delivery controls receipt and acknowledgement requests\n");

  // Example 2a: Basic delivery receipt
  console.log("Example 2a: Basic delivery receipt (success and failure)");
  const regDel1 = RegisteredDelivery.DELIVERY_RECEIPT;
  console.log(`  Value: 0x${regDel1.toString(16).padStart(2, "0")} (${regDel1.toString(2).padStart(8, "0")})`);
  console.log(`  Has Delivery Receipt: ${RegisteredDelivery.hasDeliveryReceipt(regDel1)}`);
  console.log(`  Receipt Type: ${RegisteredDelivery.getDeliveryReceiptType(regDel1)}`);
  console.log(`    (1 = success and failure)\n`);

  // Example 2b: Failure receipt only
  console.log("Example 2b: Delivery receipt on failure only");
  const regDel2 = RegisteredDelivery.FAILURE_RECEIPT;
  console.log(`  Value: 0x${regDel2.toString(16).padStart(2, "0")} (${regDel2.toString(2).padStart(8, "0")})`);
  console.log(`  Has Delivery Receipt: ${RegisteredDelivery.hasDeliveryReceipt(regDel2)}`);
  console.log(`  Receipt Type: ${RegisteredDelivery.getDeliveryReceiptType(regDel2)}`);
  console.log(`    (2 = failure only)\n`);

  // Example 2c: Success receipt only
  console.log("Example 2c: Delivery receipt on success only");
  const regDel3 = RegisteredDelivery.SUCCESS_RECEIPT;
  console.log(`  Value: 0x${regDel3.toString(16).padStart(2, "0")} (${regDel3.toString(2).padStart(8, "0")})`);
  console.log(`  Has Delivery Receipt: ${RegisteredDelivery.hasDeliveryReceipt(regDel3)}`);
  console.log(`  Receipt Type: ${RegisteredDelivery.getDeliveryReceiptType(regDel3)}`);
  console.log(`    (3 = success only)\n`);

  // Example 2d: Combined with SME acknowledgement
  console.log("Example 2d: Delivery receipt + SME delivery acknowledgement");
  const regDel4 = RegisteredDelivery.combine(
    RegisteredDelivery.DELIVERY_RECEIPT,
    RegisteredDelivery.SME_DELIVERY_ACK
  );
  console.log(`  Value: 0x${regDel4.toString(16).padStart(2, "0")} (${regDel4.toString(2).padStart(8, "0")})`);
  console.log(`  Has Delivery Receipt: ${RegisteredDelivery.hasDeliveryReceipt(regDel4)}`);
  console.log(`  Has SME Acknowledgement: ${RegisteredDelivery.hasSMEAcknowledgement(regDel4)}`);
  console.log(`  Receipt Type: ${RegisteredDelivery.getDeliveryReceiptType(regDel4)}\n`);

  // Example 2e: Full feature set
  console.log("Example 2e: Full feature set (all options)");
  const regDel5 = RegisteredDelivery.combine(
    RegisteredDelivery.DELIVERY_RECEIPT,
    RegisteredDelivery.SME_BOTH_ACK,
    RegisteredDelivery.INTERMEDIATE_NOTIF
  );
  console.log(`  Value: 0x${regDel5.toString(16).padStart(2, "0")} (${regDel5.toString(2).padStart(8, "0")})`);
  console.log(`  Has Delivery Receipt: ${RegisteredDelivery.hasDeliveryReceipt(regDel5)}`);
  console.log(`  Has SME Acknowledgement: ${RegisteredDelivery.hasSMEAcknowledgement(regDel5)}`);
  console.log(`  Has Intermediate Notification: ${RegisteredDelivery.hasIntermediateNotification(regDel5)}`);
  console.log(`  Receipt Type: ${RegisteredDelivery.getDeliveryReceiptType(regDel5)}\n`);

  // Example 2f: RegisteredDelivery Reference Table
  console.log("Registered Delivery Bit Field Layout:");
  console.log("┌───┬───┬───┬───┬───┬───┬───┬───┐");
  console.log("│ 7 │ 6 │ 5 │ 4 │ 3 │ 2 │ 1 │ 0 │");
  console.log("└───┴───┴───┴───┴───┴───┴───┴───┘");
  console.log("  │   │   │   │   └───┴───┴─────── Bits 0-1: MC Delivery Receipt");
  console.log("  │   │   │   └───────────────---- Bits 2-3: SME Acknowledgement");
  console.log("  │   └───────────────────────---- Bit 5: Intermediate Notification");
  console.log("  └───┴───────────────────────---- Bits 6-7: Reserved\n");

  console.log("Common Values:");
  console.log(`  0x00 (${(0x00).toString(2).padStart(8, "0")}) - No receipt`);
  console.log(`  0x01 (${(0x01).toString(2).padStart(8, "0")}) - Receipt on success and failure`);
  console.log(`  0x02 (${(0x02).toString(2).padStart(8, "0")}) - Receipt on failure only`);
  console.log(`  0x03 (${(0x03).toString(2).padStart(8, "0")}) - Receipt on success only`);
  console.log(`  0x05 (${(0x05).toString(2).padStart(8, "0")}) - Receipt + SME delivery ack`);
  console.log(`  0x09 (${(0x09).toString(2).padStart(8, "0")}) - Receipt + SME manual ack`);
  console.log(`  0x0D (${(0x0d).toString(2).padStart(8, "0")}) - Receipt + both SME acks`);
  console.log(`  0x11 (${(0x11).toString(2).padStart(8, "0")}) - Receipt + intermediate notification\n`);

  // ============================================================================
  // 3. BROADCAST AREA FORMAT TYPES
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("3. Broadcast Area Format Types");
  console.log("=".repeat(70) + "\n");

  console.log("Broadcast Area Format defines geographic areas for Cell Broadcast\n");

  // Example 3a: Broadcast Area Format Reference
  console.log("Broadcast Area Format Types (SMPP v5 Spec Section 4.8.4.4.1):");
  console.log("┌──────┬──────────────────────┬────────────────────────────────────┐");
  console.log("│ Code │ Format Type          │ Description                        │");
  console.log("├──────┼──────────────────────┼────────────────────────────────────┤");
  console.log(`│ 0x${BroadcastAreaFormat.ALIAS_NAME.toString(16).padStart(2, "0").toUpperCase()} │ ALIAS_NAME           │ Alias name for broadcast area      │`);
  console.log(`│ 0x${BroadcastAreaFormat.ELLIPSOID_ARC.toString(16).padStart(2, "0").toUpperCase()} │ ELLIPSOID_ARC        │ Ellipsoid arc (center + radius)    │`);
  console.log(`│ 0x${BroadcastAreaFormat.POLYGON.toString(16).padStart(2, "0").toUpperCase()} │ POLYGON              │ Polygon area (coordinates)         │`);
  console.log(`│ 0x${BroadcastAreaFormat.CELL_ID.toString(16).padStart(2, "0").toUpperCase()} │ CELL_ID              │ GSM/UMTS Cell ID                   │`);
  console.log(`│ 0x${BroadcastAreaFormat.LOCATION_AREA.toString(16).padStart(2, "0").toUpperCase()} │ LOCATION_AREA        │ Location Area Code (LAC)           │`);
  console.log(`│ 0x${BroadcastAreaFormat.ROUTING_AREA.toString(16).padStart(2, "0").toUpperCase()} │ ROUTING_AREA         │ Routing Area Code (RAC)            │`);
  console.log(`│ 0x${BroadcastAreaFormat.SERVICE_AREA.toString(16).padStart(2, "0").toUpperCase()} │ SERVICE_AREA         │ Service Area Code (SAC)            │`);
  console.log(`│ 0x${BroadcastAreaFormat.CDMA_CGI.toString(16).padStart(2, "0").toUpperCase()} │ CDMA_CGI             │ CDMA Cell Global ID                │`);
  console.log(`│ 0x${BroadcastAreaFormat.CDMA_SID_NID.toString(16).padStart(2, "0").toUpperCase()} │ CDMA_SID_NID         │ CDMA System ID / Network ID        │`);
  console.log(`│ 0x${BroadcastAreaFormat.UTRAN_CELL_ID.toString(16).padStart(2, "0").toUpperCase()} │ UTRAN_CELL_ID        │ UTRAN Cell ID                      │`);
  console.log(`│ 0x${BroadcastAreaFormat.LAI.toString(16).padStart(2, "0").toUpperCase()} │ LAI                  │ Location Area Identification       │`);
  console.log("└──────┴──────────────────────┴────────────────────────────────────┘\n");

  console.log("Usage Example (for broadcast_sm operations):");
  console.log("```typescript");
  console.log("// Define broadcast area using Cell ID format");
  console.log("const broadcastArea = {");
  console.log("  format: BroadcastAreaFormat.CELL_ID,");
  console.log("  details: Buffer.from([0x01, 0x23, 0x45]), // Cell ID data");
  console.log("};");
  console.log("");
  console.log("// Use in broadcast_sm TLV parameter");
  console.log("const broadcast_area_identifier = {");
  console.log("  tag: TLVTag.BROADCAST_AREA_IDENTIFIER,");
  console.log("  value: broadcastArea.details,");
  console.log("};");
  console.log("```\n");

  // ============================================================================
  // 4. COMPLETE EXAMPLE - All Advanced Features Combined
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("4. Complete Example - All Features Combined");
  console.log("=".repeat(70) + "\n");

  // Example 4a: Send message with full registered delivery
  console.log("Sending message with full delivery tracking:");
  try {
    const messageId = await manager.sendSMS({
      to: "+1234567890",
      from: "AdvancedSMS",
      message: "Test message with full tracking",
      requestDeliveryReceipt: true,
      validityPeriod: SMSManager.createRelativeValidityPeriod(30, "minutes"),
      priority: 1,
    });
    console.log("  ✓ Message sent successfully");
    console.log(`    Message ID: ${messageId}`);
    console.log(`    Features: Delivery receipt + 30min validity\n`);
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // Example 4b: Send voicemail notification with MWI
  console.log("Sending voicemail notification (MWI):");
  try {
    const messageId = await manager.sendSMS({
      to: "+1234567890",
      message: "You have 2 new voicemail messages",
      dataCoding: SMSManager.encodeMWI("voicemail", "set", false),
    });
    console.log("  ✓ Voicemail indicator activated");
    console.log(`    Message ID: ${messageId}`);
    console.log(`    Effect: Voicemail icon ON, message discarded\n`);
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // ============================================================================
  // Summary
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("Summary of Advanced Features");
  console.log("=".repeat(70) + "\n");

  console.log("✅ Message Waiting Indication (MWI)");
  console.log("   - Activate/deactivate device indicators");
  console.log("   - Support for voicemail, fax, email, other");
  console.log("   - Control message storage\n");

  console.log("✅ Registered Delivery Helpers");
  console.log("   - Fine-grained receipt control");
  console.log("   - SME acknowledgement support");
  console.log("   - Intermediate notification\n");

  console.log("✅ Broadcast Area Formats");
  console.log("   - 11 area format types");
  console.log("   - GSM/UMTS/CDMA support");
  console.log("   - Geographic and cell-based areas\n");

  console.log("✅ Complete SMPP v5 Compliance");
  console.log("   - All bit fields documented");
  console.log("   - Helper functions for manipulation");
  console.log("   - Type-safe usage\n");

  // Wait for pending operations
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await manager.disconnect();
  console.log("=".repeat(70));
  console.log("✓ Demo completed successfully");
  console.log("=".repeat(70));
}

// Run the demo
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

