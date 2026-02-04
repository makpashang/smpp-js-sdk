# smpp-js-sdk

A modern, fully-featured SMPP (Short Message Peer-to-Peer) client library for Node.js. Built with TypeScript and designed for mission-critical SMS messaging applications.

[![npm version](https://badge.fury.io/js/smpp-js-sdk.svg)](https://www.npmjs.com/package/smpp-js-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/smpp-js-sdk.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## 🎯 Protocol Compliance

**Fully compliant with SMPP v3.4, v3.5, v4.0, and v5.0 specifications**

This library implements the complete SMPP protocol stack from version 3.4 through 5.0, ensuring compatibility with any SMPP Message Center (SMSC) regardless of version. All mandatory and optional PDUs are supported, including advanced features introduced in SMPP v5.0.

## Features

- **Full SMPP v3.4 - v5.0 Support** - Backward compatible with all SMPP versions
- **Modern TypeScript** - Written in TypeScript with full type definitions
- **Auto-Reconnect** - Configurable exponential backoff reconnection strategy
- **Keep-Alive** - Automatic enquire_link heartbeat mechanism
- **TLS/SSL Support** - Secure connections with full certificate configuration
- **Queue Management** - Built-in message queue with rate limiting
- **High-Level API** - Simple `SMSManager` for common use cases
- **Low-Level API** - Direct `SMPPClient` access for advanced control
- **All Bind Modes** - Transmitter, Receiver, and Transceiver support
- **Delivery Receipts** - Full support for delivery receipt parsing (TLV and text formats)
- **Optional Operations** - Support for query_sm, cancel_sm, replace_sm, submit_multi, data_sm
- **Broadcast SMS** - Cell broadcast operations (broadcast_sm, query_broadcast_sm, cancel_broadcast_sm)
- **Zero Dependencies** - Uses only Node.js built-in modules

## Installation

```bash
npm install smpp-js-sdk
```

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.0+ (for TypeScript users)
- An SMPP server/SMSC account (for testing and production use)

## 🚀 Quick Start

### Installation

```bash
npm install smpp-js-sdk
```

### Using the High-Level SMSManager (Recommended)

```typescript
import { SMSManager } from 'smpp-js-sdk';

const manager = new SMSManager({
  host: 'smpp.example.com',
  port: 2775,
  system_id: 'your_username',
  password: 'your_password',
  
  // Optional configuration
  auto_reconnect: true,
  enquire_link_interval: 30000,
  rateLimitPerSecond: 10,
});

// Event handlers
manager.on('sms_received', (sms) => {
  console.log(`Received SMS from ${sms.from}: ${sms.message}`);
});

manager.on('delivery_receipt', (receipt) => {
  console.log(`Message ${receipt.messageId} status: ${receipt.status}`);
});

// Connect and send messages
await manager.connect();

const messageId = await manager.sendSMS({
  to: '+1234567890',
  message: 'Hello from SMPP!',
  from: 'MyApp',
  requestDeliveryReceipt: true,
});

console.log('Message sent with ID:', messageId);

// Graceful shutdown
await manager.disconnect();
```

### Using the Low-Level SMPPClient

```typescript
import { SMPPClient, TON, NPI, DataCoding } from 'smpp-js-sdk';

const client = new SMPPClient({
  host: 'smpp.example.com',
  port: 2775,
  system_id: 'your_username',
  password: 'your_password',
  auto_reconnect: true,
  debug: true,
});

// Handle incoming messages
client.on('deliver_sm', (pdu) => {
  console.log('Received:', pdu.short_message.toString());
});

// Connect as transceiver
await client.connect('transceiver');

// Send a message
const messageId = await client.submitSM({
  source_addr: 'MyApp',
  source_addr_ton: TON.ALPHANUMERIC,
  source_addr_npi: NPI.UNKNOWN,
  destination_addr: '+1234567890',
  dest_addr_ton: TON.INTERNATIONAL,
  dest_addr_npi: NPI.ISDN,
  short_message: 'Hello World!',
  data_coding: DataCoding.SMSC_DEFAULT,
  registered_delivery: 1,
});

await client.disconnect();
```

## Configuration Options

### SMPPClient / SMSManager Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | string | required | SMPP server hostname |
| `port` | number | required | SMPP server port |
| `system_id` | string | required | Username for authentication |
| `password` | string | required | Password for authentication |
| `system_type` | string | `""` | System type identifier |
| `interface_version` | number | `0x50` | SMPP interface version (0x50 = v5.0) |
| `auto_reconnect` | boolean | `true` | Enable automatic reconnection |
| `reconnect_delay` | number | `1000` | Initial reconnect delay (ms) |
| `max_reconnect_delay` | number | `60000` | Maximum reconnect delay (ms) |
| `reconnect_backoff_factor` | number | `2` | Exponential backoff multiplier |
| `max_reconnect_attempts` | number | `0` | Max reconnect attempts (0 = infinite) |
| `enquire_link_interval` | number | `30000` | Keep-alive interval (ms) |
| `enquire_link_timeout` | number | `10000` | Keep-alive timeout (ms) |
| `response_timeout` | number | `30000` | PDU response timeout (ms) |
| `bind_timeout` | number | `30000` | Bind operation timeout (ms) |
| `use_tls` | boolean | `false` | Enable TLS/SSL |
| `tls_options` | object | `{}` | TLS configuration options |
| `debug` | boolean | `false` | Enable debug logging |

### TLS Configuration

```typescript
const client = new SMPPClient({
  host: 'smpp.example.com',
  port: 2775,
  system_id: 'username',
  password: 'password',
  use_tls: true,
  tls_options: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca.pem'),
    cert: fs.readFileSync('/path/to/client-cert.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),
    minVersion: 'TLSv1.2',
  },
});
```

## API Reference

### SMSManager

The high-level API for common SMS operations.

#### Methods

- `connect()` - Connect and bind to the SMPP server
- `disconnect()` - Gracefully disconnect
- `sendSMS(params)` - Send an SMS message (queued)
- `sendSMSDirect(params)` - Send an SMS bypassing the queue
- `sendBulkSMS(messages)` - Send multiple messages
- `getQueueStats()` - Get queue statistics
- `isConnected()` - Check connection status

#### Events

- `connect` - Connected to server
- `disconnect` - Disconnected from server
- `sms_sent` - Message sent successfully
- `sms_received` - Incoming message received
- `delivery_receipt` - Delivery receipt received
- `sms_failed` - Message failed permanently
- `sms_retry` - Message being retried
- `reconnecting` - Attempting to reconnect
- `reconnected` - Successfully reconnected
- `error` - Error occurred

### SMPPClient

The low-level API for direct SMPP protocol access.

#### Methods

- `connect(bindType)` - Connect and bind (`'transmitter'`, `'receiver'`, `'transceiver'`)
- `disconnect()` - Gracefully unbind and disconnect
- `submitSM(params)` - Send a message
- `querySM(params)` - Query message status
- `cancelSM(params)` - Cancel a pending message
- `replaceSM(params)` - Replace a pending message
- `submitMulti(params)` - Send to multiple recipients
- `dataSM(params)` - Send using data_sm PDU
- `broadcastSM(params)` - Send cell broadcast
- `queryBroadcastSM(params)` - Query broadcast status
- `cancelBroadcastSM(params)` - Cancel broadcast
- `getState()` - Get current session state
- `isConnected()` - Check if bound

#### Events

- `connect` - Socket connected
- `bind` - Successfully bound
- `unbind` - Unbound from server
- `close` - Connection closed
- `error` - Error occurred
- `deliver_sm` - Incoming deliver_sm PDU
- `alert_notification` - Alert notification received
- `outbind` - Outbind request from MC
- `generic_nack` - Generic negative acknowledgement
- `reconnecting` - Reconnection attempt starting
- `reconnected` - Successfully reconnected
- `reconnect_failed` - All reconnection attempts exhausted

## SMPP Protocol Compliance

This library implements the full SMPP v5.0 specification with backward compatibility for v3.4:

### Supported PDUs

| PDU | Command ID | Support |
|-----|-----------|---------|
| bind_transmitter | 0x00000002 | ✅ |
| bind_receiver | 0x00000001 | ✅ |
| bind_transceiver | 0x00000009 | ✅ |
| unbind | 0x00000006 | ✅ |
| submit_sm | 0x00000004 | ✅ |
| deliver_sm | 0x00000005 | ✅ |
| enquire_link | 0x00000015 | ✅ |
| generic_nack | 0x80000000 | ✅ |
| query_sm | 0x00000003 | ✅ |
| cancel_sm | 0x00000008 | ✅ |
| replace_sm | 0x00000007 | ✅ |
| submit_multi | 0x00000021 | ✅ |
| data_sm | 0x00000103 | ✅ |
| alert_notification | 0x00000102 | ✅ |
| outbind | 0x0000000B | ✅ |
| broadcast_sm | 0x00000111 | ✅ |
| query_broadcast_sm | 0x00000112 | ✅ |
| cancel_broadcast_sm | 0x00000113 | ✅ |

### TLV Support

Full support for optional TLV parameters including:
- `message_payload` (0x0424) - Long messages
- `receipted_message_id` (0x001E) - Delivery receipts
- `message_state` (0x0427) - Message state
- `network_error_code` (0x0423) - Network errors
- `sar_*` - Segmentation and reassembly
- All broadcast-specific TLVs

## 📚 Examples

Check the `examples/` directory for complete working examples:

- `basic-usage.ts` - Simple send/receive operations
- `production-example.ts` - Production-ready service with monitoring
- `aws-ssm-tunnel.ts` - Using with AWS SSM tunnels
- `optional-operations-example.ts` - Query, cancel, replace operations
- `smpp-v5-compliance-demo.ts` - SMPP v5 specific features
- `smpp-v5-advanced-features.ts` - Advanced SMPP v5 features
- `message-encoding-demo.ts` - Character encoding examples

### Running Examples

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run production example
npm run example:production

# Run optional operations example
npm run example:optional

# Or run any example directly with tsx
npx tsx examples/basic-usage.ts
```

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/smpp-js-sdk.git
cd smpp-js-sdk

# Install dependencies
npm install

# Build
npm run build

# Run type checking
npm run typecheck

# Watch mode for development
npm run watch

# Clean build artifacts
npm run clean

# Full rebuild
npm run rebuild
```

### Testing

```bash
# Run test (localhost transceiver example)
npm test

# Run specific examples
npm run example
npm run example:production
npm run example:optional
```

## Project Structure

```
smpp-js-sdk/
├── src/
│   ├── index.ts          # Public exports
│   └── lib/
│       ├── client.ts     # SMPPClient implementation
│       ├── sms-manager.ts # SMSManager high-level API
│       ├── pdu.ts        # PDU encoding/decoding
│       ├── queue.ts      # Message queue & rate limiter
│       └── types.ts      # TypeScript types & enums
├── examples/             # Usage examples
├── dist/                 # Compiled output (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [SMPP v5.0 Specification](https://smpp.org/) - Protocol specification
- Built with Node.js native modules only - zero external dependencies
