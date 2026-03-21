import { ChatInterface } from '@/app/(dashboard)/(features)/brain/components/ChatInterface';

export default function ChatPage() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6">
      <ChatInterface viewState="chat" />
    </div>
  );
}
