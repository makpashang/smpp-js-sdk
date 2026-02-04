/**
 * AWS SSM Tunnel Example - Transceiver Mode (No SSL)
 *
 * Connects as a transceiver to send and receive SMS through AWS SSM tunnel
 * AWS SSM tunnel provides encryption, so SSL is not needed
 *
 * Run AWS SSM tunnel first:
 * aws ssm start-session --profile prod --target i-024abf7cd91865d04 \
 *   --document-name AWS-StartPortForwardingSessionToRemoteHost \
 *   --parameters '{"host":["192.168.1.2"],"portNumber":["2777"],"localPortNumber":["2777"]}'
 */

import { SMSManager } from "../src/index.js";

/**
 * SMPP Error Code Reference
 */
const SMPP_ERROR_DESCRIPTIONS: Record<string, string> = {
  ESME_RINVPASWD: "Invalid password - Check your password configuration",
  ESME_RINVSYSID: "Invalid system_id - Check your system_id configuration",
  ESME_RALYBND:
    "Already bound - Server thinks you're already connected (wait for timeout or check for duplicate connections)",
  ESME_RBINDFAIL:
    "Generic bind failure - Check credentials and server configuration",
  ESME_RINVBNDSTS: "Incorrect BIND status - Server state issue",
  ESME_RSYSERR: "System error - Server-side system error",
  ESME_RINVSERTYP: "Invalid service type - Check system_type configuration",
  ESME_RINVCMDID: "Invalid command ID - Protocol error",
  ESME_RINVMSGLEN: "Message length invalid - PDU structure error",
  ESME_RTHROTTLED: "Throttled - Rate limit exceeded, slow down",
  ESME_RUNKNOWNERR: "Unknown error - Unspecified server error",
};

/**
 * Connect as TRANSCEIVER without SSL
 * - Transceiver mode allows both sending and receiving SMS in a single connection
 * - No SSL needed as AWS SSM tunnel already provides encryption
 */
