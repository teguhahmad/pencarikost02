import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Send, Loader2, ArrowLeft, X } from 'lucide-react';
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
  property_name: string;
  property_photo?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get data from location state
  const receiverId = location.state?.receiverId;
  const propertyId = location.state?.propertyId;
  const propertyName = location.state?.propertyName;

  // Load chats and messages
  useEffect(() => {
    loadChats();
    if (receiverId && propertyName) {
      setSelectedUser({
        id: receiverId,
        property_name: propertyName,
        property_photo: undefined,
      });
      loadMessages(receiverId).then(() => {
        if (messages.length === 0) {
          const msg = `Saya ingin bertanya tentang properti "${propertyName}". `;
          setNewMessage(msg);
        }
      });
    }
  }, [receiverId, propertyName]);

  const loadChats = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/marketplace/auth');
        return;
      }

      const { data: allMessages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      if (!allMessages || allMessages.length === 0) {
        setChats([]);
        setIsLoading(false);
        return;
      }

      const userIds = [...new Set(allMessages.map((msg) =>
        msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
      ))];

      const { data: properties, error: propertiesError } = await supabase
        .from('properties')
        .select('id, name, owner_id, common_amenities_photos')
        .in('owner_id', userIds);

      if (propertiesError) throw propertiesError;

      const chatList = userIds.map((userId) => {
        const userMessages = allMessages.filter(
          (msg) => msg.sender_id === userId || msg.receiver_id === userId
        );
        const lastMessage = userMessages[0];
        const unreadCount = userMessages.filter(
          (msg) => msg.receiver_id === user.id && !msg.read
        ).length;

        const userProperty = properties?.find((prop) => prop.owner_id === userId);
        const propertyPhoto = userProperty?.common_amenities_photos?.[0];

        return {
          id: userId,
          property_name: userProperty?.name || 'Unknown Property',
          property_photo: propertyPhoto,
          last_message: lastMessage?.content,
          last_message_time: lastMessage?.created_at,
          unread_count: unreadCount,
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
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
        )
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

      loadChats();
    } catch (err) {
      console.error('Error loading messages:', err);
      setError('Failed to load messages');
    }
  };

  const handleDeleteChat = async (userId: string) => {
    try {
      setIsDeleting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete messages where the current user is either sender or receiver
      const { error: deleteError } = await supabase
        .from('chat_messages')
        .delete()
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);

      if (deleteError) throw deleteError;

      // Update local state
      setChats(prevChats => prevChats.filter(chat => chat.id !== userId));
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
        setMessages([]);
      }

      setShowDeleteConfirm(false);
      setChatToDelete(null);

    } catch (err) {
      console.error('Error deleting chat:', err);
      setError('Gagal menghapus chat');
    } finally {
      setIsDeleting(false);
      // Reload chats to ensure UI is in sync
      loadChats();
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedUser) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const messageContent = newMessage.trim();

      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          sender_id: user.id,
          receiver_id: selectedUser.id,
          content: messageContent,
          read: false,
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
            <div className="max-w-7xl mx-auto">
              <div className="px-4 h-16 flex items-center justify-between">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex items-center text-blue-600"
                >
                  <ArrowLeft size={20} className="mr-1" />
                  Back
                </button>
                <div className="text-center flex-1">
                  <h2 className="font-semibold text-lg">{selectedUser.property_name}</h2>
                </div>
                <div className="w-10" />
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#F2F2F7]">
            <div className="max-w-7xl mx-auto">
              {messages.map((message, index) => {
                const isSender = message.sender_id !== selectedUser.id;
                const showTimestamp =
                  index === 0 ||
                  new Date(message.created_at).getTime() -
                    new Date(messages[index - 1].created_at).getTime() >
                    300000;
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
          </div>

          {/* Message Input */}
          <div className="bg-[#F2F2F7] border-t border-gray-200 p-4 safe-bottom">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ketik pesan..."
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
        </div>
      ) : (
        // Chat List View
        <div className="min-h-screen bg-[#F2F2F7]">
          <div className="bg-white">
            <div className="max-w-7xl mx-auto px-4">
              <div className="py-6">
                <h1 className="text-2xl font-semibold">Chat</h1>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
            {chats.length > 0 ? (
              <div className="space-y-3">
                {chats.map((chat) => (
                  <div key={chat.id} className="bg-white rounded-2xl p-4 flex items-center">
                    <button
                      onClick={() => {
                        setSelectedUser(chat);
                        loadMessages(chat.id);
                      }}
                      className="flex-1 flex items-center"
                    >
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {chat.property_photo ? (
                          <img
                            src={chat.property_photo}
                            alt={chat.property_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-blue-600 font-semibold text-lg">
                            {chat.property_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="ml-4 flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-gray-900">{chat.property_name}</h3>
                          {chat.last_message_time && (
                            <span className="text-sm text-gray-500">
                              {formatTime(chat.last_message_time)}
                            </span>
                          )}
                        </div>
                        {chat.last_message && (
                          <p className="text-sm text-gray-500 line-clamp-1 mt-1">
                            {chat.last_message}
                          </p>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setChatToDelete(chat.id);
                        setShowDeleteConfirm(true);
                      }}
                      className="ml-4 p-2 text-gray-400 hover:text-red-500"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Belum ada pesan</p>
              </div>
            )}
          </div>
          <FloatingNav />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2">Hapus Chat</h3>
            <p className="text-gray-600 mb-6">
              Apakah Anda yakin ingin menghapus obrolan ini? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setChatToDelete(null);
                }}
                className="flex-1 py-2 text-gray-700 font-medium bg-gray-100 rounded-xl"
                disabled={isDeleting}
              >
                Batalkan
              </button>
              <button
                onClick={() => chatToDelete && handleDeleteChat(chatToDelete)}
                className="flex-1 py-2 text-white font-medium bg-red-600 rounded-xl flex items-center justify-center"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
