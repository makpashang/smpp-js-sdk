/**
 * SMPP SMS Queue Manager
 * Handles queuing, retries, rate limiting, and batch processing
 */

import { EventEmitter } from "node:events";
import type { SubmitSMParams, Logger } from "./types.js";

/** No-op logger used when the caller does not inject one. */
const NOOP_LOGGER: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface SMSMessage {
  readonly id?: string;
  readonly to: string;
  readonly from: string;
  readonly message: string;
  readonly priority?: number;
  readonly metadata?: Record<string, unknown>;
  readonly params?: Partial<SubmitSMParams>;
}

export interface QueuedSMS extends SMSMessage {
  readonly id: string;
  readonly queuedAt: Date;
  attempts: number;
  lastAttempt?: Date;
  error?: string;
  status: "queued" | "sending" | "sent" | "failed";
}

export interface SMSQueueConfig {
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly maxRetryDelay?: number;
  readonly retryBackoff?: number;
  readonly maxConcurrent?: number;
  readonly rateLimit?: number;
  readonly batchSize?: number;
  readonly priorityLevels?: number;
}

export interface QueueStats {
  readonly queued: number;
  readonly sending: number;
  readonly sent: number;
  readonly failed: number;
  readonly total: number;
}

/**
 * Queued Message for MessageQueue
 */
export interface QueuedMessage {
  readonly id: string;
  readonly params: SubmitSMParams;
  readonly priority: number;
  readonly enqueuedAt: Date;
  retryCount: number;
  lastError?: string;
  resolve?: (messageId: string) => void;
  reject?: (error: Error) => void;
}

/**
 * MessageQueue Configuration
 */
export interface MessageQueueConfig {
  readonly maxSize?: number;
  readonly maxRetries?: number;
  readonly retryDelay?: number;
  readonly logger?: Logger;
}

/**
 * Rate Limiter using Token Bucket Algorithm
 */
export class RateLimiter {
  readonly #tokensPerSecond: number;
  readonly #maxBurst: number;
  #tokens: number;
  #lastRefill: number;

