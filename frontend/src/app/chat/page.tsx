import type { Metadata } from "next";
import { ChatInterface } from "@/components/chat/chat-interface";

export const metadata: Metadata = {
  title: "Chat | MindMatch",
  description: "Chat with your personalized MindMatch AI companion.",
};

export default function ChatPage() {
  // The AppShell gives /chat exactly h-dvh minus the navbar with overflow-hidden.
  // This page must fill that remaining space with h-full so ChatInterface
  // gets the correct dimensions.
  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  );
}
