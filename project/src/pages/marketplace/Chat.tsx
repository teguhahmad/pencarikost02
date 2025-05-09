import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Send, Loader2, ArrowLeft, ChevronRight } from 'lucide-react';
import FloatingNav from '../../components/ui/FloatingNav';

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

interface ChatUser {
  id: string;
  name: string;
  email: string;
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
  property_name?: string;
}

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get receiverId and other details from location state
  const receiverId = location.state?.receiverId;
  const receiverName = location.state?.receiverName;
  const propertyId = location.state?.propertyId;
  const propertyName = location.state?.propertyName;

  useEffect(() => {
    loadChats();
    if (receiverId && receiverName) {
      setSelectedUser({
        id: receiverId,
        name: receiverName,
        email: '',
        property_name: propertyName
      });
      loadMessages(receiverId);
    }
  }, [receiverId, receiverName]);

  const loadChats = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/marketplace/auth');
        return;
      }

      const { data: chatMessages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      // Get unique user IDs from messages
      const userIds = new Set([
        ...chatMessages.map(msg => msg.sender_id),
        ...chatMessages.map(msg => msg.receiver_id)
      ].filter(id => id !== user.id));

      if (userIds.size === 0) {
        setChats([]);
        setIsLoading(false);
        return;
      }

      // Get user profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', Array.from(userIds));

      if (profilesError) throw profilesError;

      // Get properties for these users
      const { data: properties, error: propertiesError } = await supabase
        .from('properties')
        .select('id, name, owner_id')
        .in('owner_id', Array.from(userIds));

      if (propertiesError) throw propertiesError;

      if (!profiles || profiles.length === 0) {
        setChats([]);
        setIsLoading(false);
        return;
      }

      // Process chat list
      const chatList = profiles.map(profile => {
        const userMessages = chatMessages.filter(msg => 
          msg.sender_id === profile.id || msg.receiver_id === profile.id
        );
        const lastMessage = userMessages[0];
        const unreadCount = userMessages.filter(msg => 
          msg.receiver_id === user.id && !msg.read
        ).length;

        // Find property for this user
        const userProperty = properties?.find(prop => prop.owner_id === profile.id);

        return {
          id: profile.id,
          name: profile.full_name || profile.email || '',
          email: profile.email || '',
          last_message: lastMessage?.content,
          last_message_time: lastMessage?.created_at,
          unread_count: unreadCount,
          property_name: userProperty?.name
        };
      });

      setChats(chatList);
    } catch (err) {
      console.error('Error loading chats:', err);
      setError('Failed to load chats');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (userId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Mark messages as read
      await supabase
        .from('chat_messages')
        .update({ read: true })
        .eq('sender_id', userId)
        .eq('receiver_id', user.id)
        .eq('read', false);
    } catch (err) {
      console.error('Error loading messages:', err);
      setError('Failed to load messages');
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let messageContent = newMessage.trim();
      
      // If this is the first message and we have property details, include them
      if (propertyId && propertyName && messages.length === 0) {
        messageContent = `Hi, I'm interested in your property "${propertyName}". ${messageContent}`;
      }

      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          sender_id: user.id,
          receiver_id: selectedUser.id,
          content: messageContent,
          read: false
        }]);

      if (error) throw error;

      setNewMessage('');
      await loadMessages(selectedUser.id);
      await loadChats();
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 7) {
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    } else if (days > 0) {
      return date.toLocaleDateString('id-ID', { weekday: 'short' });
    } else {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {selectedUser ? (
        // Chat Detail View
        <div className="h-screen flex flex-col bg-white">
          {/* Header */}
          <div className="bg-[#F2F2F7] safe-top">
            <div className="px-4 h-16 flex items-center justify-between">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex items-center text-blue-600"
              >
                <ArrowLeft size={20} className="mr-1" />
                Back
              </button>
              <div className="text-center flex-1">
                <h2 className="font-semibold text-lg">{selectedUser.name}</h2>
                {selectedUser.property_name && (
                  <p className="text-sm text-gray-500">{selectedUser.property_name}</p>
                )}
              </div>
              <div className="w-10" /> {/* Spacer for centering */}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#F2F2F7]">
            {messages.map((message, index) => {
              const isSender = message.sender_id !== selectedUser.id;
              const showTimestamp = index === 0 || 
                new Date(message.created_at).getTime() - new Date(messages[index - 1].created_at).getTime() > 300000;

              return (
                <div key={message.id} className="mb-4">
                  {showTimestamp && (
                    <div className="text-center mb-2">
                      <span className="text-xs text-gray-500 bg-white/80 px-2 py-1 rounded-full">
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isSender
                          ? 'bg-blue-500 text-white rounded-tr-sm'
                          : 'bg-white text-gray-900 rounded-tl-sm'
                      }`}
                    >
                      <p className="text-[15px] leading-tight">{message.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Message Input */}
          <div className="bg-[#F2F2F7] border-t border-gray-200 p-4 safe-bottom">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Message"
                className="flex-1 bg-white rounded-full px-4 py-2 focus:outline-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim()}
                className="w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded-full disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Chat List View
        <div className="min-h-screen bg-[#F2F2F7]">
          {/* Header */}
          <div className="bg-white safe-top">
            <div className="px-4 py-6">
              <h1 className="text-2xl font-semibold">Chat</h1>
            </div>
          </div>

          {/* Chat List */}
          <div className="mt-4 px-4 pb-24">
            {chats.length > 0 ? (
              <div className="space-y-3">
                {chats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setSelectedUser(chat);
                      loadMessages(chat.id);
                    }}
                    className="w-full bg-white rounded-2xl p-4 flex items-center"
                  >
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold text-lg">
                        {chat.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-4 flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">{chat.name}</h3>
                        {chat.last_message_time && (
                          <span className="text-sm text-gray-500">
                            {formatTime(chat.last_message_time)}
                          </span>
                        )}
                      </div>
                      {chat.property_name && (
                        <p className="text-sm text-gray-500">{chat.property_name}</p>
                      )}
                      {chat.last_message && (
                        <p className="text-sm text-gray-500 line-clamp-1 mt-1">
                          {chat.last_message}
                        </p>
                      )}
                    </div>
                    {chat.unread_count > 0 && (
                      <span className="ml-2 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {chat.unread_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">No messages yet</p>
              </div>
            )}
          </div>

          <FloatingNav />
        </div>
      )}
    </div>
  );
};

export default Chat;