  constructor(tokensPerSecond: number, maxBurst?: number) {
    this.#tokensPerSecond = tokensPerSecond;
    this.#maxBurst = maxBurst ?? tokensPerSecond * 2;
    this.#tokens = this.#maxBurst;
    this.#lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   */
  tryConsume(tokens: number = 1): boolean {
    this.#refill();

    if (this.#tokens >= tokens) {
      this.#tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Wait for a token to become available
   */
  async waitForToken(tokens: number = 1): Promise<void> {
    while (!this.tryConsume(tokens)) {
      const waitTime = ((tokens - this.#tokens) / this.#tokensPerSecond) * 1000;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(waitTime, 10))
      );
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  #refill(): void {
    const now = Date.now();
    const elapsed = (now - this.#lastRefill) / 1000;
    const tokensToAdd = elapsed * this.#tokensPerSecond;

    if (tokensToAdd > 0) {
      this.#tokens = Math.min(this.#maxBurst, this.#tokens + tokensToAdd);
      this.#lastRefill = now;
    }
  }

  /**
   * Get available tokens
   */
  get availableTokens(): number {
    this.#refill();
    return Math.floor(this.#tokens);
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.#tokens = this.#maxBurst;
    this.#lastRefill = Date.now();
  }
}

/**
 * Message Queue with Priority and Retry Support
 */
export class MessageQueue extends EventEmitter {
  readonly #config: Required<Omit<MessageQueueConfig, "logger">>;
  readonly #logger: Logger;
  readonly #queue: QueuedMessage[] = [];
  readonly #processing = new Map<string, QueuedMessage>();
  #messageIdCounter = 0;
  #sentCount = 0;
  #failedCount = 0;

  constructor(config: MessageQueueConfig = {}) {
    super();

    this.#config = {
      maxSize: config.maxSize ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
    this.#logger = config.logger ?? NOOP_LOGGER;
  }

  /**
   * Enqueue a message
   */
  /**
   * Enqueue a message. Resolves with the SMSC message_id once the message is
   * successfully submitted (via markSuccess), or rejects if it permanently fails.
   */
  enqueue(params: SubmitSMParams, priority: number = 1): Promise<string> {
    // Count both waiting and in-flight messages against the cap.
    if (this.#queue.length + this.#processing.size >= this.#config.maxSize) {
      this.#logger.warn("MessageQueue full - rejecting enqueue", {
        maxSize: this.#config.maxSize,
        queued: this.#queue.length,
        processing: this.#processing.size,
      });
      return Promise.reject(new Error("Queue is full"));
    }

    const id = this.#generateId();
    const message: QueuedMessage = {
      id,
      params,
      priority,
      enqueuedAt: new Date(),
      retryCount: 0,
    };

    return new Promise<string>((resolve, reject) => {
      message.resolve = resolve;
      message.reject = reject;

      // Insert based on priority (higher priority first)
      const insertIndex = this.#queue.findIndex((m) => m.priority < priority);
      if (insertIndex === -1) {
        this.#queue.push(message);
      } else {
        this.#queue.splice(insertIndex, 0, message);
      }

      this.emit("enqueued", { id, priority, queueSize: this.#queue.length });
    });
  }

  /**
   * Dequeue next message
   */
  dequeue(): QueuedMessage | null {
    if (this.#queue.length === 0) {
      return null;
    }

    const message = this.#queue.shift()!;
    this.#processing.set(message.id, message);

    this.emit("dequeued", { id: message.id, queueSize: this.#queue.length });

    return message;
  }

  /**
   * Mark message as successfully sent
   */
  markSuccess(message: QueuedMessage, messageId: string): void {
    this.#processing.delete(message.id);
    this.#sentCount++;
    this.#logger.debug("MessageQueue: message succeeded", {
      id: message.id,
      messageId,
      attempts: message.retryCount + 1,
    });
    message.resolve?.(messageId);
    this.emit("success", { id: message.id, messageId });
  }

  /**
   * Mark a message as permanently failed: remove it from processing and REJECT
   * the caller's promise (never resolve it). Use this for non-retryable errors
   * instead of markSuccess(message, '') which would resolve with a fake id.
   */
  markFailed(message: QueuedMessage, error: Error): void {
    this.#processing.delete(message.id);
    this.#failedCount++;
    this.#logger.warn("MessageQueue: message failed permanently", {
      id: message.id,
      error: error.message,
      attempts: message.retryCount + 1,
    });
    message.reject?.(error);
    this.emit("failed", { id: message.id, error: error.message });
  }

  /**
   * Requeue message for retry
   */
  requeue(message: QueuedMessage, error: string): void {
    this.#processing.delete(message.id);
    message.retryCount++;
    message.lastError = error;

    if (message.retryCount >= this.#config.maxRetries) {
      this.#failedCount++;
      this.#logger.warn("MessageQueue: message exhausted retries", {
        id: message.id,
        error,
        attempts: message.retryCount,
        maxRetries: this.#config.maxRetries,
      });
      message.reject?.(
        new Error(`Failed after ${this.#config.maxRetries} attempts: ${error}`)
      );
      this.emit("failed", {
        id: message.id,
        error,
        retryCount: message.retryCount,
      });
      return;
    }

    this.#logger.debug("MessageQueue: scheduling retry", {
      id: message.id,
      error,
      attempt: message.retryCount,
      maxRetries: this.#config.maxRetries,
    });

    // Re-add to queue with delay
    setTimeout(
      () => {
        const insertIndex = this.#queue.findIndex(
          (m) => m.priority < message.priority
        );
        if (insertIndex === -1) {
          this.#queue.push(message);
        } else {
          this.#queue.splice(insertIndex, 0, message);
        }

        this.emit("requeued", {
          id: message.id,
          retryCount: message.retryCount,
        });
      },
      this.#config.retryDelay * Math.pow(2, message.retryCount - 1)
    );
  }

  /**
   * Clear the queue
   */
  clear(): void {
    const count = this.#queue.length;

    // Reject all pending messages
    for (const message of this.#queue) {
      message.reject?.(new Error("Queue cleared"));
    }

    this.#queue.length = 0;
    this.emit("cleared", { count });
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      queued: this.#queue.length,
      sending: this.#processing.size,
      sent: this.#sentCount,
      failed: this.#failedCount,
      total:
        this.#queue.length +
        this.#processing.size +
        this.#sentCount +
        this.#failedCount,
    };
  }

  /**
   * Check if queue is empty
   */
  get isEmpty(): boolean {
    return this.#queue.length === 0;
  }

  /**
   * Get queue size
   */
  get size(): number {
    return this.#queue.length;
  }

  /**
   * Generate unique message ID
   */
  #generateId(): string {
    return `msg_${Date.now()}_${++this.#messageIdCounter}`;
  }
}

/**
 * SMS Queue Manager with priority, retry, and rate limiting
 */
export class SMSQueue extends EventEmitter {
  readonly #config: Required<SMSQueueConfig>;
  readonly #queue: QueuedSMS[] = [];
  readonly #processing = new Set<string>();
  readonly #sent = new Map<string, QueuedSMS>();
  readonly #failed = new Map<string, QueuedSMS>();

  #paused = false;
  #processing_active = false;
  #sendCount = 0;
  #resetTimer: NodeJS.Timeout | null = null;

  constructor(config: SMSQueueConfig = {}) {
    super();

    this.#config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      maxRetryDelay: config.maxRetryDelay ?? 30000,
      retryBackoff: config.retryBackoff ?? 2,
      maxConcurrent: config.maxConcurrent ?? 10,
      rateLimit: config.rateLimit ?? 100,
      batchSize: config.batchSize ?? 50,
      priorityLevels: config.priorityLevels ?? 3,
    };

