"use client";

import { ChatIcon } from "@/components/icons";
import { OPEN_PRODUCER_CHAT_EVENT } from "@/lib/chat-events";

/** Opens the same private artist ↔ producer thread as the floating chat button. */
export function MessageProducerButton() {
  return (
    <button
      type="button"
      className="wa-chat-action shrink-0"
      onClick={() => window.dispatchEvent(new Event(OPEN_PRODUCER_CHAT_EVENT))}
    >
      <ChatIcon className="h-5 w-5" />
      Message the producer
    </button>
  );
}
