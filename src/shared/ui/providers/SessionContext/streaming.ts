'use client';

/**
 * SessionContext — streaming machinery.
 *
 * Extracted from the original monolithic SessionContext.tsx (Phase 0.5
 * client-component split). Two responsibilities:
 *
 *   1. `playAudioBase64` — pure helper for the legacy webhook voice path.
 *   2. `consumeAionChatStream` — SSE reader for /api/aion/chat. Takes the
 *      DOM `Response` plus a callback bag and drives the per-chunk state
 *      mutations through the supplied setters. The Provider keeps owning
 *      React state; this function just walks the SSE protocol.
 *
 * Keeping the SSE state-machine here means the line-prefix protocol
 * (`text:`, `preamble:`, `tool:`, `structured:`, etc.) lives in one place
 * and the Provider doesn't have a 150-line while-loop in its body.
 */

import type { AionMessageContent } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { Message } from './types';

export function playAudioBase64(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch((err) => {
      console.error('Audio playback failed:', err);
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    console.error('Audio decode failed:', err);
  }
}

export type ChatStreamCallbacks = {
  /** Called on each `text:` chunk with the full accumulated body. */
  updateMessageContent: (msgId: string, content: string) => void;
  /** Called on each `preamble:` chunk with the full accumulated preamble. */
  updateMessagePreamble: (msgId: string, preamble: string) => void;
  /** Called on `structured:`, `error:`, or end-of-stream fallback. */
  finalizeMessage: (
    msgId: string,
    content: string,
    structured?: AionMessageContent[],
    isError?: boolean,
  ) => void;
  /** `tool:` label, `thinking:` reasoning indicator, or `null` to clear. */
  setActiveToolLabel: (label: string | null) => void;
  /** `model:` tier annotation on the streaming message. */
  setMessageModelTier: (msgId: string, tier: Message['modelTier']) => void;
};

/**
 * Consume an SSE response from /api/aion/chat. The protocol is line-prefixed
 * — see `src/app/api/aion/chat/route.ts` for the producer side.
 *
 * Returns when the stream closes. Errors during reading are caller's
 * responsibility (wrap in try/catch upstream so the AbortController + timeout
 * can finalize the message correctly).
 */
export async function consumeAionChatStream(
  body: ReadableStream<Uint8Array>,
  msgId: string,
  cb: ChatStreamCallbacks,
): Promise<{ accumulated: string; preambleAccum: string; preambleFrozen: boolean; structuredFinalized: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let preambleAccum = '';
  let preambleFrozen = false;
  let buffer = '';
  let structuredFinalized = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

    for (const line of lines) {
      if (line.startsWith('text:')) {
        accumulated += line.slice(5);
        cb.setActiveToolLabel(null);
        cb.updateMessageContent(msgId, accumulated);
      } else if (line.startsWith('preamble:')) {
        // Pre-tool commentary ("I'll search for that wedding deal").
        // Renders as a muted "thinking" header above the answer so
        // it doesn't mash into the main content.
        preambleAccum += line.slice('preamble:'.length);
        cb.updateMessagePreamble(msgId, preambleAccum);
      } else if (line === 'preamble-end:') {
        // First tool-call fired — preamble is frozen. Any further
        // text goes to main content, not preamble.
        preambleFrozen = true;
      } else if (line.startsWith('thinking:')) {
        // Extended thinking deltas — show as thinking indicator
        cb.setActiveToolLabel('reasoning');
      } else if (line.startsWith('model:')) {
        // Store model tier on the streaming message
        const tier = line.slice(6) as Message['modelTier'];
        cb.setMessageModelTier(msgId, tier);
      } else if (line.startsWith('tool:')) {
        cb.setActiveToolLabel(line.slice(5));
      } else if (line.startsWith('structured:')) {
        try {
          const payload = JSON.parse(line.slice(11));
          const blocks: AionMessageContent[] = payload.blocks ?? [];
          // If no tool ever fired, "preamble" is actually the whole
          // answer — promote it to main content so the user sees a
          // response instead of an empty answer with preamble-only.
          if (!preambleFrozen && !accumulated && preambleAccum) {
            accumulated = preambleAccum;
            cb.updateMessagePreamble(msgId, '');
          }
          cb.finalizeMessage(msgId, accumulated || 'I processed that.', blocks.length > 0 ? blocks : undefined);
          structuredFinalized = true;
        } catch {
          if (!preambleFrozen && !accumulated && preambleAccum) {
            accumulated = preambleAccum;
            cb.updateMessagePreamble(msgId, '');
          }
          cb.finalizeMessage(msgId, accumulated || 'I processed that.');
          structuredFinalized = true;
        }
      } else if (line.startsWith('error:')) {
        cb.finalizeMessage(msgId, line.slice(6) || 'Request failed. Try again.', undefined, true);
        structuredFinalized = true;
      }
    }
  }

  return { accumulated, preambleAccum, preambleFrozen, structuredFinalized };
}