    this.#resetTimer = setInterval(() => {
      this.#sendCount = 0;
    }, 1000);
    // Don't let this housekeeping timer keep the Node process alive on its own;
    // callers should still call destroy() for a clean shutdown.
    this.#resetTimer.unref?.();
  }

  add(message: SMSMessage): string {
    const queued: QueuedSMS = {
      ...message,
      id: message.id ?? this.#generateId(),
      queuedAt: new Date(),
      attempts: 0,
      status: "queued",
      priority: message.priority ?? 5,
    };

    const insertIndex = this.#queue.findIndex(
      (item) => (item.priority ?? 5) < (queued.priority ?? 5)
    );

    if (insertIndex === -1) {
      this.#queue.push(queued);
    } else {
      this.#queue.splice(insertIndex, 0, queued);
    }

    this.emit("added", queued);

    if (!this.#processing_active && !this.#paused) {
      this.#startProcessing();
    }

    return queued.id;
  }

  addBatch(messages: SMSMessage[]): string[] {
    return messages.map((msg) => this.add(msg));
  }

  remove(id: string): boolean {
    const index = this.#queue.findIndex((item) => item.id === id);

    if (index !== -1) {
      const removed = this.#queue.splice(index, 1)[0];
      if (removed) {
        this.emit("removed", removed);
      }
      return true;
    }

    return false;
  }

  clear(): void {
    const count = this.#queue.length;
    this.#queue.length = 0;
    this.emit("cleared", count);
  }

  pause(): void {
    this.#paused = true;
    this.emit("paused");
  }

  resume(): void {
    this.#paused = false;
    this.emit("resumed");

    if (!this.#processing_active) {
      this.#startProcessing();
    }
  }

  getStats(): QueueStats {
    return {
      queued: this.#queue.filter((m) => m.status === "queued").length,
      sending: this.#processing.size,
      sent: this.#sent.size,
      failed: this.#failed.size,
      total:
        this.#queue.length +
        this.#processing.size +
        this.#sent.size +
        this.#failed.size,
    };
  }

  getQueued(): readonly QueuedSMS[] {
    return [...this.#queue];
  }

  getSent(): readonly QueuedSMS[] {
    return [...this.#sent.values()];
  }

  getFailed(): readonly QueuedSMS[] {
    return [...this.#failed.values()];
  }

  getMessage(id: string): QueuedSMS | null {
    const queued = this.#queue.find((m) => m.id === id);
    if (queued) return queued;

    const sent = this.#sent.get(id);
    if (sent) return sent;

    const failed = this.#failed.get(id);
    if (failed) return failed;

    return null;
  }

  markSent(id: string, messageId?: string): void {
    this.#processing.delete(id);

    const msg = this.getMessage(id);
    if (!msg) return;

    msg.status = "sent";
    msg.lastAttempt = new Date();
    this.#sent.set(id, msg);
    this.emit("sent", { ...msg, smppMessageId: messageId });
  }

  markFailed(id: string, error: string): void {
    this.#processing.delete(id);

    const msg = this.getMessage(id);
    if (!msg) return;

    // Note: attempts was already incremented in getNext() when the message was
    // dispatched, so we do NOT increment again here (that would halve the budget).
    msg.lastAttempt = new Date();
    msg.error = error;

    if (msg.attempts >= this.#config.maxRetries) {
      msg.status = "failed";
      this.#failed.set(id, msg);
      this.emit("failed", msg);
    } else {
      msg.status = "queued";
      const delay = Math.min(
        this.#config.retryDelay *
          Math.pow(this.#config.retryBackoff, msg.attempts - 1),
        this.#config.maxRetryDelay
      );

      setTimeout(() => {
        this.#queue.push(msg);
        this.emit("retry", msg);

        if (!this.#processing_active && !this.#paused) {
          this.#startProcessing();
        }
      }, delay);
    }
  }

  getNext(): QueuedSMS | null {
    if (this.#sendCount >= this.#config.rateLimit) {
      return null;
    }

    if (this.#processing.size >= this.#config.maxConcurrent) {
      return null;
    }

    const index = this.#queue.findIndex((m) => m.status === "queued");

    if (index === -1) {
      return null;
    }

    const msg = this.#queue.splice(index, 1)[0];
    if (!msg) {
      return null;
    }

    msg.status = "sending";
    msg.attempts++;
    msg.lastAttempt = new Date();

    this.#processing.add(msg.id);
    this.#sendCount++;

    return msg;
  }

  isEmpty(): boolean {
    return this.#queue.length === 0 && this.#processing.size === 0;
  }

  isPaused(): boolean {
    return this.#paused;
  }

  #startProcessing(): void {
    this.#processing_active = true;
    this.emit("processing_started");
  }

  stopProcessing(): void {
    this.#processing_active = false;
    this.emit("processing_stopped");
  }

  #generateId(): string {
    return `sms_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  destroy(): void {
    if (this.#resetTimer) {
      clearInterval(this.#resetTimer);
      this.#resetTimer = null;
    }
    this.#processing_active = false;
    this.removeAllListeners();
  }
}
