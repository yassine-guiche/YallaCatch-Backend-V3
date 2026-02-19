export type WebSocketHandler<T = unknown> = (data: T, event?: string) => void;

export interface WebSocketService {
  connect(token: string): void;
  disconnect(): void;
  send(event: string, data?: unknown): void;
  on<T = unknown>(event: string, callback: WebSocketHandler<T>): () => void;
  off<T = unknown>(event: string, callback: WebSocketHandler<T>): void;
  emit<T = unknown>(event: string, data?: T): void;
  isConnected(): boolean;
  joinRoom(room: string): void;
  leaveRoom(room: string): void;
  subscribeToDashboard(): void;
  unsubscribeFromDashboard(): void;
  subscribeToUser(userId: string): void;
  unsubscribeFromUser(userId: string): void;
  subscribeToPrize(prizeId: string): void;
  unsubscribeFromPrize(prizeId: string): void;
}

declare const wsService: WebSocketService;
export default wsService;