async function connectTransceiver() {
  console.log("=== Connecting as TRANSCEIVER (no SSL) ===\n");
  console.log("Note: AWS SSM tunnel already provides encryption\n");

  const sms = new SMSManager({
    // Connection
    host: "",
    port: 2777,
    system_id: "",
    password: "",
    system_type: "ESME",
    interface_version: 0x34, // SMPP v3.4 (52 decimal)

    // No SSL - server config shows peer.peer_ssl: 0
    // AWS SSM tunnel already provides encryption
    use_tls: false,

    // Auto-reconnect configuration
    // Matches server peer.recon_interval: 5
    auto_reconnect: true,
    reconnect_delay: 10000, // 10 seconds - give server time to cleanup old session
    max_reconnect_attempts: 0, // Infinite retries

    // Keep-alive configuration
    // Matches server timeouts.keep_alive_timeout: 30
    enquire_link_interval: 30000, // 30 seconds
    enquire_link_timeout: 10000, // 10 seconds

    // Timeout configuration
    // Matches server timeouts.trans_timeout: 30
    response_timeout: 30000, // 30 seconds
    socket_timeout: 120000, // 2 minutes
    bind_timeout: 60000, // 1 minute

    debug: true,
  });

  setupEventHandlers(sms);

  try {
    console.log("📡 Initiating connection...");
    console.log("   Target: 192.168.1.2:2777 (via AWS SSM tunnel)");
    console.log("   System ID: ");
    console.log("   Bind Mode: TRANSCEIVER (send + receive)");
    console.log("   Protocol: SMPP v3.4 (0x34)");
    console.log("   Encryption: AWS SSM tunnel (TLS disabled)\n");

    console.log("🔌 Connecting to SMPP server...");

    // SMSManager.connect() defaults to transceiver mode
    await sms.connect();

    console.log("\n" + "═".repeat(60));
    console.log("✅ CONNECTION SUCCESSFUL");
    console.log("═".repeat(60));
    console.log("📊 Connection Details:");
    console.log("   Status: BOUND as TRANSCEIVER");
    console.log("   Mode: Bidirectional (send & receive SMS)");
    console.log("   Encryption: AWS SSM tunnel");
    console.log("   Keep-alive: Enquire Link every 30s");
    console.log("   Auto-reconnect: Enabled (10s delay)");
    console.log("═".repeat(60) + "\n");

    console.log("🎧 Listening for incoming SMS...");
    console.log("💬 Ready to send SMS...\n");

    // Keep alive - wait indefinitely
    await new Promise(() => {});
  } catch (error) {
    const err = error as Error;

    console.error("\n" + "━".repeat(60));
    console.error("❌ CONNECTION FAILED");
    console.error("━".repeat(60));
    console.error("\n🔴 Error Message:");
    console.error("   ", err.message);

    // Parse SMPP error code if present
    const errorMatch = err.message.match(/(ESME_\w+)\s*\((0x[0-9A-F]+)\)/i);
    if (errorMatch) {
      const [, errorCode, hexCode] = errorMatch;

      console.error("\n📋 SMPP Error Details:");
      console.error("   Error Code:", errorCode);
      console.error("   Hex Value:", hexCode);
      console.error("   Decimal Value:", parseInt(hexCode, 16));

      if (SMPP_ERROR_DESCRIPTIONS[errorCode]) {
        console.error("\n💡 What This Means:");
        console.error("   ", SMPP_ERROR_DESCRIPTIONS[errorCode]);
      }

      console.error("\n🔧 Specific Troubleshooting for", errorCode + ":");
      switch (errorCode) {
        case "ESME_RINVPASWD":
          console.error("   ┌─────────────────────────────────────────────");
          console.error("   │ INVALID PASSWORD ERROR");
          console.error("   ├─────────────────────────────────────────────");
          console.error("   │ 1. Current password: ''");
          console.error("   │ 2. Verify this matches server configuration");
          console.error("   │ 3. Check for typos or case sensitivity");
          console.error("   │ 4. Ensure no trailing spaces");
          console.error("   │ 5. Contact server admin if password changed");
          console.error("   └─────────────────────────────────────────────");
          break;

        case "ESME_RINVSYSID":
          console.error("   ┌─────────────────────────────────────────────");
          console.error("   │ INVALID SYSTEM_ID ERROR");
          console.error("   ├─────────────────────────────────────────────");
          console.error("   │ 1. Current system_id: ''");
          console.error("   │ 2. Verify this matches server configuration");
          console.error("   │ 3. System_id is usually case-sensitive");
          console.error("   │ 4. Check for typos or extra characters");
          console.error("   │ 5. Contact server admin to confirm system_id");
          console.error("   └─────────────────────────────────────────────");
          break;

        case "ESME_RALYBND":
          console.error("   ┌─────────────────────────────────────────────");
          console.error("   │ ALREADY BOUND ERROR");
          console.error("   ├─────────────────────────────────────────────");
          console.error("   │ Server thinks you're already connected!");
          console.error("   │");
          console.error("   │ Solutions:");
          console.error("   │ 1. Wait 30-60 seconds for server timeout");
          console.error("   │ 2. Check for other running instances:");
          console.error("   │    ps aux | grep aws-ssm-tunnel");
          console.error(
            "   │ 3. Server keeps sessions for recon_interval (5s)",
          );
          console.error("   │ 4. Kill any duplicate processes");
          console.error("   │ 5. Contact server admin to unbind session");
          console.error("   └─────────────────────────────────────────────");
          break;

        case "ESME_RBINDFAIL":
          console.error("   ┌─────────────────────────────────────────────");
          console.error("   │ GENERIC BIND FAILURE");
          console.error("   ├─────────────────────────────────────────────");
          console.error("   │ 1. Check both system_id AND password");
          console.error("   │ 2. Verify server allows TRANSCEIVER mode");
          console.error("   │ 3. Check server is not at max connections");
          console.error("   │ 4. Review server logs for specific reason");
          console.error(
            "   │ 5. Confirm interface_version (0x34) is supported",
          );
          console.error("   └─────────────────────────────────────────────");
          break;

        default:
          console.error(
            "   • Check server logs for detailed error information",
          );
          console.error("   • Verify all configuration parameters");
          console.error("   • Ensure server is running and accessible");
      }
    }

    console.error("\n🌐 General Troubleshooting Steps:");
    console.error("   1. ✓ Ensure AWS SSM tunnel is running:");
    console.error(
      "      aws ssm start-session --profile prod --target i-024abf7cd91865d04 \\",
    );
    console.error(
      "        --document-name AWS-StartPortForwardingSessionToRemoteHost \\",
    );
    console.error(
      '        --parameters \'{"host":["192.168.1.2"],"portNumber":["2777"],"localPortNumber":["2777"]}\'',
    );
    console.error("\n   2. ✓ Verify port forwarding:");
    console.error("      netstat -an | grep 2777");
    console.error("\n   3. ✓ Test connectivity:");
    console.error("      nc -zv localhost 2777");
    console.error("\n   4. ✓ Check credentials:");
    console.error("      system_id: ");
    console.error("      password: ");
    console.error("\n   5. ✓ Verify server configuration:");
    console.error("      • Supports TRANSCEIVER mode");
    console.error("      • Interface version: SMPP v3.4 (0x34)");
    console.error("      • SSL disabled (tunnel provides encryption)");

    console.error("\n" + "━".repeat(60) + "\n");

    process.exit(1);
  }
}

