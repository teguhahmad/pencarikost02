import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Send, Loader2, ArrowLeft, X, Building2, MapPin, ChevronRight, Users, Scale as Male, Scale as Female, Users2 } from 'lucide-react';
import FloatingNav from '../../components/ui/FloatingNav';
import { formatCurrency } from '../../utils/formatters';

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
  property_id?: string;
  property_name?: string;
  room_type_id?: string;
  room_type_name?: string;
  room_price?: number;
}

interface ChatUser {
  id: string;
  property_name: string;
  property_photo?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count?: number;
}

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  photos?: string[];
  marketplace_price?: number;
}

interface RoomType {
  id: string;
  name: string;
  price: number;
  max_occupancy: number;
  renter_gender: string;
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
  const [property, setProperty] = useState<Property | null>(null);
  const [roomType, setRoomType] = useState<RoomType | null>(null);

  // Get data from location state
  const receiverId = location.state?.receiverId;
  const propertyId = location.state?.propertyId;
  const propertyName = location.state?.propertyName;
  const roomTypeId = location.state?.roomTypeId;

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
        if (messages.length === 0 && propertyId) {
          loadPropertyDetails(propertyId, roomTypeId);
        }
      });
    }
  }, [receiverId, propertyName]);

  const loadPropertyDetails = async (propertyId: string, roomTypeId?: string) => {
    try {
      const [propertyData, roomTypeData] = await Promise.all([
        supabase
          .from('properties')
          .select('*')
          .eq('id', propertyId)
          .single(),
        roomTypeId ? supabase
          .from('room_types')
          .select('*')
          .eq('id', roomTypeId)
          .single() : null
      ]);

      if (propertyData.error) throw propertyData.error;
      setProperty(propertyData.data);

      if (roomTypeData && !roomTypeData.error) {
        setRoomType(roomTypeData.data);
      }

      const msg = `Saya ingin bertanya tentang ${roomTypeData?.data ? `kamar tipe ${roomTypeData.data.name} di ` : ''}properti "${propertyData.data.name}". `;
      setNewMessage(msg);
    } catch (err) {
      console.error('Error loading property:', err);
    }
  };

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
        .select('id, name, owner_id, photos')
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
        const propertyPhoto = userProperty?.photos?.[0];

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

      // Load property details if available
      const propertyMessage = data?.find(msg => msg.property_id);
      if (propertyMessage?.property_id) {
        loadPropertyDetails(propertyMessage.property_id, propertyMessage.room_type_id);
      }

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

      const { error: deleteError } = await supabase
        .from('chat_messages')
        .delete()
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);

      if (deleteError) throw deleteError;

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
          property_id: property?.id,
          property_name: property?.name,
          room_type_id: roomType?.id,
          room_type_name: roomType?.name,
          room_price: roomType?.price
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

  const handlePropertyClick = () => {
    if (property) {
      navigate(`/marketplace/property/${property.id}`);
    }
  };

  const getGenderIcon = (gender: string) => {
    switch (gender) {
      case 'male':
        return <Male size={16} className="text-blue-500" />;
      case 'female':
        return <Female size={16} className="text-pink-500" />;
      default:
        return <Users2 size={16} className="text-purple-500" />;
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
              {property && (
                <div className="mb-6">
                  <button
                    onClick={handlePropertyClick}
                    className="w-full bg-white rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {property.photos?.[0] ? (
                          <img
                            src={property.photos[0]}
                            alt={property.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{property.name}</h3>
                        <div className="flex items-center text-gray-500 text-sm mt-1">
                          <MapPin size={14} className="mr-1" />
                          <span>{property.address}, {property.city}</span>
                        </div>
                        {roomType && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                                {roomType.name}
                              </span>
                              <div className="flex items-center text-gray-600">
                                <Users size={14} className="mr-1" />
                                <span>Maks. {roomType.max_occupancy} orang</span>
                              </div>
                              <div className="flex items-center text-gray-600">
                                {getGenderIcon(roomType.renter_gender)}
                                <span className="ml-1">
                                  {roomType.renter_gender === 'male' ? 'Putra' :
                                   roomType.renter_gender === 'female' ? 'Putri' : 'Campur'}
                                </span>
                              </div>
                            </div>
                            <p className="text-blue-600 font-semibold">
                              {formatCurrency(roomType.price)}
                              <span className="text-gray-500 font-normal">/bulan</span>
                            </p>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </button>
                </div>
              )}

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