import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback
} from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';

function getNotificationUrl(notification) {
  const type = notification?.type || '';
  if (
    type === 'booking_created' ||
    type === 'pandit_assigned' ||
    type === 'pandit_accepted' ||
    type === 'new_booking' ||
    type === 'booking_completed' ||
    type === 'booking_assignment_pending'
  ) return '/my-bookings';

  if (type.startsWith('order_')) return '/my-orders';

  if (
    type === 'kyc_submitted' ||
    type === 'kyc_approved' ||
    type === 'kyc_rejected' ||
    type === 'kyc_reupload' ||
    type === 'pandit_approved' ||
    type === 'pandit_rejected' ||
    type === 'pandit_registered'
  ) return '/pandit/dashboard';

  return '/notifications';
}

const NotificationContext = createContext(null);

export function NotificationProvider({ children, user }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const socketRef = useRef(null);
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await API.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch {}
  }, [user]);

  const fetchNotifications = useCallback(async (page = 1) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/notifications?page=${page}&limit=20`);

      if (page === 1) {
        setNotifications(data.notifications);
      } else {
        setNotifications(prev => [...prev, ...data.notifications]);
      }

      setUnreadCount(data.unread);
      return data;
    } catch {}
    finally {
      setLoading(false);
    }
  }, [user]);

  const markRead = useCallback(async (id) => {
    try {
      await API.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await API.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  }, []);

  const deleteNotification = useCallback(async (id) => {
    const n = notifications.find(x => x._id === id);
    try {
      await API.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(x => x._id !== id));
      if (n && !n.isRead) setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }, [notifications]);

  const clearAll = useCallback(async () => {
    try {
      await API.delete('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  }, []);

  // ✅ ✅ SOCKET CONNECTION FIXED HERE
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const token = localStorage.getItem('zutsav_token');
    if (!token) return;

    // ✅ FIXED: Proper production URL (no localhost fallback)
    const serverUrl =
      process.env.REACT_APP_API_URL
        ? process.env.REACT_APP_API_URL.replace('/api', '')
        : "https://backend.zutsav.com";

    const socket = io(serverUrl, {
      auth: { token },
      transports: ["websocket"], // ✅ force websocket
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to', serverUrl);
      fetchUnreadCount();
    });

    socket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(c => c + 1);

      const targetUrl = getNotificationUrl(notification);

      toast.custom(
        (t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              navigate(targetUrl);
            }}
            style={{
              display: 'flex',
              gap: '12px',
              background: '#fff',
              borderRadius: '16px',
              padding: '14px',
              maxWidth: '380px',
              cursor: 'pointer'
            }}
          >
            <span>🔔</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {notification.title}
              </p>
              <p style={{ margin: 0, fontSize: '12px' }}>
                {notification.message}
              </p>
            </div>
          </div>
        ),
        { duration: 5000, id: notification._id }
      );
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
    });

    socket.on('connect_error', (err) => {
      console.warn('[Socket.IO] Error:', err.message);
    });

    socketRef.current = socket;

    fetchNotifications(1);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };

  }, [user]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      fetchNotifications,
      fetchUnreadCount,
      markRead,
      markAllRead,
      deleteNotification,
      clearAll,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
};
