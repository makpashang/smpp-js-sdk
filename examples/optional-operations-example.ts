/**
 * SMPP v5 Optional Operations Example
 * Demonstrates all optional SMPP v5 operations:
 * - QUERY_SM, CANCEL_SM, REPLACE_SM, SUBMIT_MULTI, DATA_SM
 * - BROADCAST_SM, QUERY_BROADCAST_SM, CANCEL_BROADCAST_SM
 * - ALERT_NOTIFICATION, OUTBIND
 */

import { SMPPClient, TON, NPI, DataCoding, TLVTag } from "../src/index.js";

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║  SMPP v5 Optional Operations Example          ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  const client = new SMPPClient({
    host: "192.168.1.2",
    port: 2777,
    system_id: "",
    password: "",
    system_type: "ESME",
    interface_version: 0x34,
    use_tls: false,
    debug: true,
  });

  // Event handlers
  client.on("connect", () => {
    console.log("✅ Connected to SMPP server\n");
  });

  client.on("alert_notification", (alert) => {
    console.log("🔔 Received ALERT_NOTIFICATION:");
    console.log("   Source:", alert.source_addr);
    console.log("   ESME:", alert.esme_addr);
  });

  client.on("outbind", (outbind) => {
    console.log("🔗 Received OUTBIND from MC:");
    console.log("   System ID:", outbind.system_id);
    console.log("   MC is requesting us to initiate bind_receiver");
  });

  try {
    // Connect
    await client.connect("transceiver");
    console.log("Connected!\n");

    // ===== SUBMIT_MULTI Example =====
    console.log("1️⃣ SUBMIT_MULTI - Send to multiple recipients\n");

    const multiResult = await client.submitMulti({
      source_addr: "MyApp",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      dest_addresses: [
        {
          dest_flag: 1, // SME address
          dest_addr_ton: TON.INTERNATIONAL,
          dest_addr_npi: NPI.ISDN,
          destination_addr: "+1234567890",
        },
        {
          dest_flag: 1,
          dest_addr_ton: TON.INTERNATIONAL,
          dest_addr_npi: NPI.ISDN,
          destination_addr: "+9876543210",
        },
      ],
      short_message: "Bulk message test",
      registered_delivery: 1,
    });

    console.log("   ✅ Message ID:", multiResult.message_id);
    if (multiResult.unsuccessful_smes) {
      console.log(
        "   ⚠️  Failed deliveries:",
        multiResult.unsuccessful_smes.length,
      );
    }
    console.log();

    // ===== QUERY_SM Example =====
    console.log("2️⃣ QUERY_SM - Query message status\n");

    const queryResult = await client.querySM({
      message_id: multiResult.message_id,
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      source_addr: "MyApp",
    });

    console.log("   Message state:", queryResult.message_state);
    console.log("   Final date:", queryResult.final_date);
    console.log("   Error code:", queryResult.error_code);
    console.log();

    // ===== REPLACE_SM Example =====
    console.log("3️⃣ REPLACE_SM - Replace queued message\n");

    await client.replaceSM({
      message_id: multiResult.message_id,
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      source_addr: "MyApp",
      registered_delivery: 1,
      sm_default_msg_id: 0,
      short_message: "Updated message content",
    });

    console.log("   ✅ Message replaced");
    console.log();

    // ===== DATA_SM Example =====
    console.log("4️⃣ DATA_SM - Send using TLVs only\n");

    const dataSMResult = await client.dataSM({
      source_addr: "MyApp",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      destination_addr: "+1234567890",
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      data_coding: DataCoding.SMSC_DEFAULT,
      tlvs: [
        {
          tag: 0x0424, // message_payload
          value: Buffer.from("Message via DATA_SM", "utf8"),
        },
      ],
    });

    console.log("   ✅ Message ID:", dataSMResult);
    console.log();

    // ===== CANCEL_SM Example =====
    console.log("5️⃣ CANCEL_SM - Cancel queued message\n");

    await client.cancelSM({
      message_id: multiResult.message_id,
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      source_addr: "MyApp",
      dest_addr_ton: TON.INTERNATIONAL,
      dest_addr_npi: NPI.ISDN,
      destination_addr: "+1234567890",
    });

    console.log("   ✅ Message cancelled");
    console.log();

    // ===== BROADCAST_SM Example =====
    console.log("6️⃣ BROADCAST_SM - Cell broadcast message\n");

    const broadcastResult = await client.broadcastSM({
      source_addr: "EmergencyAlert",
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      message_id: "BCAST-001",
      data_coding: DataCoding.SMSC_DEFAULT,
      // Required broadcast TLVs
      broadcast_area_identifier: Buffer.from([0x00, 0x01]), // Area ID
      broadcast_content_type: Buffer.from([0x00, 0x01]), // Content type
      broadcast_rep_num: 3, // Repeat 3 times
      broadcast_frequency_interval: Buffer.from([0x00, 0x0a, 0x00, 0x0a, 0x00]),
      message_payload: Buffer.from(
        "Emergency Alert: Test broadcast message",
        "utf8",
      ),
    });

    console.log("   ✅ Broadcast Message ID:", broadcastResult.message_id);
    console.log();

    // ===== QUERY_BROADCAST_SM Example =====
    console.log("7️⃣ QUERY_BROADCAST_SM - Query broadcast status\n");

    const queryBroadcastResult = await client.queryBroadcastSM({
      message_id: broadcastResult.message_id,
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      source_addr: "EmergencyAlert",
    });

    console.log("   Message state:", queryBroadcastResult.message_state);
    console.log();

    // ===== CANCEL_BROADCAST_SM Example =====
    console.log("8️⃣ CANCEL_BROADCAST_SM - Cancel broadcast\n");

    await client.cancelBroadcastSM({
      message_id: broadcastResult.message_id,
      source_addr_ton: TON.ALPHANUMERIC,
      source_addr_npi: NPI.UNKNOWN,
      source_addr: "EmergencyAlert",
    });

    console.log("   ✅ Broadcast cancelled");
    console.log();

    console.log("✅ All optional operations completed successfully!\n");
    console.log(
      "Note: OUTBIND is MC-initiated, so it can only be received, not sent.\n",
    );
  } catch (error) {
    console.error("❌ Error:", (error as Error).message);
    console.error(
      "\nNote: Optional operations may not be supported by all carriers.",
    );
    console.error(
      "Error is expected if carrier doesn't support these operations.\n",
    );
  } finally {
    await client.disconnect();
  }
}

// Run
main().catch(console.error);
