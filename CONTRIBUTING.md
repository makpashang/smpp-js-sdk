# Contributing to smpp-js-sdk

Thank you for your interest in contributing to smpp-js-sdk! This document provides guidelines and instructions for contributing.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs actual behavior
- **Environment details**: Node.js version, OS, library version
- **Code samples** demonstrating the issue
- **Error messages** and stack traces if applicable

### Suggesting Features

Feature requests are welcome! Please provide:

- **Clear description** of the feature
- **Use case** explaining why it's needed
- **Example code** showing how it might be used
- **Reference to SMPP specification** if protocol-related

### Pull Requests

1. **Fork** the repository
2. **Create a branch** for your feature/fix: `git checkout -b feature/my-feature`
3. **Make your changes** following the coding standards below
4. **Test your changes** thoroughly
5. **Commit** with clear, descriptive messages
6. **Push** to your fork
7. **Open a Pull Request** with a clear description

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/smpp-js-sdk.git
cd smpp-js-sdk

# Install dependencies
npm install

# Build the project
npm run build

# Run type checking
npm run typecheck

# Watch mode for development
npm run watch
```

## Coding Standards

### TypeScript Guidelines

- Use **strict TypeScript** settings (already configured)
- Define **explicit types** for function parameters and return values
- Use **readonly** for immutable properties
- Prefer **interfaces** for object shapes
- Use **enums** for fixed sets of values
- Use **private class fields** (`#field`) for encapsulation

### Code Style

```typescript
// Use descriptive names
async function sendMessageToRecipient(params: SubmitSMParams): Promise<string> {
  // Implementation
}

// Use readonly for immutable data
interface Config {
  readonly host: string;
  readonly port: number;
}

// Use private fields for encapsulation
class Example {
  #privateField: string;
  
  constructor() {
    this.#privateField = 'value';
  }
}

// Handle errors properly
try {
  await client.submitSM(params);
} catch (error) {
  if (error instanceof Error) {
    logger.error('Failed to send:', error.message);
  }
  throw error;
}
```

### Documentation

- Add **JSDoc comments** for public APIs
- Include **@param** and **@returns** descriptions
- Reference **SMPP specification sections** where applicable
- Include **code examples** in comments

```typescript
/**
 * Submit a short message to the SMSC
 * SMPP v5 Spec Section 4.4
 * 
 * @param params - Message parameters
 * @returns Promise resolving to the message ID
 * @throws Error if not in bound state or submission fails
 * 
 * @example
 * const messageId = await client.submitSM({
 *   source_addr: 'MyApp',
 *   destination_addr: '+1234567890',
 *   short_message: 'Hello!',
 * });
 */
async submitSM(params: SubmitSMParams): Promise<string> {
  // Implementation
}
```

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(client): add support for data_sm PDU

fix(pdu): correct TLV length calculation for message_payload

docs(readme): add TLS configuration example
```

## Testing

Currently, testing is done manually with the example files. When adding new features:

1. Add or update example files demonstrating the feature
2. Test against a local SMPP simulator or test server
3. Verify both success and error paths

Example testing:
```bash
# Run basic example
npm run test

# Run production example
npm run example:production

# Run optional operations example
npm run example:optional
```

## Project Structure

```
src/
├── index.ts           # Public exports (entry point)
└── lib/
    ├── client.ts      # Core SMPPClient class
    ├── sms-manager.ts # High-level SMSManager
    ├── pdu.ts         # PDU encoding/decoding
    ├── queue.ts       # Message queue implementation
    └── types.ts       # TypeScript types and enums
```

### Adding New Features

1. **Types** go in `types.ts`
2. **PDU encoding/decoding** goes in `pdu.ts`
3. **Client methods** go in `client.ts`
4. **High-level methods** go in `sms-manager.ts`
5. **Export** new public APIs from `index.ts`

## SMPP Protocol Reference

When implementing protocol features, reference the official specification:

- [SMPP v5.0 Specification](https://smpp.org/)
- Section 3: PDU Format
- Section 4: Operations
- Section 5: Error Handling

## Questions?

If you have questions, feel free to:

1. Open a GitHub issue with the "question" label
2. Check existing issues and discussions

Thank you for contributing!
