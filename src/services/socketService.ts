import { io, Socket } from 'socket.io-client';
import { getAuthToken } from './api';

export const connectSocket = (): Socket => io({
  auth: { token: getAuthToken() },
  transports: ['websocket', 'polling'],
});