/**
 * Setup common event handlers
 */
function setupEventHandlers(sms: SMSManager) {
  sms.on("connect", () => {
    console.log("✅ TCP connection established to SMPP server");
  });

  sms.on("disconnect", () => {
    console.log("\n⚠️  DISCONNECTED from SMPP server");
    console.log("   Waiting for auto-reconnect...");
  });

  sms.on("reconnecting", ({ attempt, delay }) => {
    console.log(`\n🔄 RECONNECTING...`);
    console.log(`   Attempt: ${attempt}`);
    console.log(`   Delay: ${delay}ms (${(delay / 1000).toFixed(1)}s)`);
    if (attempt > 3) {
      console.log(
        `   ⚠️  Multiple reconnection attempts - check server status`,
      );
    }
  });

  sms.on("reconnected", ({ attemptsTaken }) => {
    console.log(`\n✅ RECONNECTED successfully!`);
    console.log(`   Attempts taken: ${attemptsTaken}`);
    console.log(`   Session restored\n`);
  });

  sms.on("error", (error) => {
    console.error("\n" + "=".repeat(60));
    console.error("❌ SMPP ERROR DETECTED");
    console.error("=".repeat(60));
    console.error("Error Message:", error.message);

    // Parse and display SMPP error code if present
    const errorMatch = error.message.match(/(ESME_\w+)\s*\((0x[0-9A-F]+)\)/i);
    if (errorMatch) {
      const [, errorCode, hexCode] = errorMatch;
      console.error("\n📋 SMPP Error Details:");
      console.error("   Code:", errorCode);
      console.error("   Hex:", hexCode);
      console.error("   Decimal:", parseInt(hexCode, 16));

      if (SMPP_ERROR_DESCRIPTIONS[errorCode]) {
        console.error("\n💡 Description:");
        console.error("   ", SMPP_ERROR_DESCRIPTIONS[errorCode]);
      }

      // Provide specific troubleshooting steps
      console.error("\n🔧 Troubleshooting:");
      switch (errorCode) {
        case "ESME_RINVPASWD":
          console.error("   • Verify password in configuration matches server");
          console.error("   • Check for extra spaces or special characters");
          console.error("   • Current password: ");
          break;
        case "ESME_RINVSYSID":
          console.error(
            "   • Verify system_id in configuration matches server",
          );
          console.error("   • Check for case sensitivity");
          console.error("   • Current system_id: ");
          break;
        case "ESME_RALYBND":
          console.error("   • Wait 30-60 seconds for server session timeout");
          console.error(
            "   • Check for other running instances of this script",
          );
          console.error("   • Verify server recon_interval setting");
          break;
        case "ESME_RBINDFAIL":
          console.error("   • Check all credentials (system_id, password)");
          console.error("   • Verify server allows transceiver mode");
          console.error("   • Check server logs for more details");
          break;
        default:
          console.error(
            "   • Check server logs for detailed error information",
          );
          console.error("   • Verify AWS SSM tunnel is running");
          console.error("   • Ensure network connectivity");
      }
    } else {
      console.error("\n🔧 General Troubleshooting:");
      console.error("   • Verify AWS SSM tunnel is running on port 2777");
      console.error("   • Check network connectivity");
      console.error("   • Review server logs");
    }

    console.error("=".repeat(60) + "\n");
  });

  sms.on("sms_received", (msg) => {
    console.log("\n📩 Received SMS:");
    console.log("   From:", msg.from);
    console.log("   Message:", msg.message);
  });

  sms.on("delivery_receipt", (receipt) => {
    console.log("\n📨 Delivery Receipt:");
    console.log("   Message ID:", receipt.messageId);
    console.log("   Status:", receipt.status);
  });

  sms.on("sms_sent", ({ messageId }) => {
    console.log("✅ Message sent:", messageId);
  });
}

/**
 * Main
 */
async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║  SMPP Transceiver - AWS SSM Tunnel (No SSL)   ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  console.log("Server: 192.168.1.2:2777");
  console.log("Mode: TRANSCEIVER (bidirectional)");
  console.log("Encryption: AWS SSM tunnel\n");

  await connectTransceiver();
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down...");
  process.exit(0);
});

main().catch(console.error);
