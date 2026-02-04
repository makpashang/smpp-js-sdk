/**
 * Message Encoding and Long Message Handling Demo
 * 
 * This example demonstrates:
 * 1. Proper message encoding based on data_coding
 * 2. Automatic message_payload TLV usage for messages > 254 bytes
 * 3. Byte-accurate validation vs character count
 * 4. Different encoding behaviors (ASCII, UCS-2, Latin-1, etc.)
 */

import { SMSManager } from "../src/lib/sms-manager.js";
import { DataCoding } from "../src/lib/types.js";

async function main() {
  console.log("=".repeat(70));
  console.log("Message Encoding and Long Message Handling Demo");
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
  // 1. ENCODING-BASED MESSAGE SIZE DIFFERENCES
  // ============================================================================
  
  console.log("\n" + "=".repeat(70));
  console.log("1. Encoding-Based Message Size Differences");
  console.log("=".repeat(70) + "\n");

  console.log("Same message text, different byte sizes based on encoding:\n");

  const message = "Hello World! 🌍";
  
  // ASCII encoding (1 byte per character, emoji will be replaced/stripped)
  console.log("ASCII/GSM 7-bit encoding:");
  console.log(`  Message: "${message}"`);
  console.log(`  Characters: ${message.length}`);
  console.log(`  Bytes (ASCII): ${Buffer.from(message, "ascii").length}`);
  console.log(`  Note: Emoji may not display correctly in ASCII\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: "Hello World!",
      dataCoding: DataCoding.SMSC_DEFAULT,
    });
    console.log("  ✓ ASCII message sent\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // UCS-2 encoding (2 bytes per character)
  console.log("UCS-2 (Unicode) encoding:");
  console.log(`  Message: "${message}"`);
  console.log(`  Characters: ${message.length}`);
  console.log(`  Bytes (UCS-2): ${Buffer.from(message, "ucs2").length}`);
  console.log(`  Note: 2 bytes per character, emoji supported\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: message,
      dataCoding: DataCoding.UCS2,
    });
    console.log("  ✓ Unicode message sent\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // ============================================================================
  // 2. SHORT_MESSAGE FIELD LIMIT (254 bytes)
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("2. short_message Field Limit (254 bytes)");
  console.log("=".repeat(70) + "\n");

  console.log("SMPP v5 Spec: short_message supports 0-254 bytes (255 is reserved)\n");

  // Example 2a: Message that fits in short_message (< 254 bytes)
  const shortMessage = "A".repeat(200); // 200 bytes in ASCII
  console.log(`Example 2a: Message fits in short_message field`);
  console.log(`  Length: ${shortMessage.length} characters`);
  console.log(`  Bytes: ${Buffer.from(shortMessage, "ascii").length}`);
  console.log(`  Will use: short_message field\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: shortMessage,
      dataCoding: DataCoding.SMSC_DEFAULT,
    });
    console.log("  ✓ Message sent using short_message field\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // Example 2b: Message that exceeds short_message limit (> 254 bytes)
  const longMessage = "B".repeat(300); // 300 bytes in ASCII
  console.log(`Example 2b: Message exceeds short_message limit`);
  console.log(`  Length: ${longMessage.length} characters`);
  console.log(`  Bytes: ${Buffer.from(longMessage, "ascii").length}`);
  console.log(`  Will use: message_payload TLV (automatically)\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: longMessage,
      dataCoding: DataCoding.SMSC_DEFAULT,
    });
    console.log("  ✓ Message sent using message_payload TLV\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // ============================================================================
  // 3. CHARACTER COUNT VS BYTE COUNT
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("3. Character Count vs Byte Count");
  console.log("=".repeat(70) + "\n");

  console.log("Important: SMPP protocol limits are in BYTES, not characters!\n");

  // Example 3a: ASCII - 1 byte per character
  const asciiMessage = "A".repeat(100);
  console.log("ASCII encoding (1 byte per character):");
  console.log(`  Characters: ${asciiMessage.length}`);
  console.log(`  Bytes: ${Buffer.from(asciiMessage, "ascii").length}`);
  console.log(`  Ratio: 1:1\n`);

  // Example 3b: UCS-2 - 2 bytes per character
  const unicodeMessage = "A".repeat(100);
  console.log("UCS-2 encoding (2 bytes per character):");
  console.log(`  Characters: ${unicodeMessage.length}`);
  console.log(`  Bytes: ${Buffer.from(unicodeMessage, "ucs2").length}`);
  console.log(`  Ratio: 1:2\n`);

  // Example 3c: UTF-8 with emoji (variable bytes per character)
  const emojiMessage = "Hello 🌍🎉✨";
  console.log("UTF-8 with emoji (variable bytes per character):");
  console.log(`  Characters: ${emojiMessage.length}`);
  console.log(`  Bytes (UTF-8): ${Buffer.from(emojiMessage, "utf8").length}`);
  console.log(`  Note: Emoji use 4 bytes each in UTF-8\n`);

  // ============================================================================
  // 4. UNICODE MESSAGE THAT TRIGGERS MESSAGE_PAYLOAD
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("4. Unicode Message Triggering message_payload TLV");
  console.log("=".repeat(70) + "\n");

  // UCS-2 encoding: 2 bytes per character
  // So 128 characters = 256 bytes > 254 byte limit
  const unicodeLongMessage = "Unicode: " + "🌍".repeat(120);
  console.log("Long Unicode message:");
  console.log(`  Characters: ${unicodeLongMessage.length}`);
  console.log(`  Bytes (UCS-2): ${Buffer.from(unicodeLongMessage, "ucs2").length}`);
  console.log(`  Exceeds 254 bytes: Yes`);
  console.log(`  Will use: message_payload TLV\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: unicodeLongMessage,
      dataCoding: DataCoding.UCS2,
    });
    console.log("  ✓ Long Unicode message sent using message_payload TLV\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // ============================================================================
  // 5. TYPICAL SMS LENGTH WARNINGS
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("5. Typical SMS Length Warnings");
  console.log("=".repeat(70) + "\n");

  console.log("The library warns about typical SMS limits for user convenience:\n");
  console.log("Typical Single SMS Limits:");
  console.log("  - GSM 7-bit: 160 characters");
  console.log("  - ASCII: 160 characters");
  console.log("  - UCS-2: 70 characters");
  console.log("  - 8-bit binary: 140 bytes\n");
  console.log("Note: Messages exceeding these limits may be split into multiple SMS\n");

  // Example 5a: Message exceeds typical SMS limit but < 254 bytes
  const warningMessage = "C".repeat(180); // 180 chars > 160 (typical limit), but < 254 bytes
  console.log("Message exceeds typical SMS limit:");
  console.log(`  Characters: ${warningMessage.length}`);
  console.log(`  Bytes: ${Buffer.from(warningMessage, "ascii").length}`);
  console.log(`  Typical SMS limit: 160 characters`);
  console.log(`  SMPP limit: 254 bytes`);
  console.log(`  Result: Warning logged, but sent successfully\n`);

  try {
    await manager.sendSMS({
      to: "+1234567890",
      message: warningMessage,
      dataCoding: DataCoding.SMSC_DEFAULT,
    });
    console.log("  ✓ Message sent (check logs for warning)\n");
  } catch (error) {
    console.error("  ✗ Failed:", (error as Error).message + "\n");
  }

  // ============================================================================
  // 6. ENCODING COMPARISON TABLE
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("6. Encoding Comparison");
  console.log("=".repeat(70) + "\n");

  const testMessage = "Hello World! 🌍";
  
  console.log("Message Byte Sizes by Encoding:");
  console.log("┌─────────────────┬────────────┬──────────┬─────────────────┐");
  console.log("│ Encoding        │ Code       │ Bytes    │ Trigger TLV?    │");
  console.log("├─────────────────┼────────────┼──────────┼─────────────────┤");
  console.log(`│ ASCII           │ 0x00       │ ${Buffer.from(testMessage, "ascii").length.toString().padEnd(8)} │ No              │`);
  console.log(`│ Latin-1         │ 0x03       │ ${Buffer.from(testMessage, "latin1").length.toString().padEnd(8)} │ No              │`);
  console.log(`│ UCS-2           │ 0x08       │ ${Buffer.from(testMessage, "ucs2").length.toString().padEnd(8)} │ No              │`);
  console.log(`│ UTF-8           │ N/A        │ ${Buffer.from(testMessage, "utf8").length.toString().padEnd(8)} │ No              │`);
  console.log("└─────────────────┴────────────┴──────────┴─────────────────┘\n");

  console.log("Long Message (300 characters):");
  const longTest = "A".repeat(300);
  console.log("┌─────────────────┬────────────┬──────────┬─────────────────┐");
  console.log("│ Encoding        │ Code       │ Bytes    │ Trigger TLV?    │");
  console.log("├─────────────────┼────────────┼──────────┼─────────────────┤");
  console.log(`│ ASCII           │ 0x00       │ ${Buffer.from(longTest, "ascii").length.toString().padEnd(8)} │ Yes (>254)      │`);
  console.log(`│ UCS-2           │ 0x08       │ ${Buffer.from(longTest, "ucs2").length.toString().padEnd(8)} │ Yes (>254)      │`);
  console.log("└─────────────────┴────────────┴──────────┴─────────────────┘\n");

  // ============================================================================
  // SUMMARY
  // ============================================================================
  
  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70) + "\n");

  console.log("Key Points:");
  console.log("✅ Messages are encoded based on data_coding parameter");
  console.log("✅ SMPP protocol limit: short_message field = 0-254 bytes");
  console.log("✅ Messages > 254 bytes automatically use message_payload TLV");
  console.log("✅ Validation checks actual byte length (not character count)");
  console.log("✅ Warnings shown for typical SMS length limits (160 chars, 70 UCS-2)");
  console.log("✅ Different encodings produce different byte sizes\n");

  console.log("Encoding Recommendations:");
  console.log("- ASCII/GSM 7-bit: Best for English text (1 byte/char)");
  console.log("- UCS-2: Required for emoji and international characters (2 bytes/char)");
  console.log("- Latin-1: Good for Western European languages (1 byte/char)");
  console.log("- Binary: For non-text data\n");

  console.log("SMPP v5 Spec References:");
  console.log("- Section 4.7.28: sm_length (short_message length)");
  console.log("- Section 4.7.7: data_coding");
  console.log("- Section 4.8.4.24: message_payload TLV (Tag 0x0424)\n");

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

