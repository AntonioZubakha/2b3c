import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WebSocket } from 'ws';

// Mock WebSocket service for testing
class MockChatWebSocketService {
  private sessions: Map<string, Set<any>> = new Map();
  private clients: Map<any, any> = new Map();

  addClientToSession(sessionId: string, client: any) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId)!.add(client);
    this.clients.set(client, { sessionId, userId: 'test-user' });
  }

  removeClient(client: any) {
    const clientData = this.clients.get(client);
    if (clientData) {
      const sessionClients = this.sessions.get(clientData.sessionId);
      if (sessionClients) {
        sessionClients.delete(client);
        if (sessionClients.size === 0) {
          this.sessions.delete(clientData.sessionId);
        }
      }
      this.clients.delete(client);
    }
  }

  broadcastToSession(sessionId: string, message: any, excludeUserId?: string) {
    const sessionClients = this.sessions.get(sessionId);
    if (!sessionClients) {
      return 0;
    }

    let sentCount = 0;
    sessionClients.forEach((client) => {
      const clientData = this.clients.get(client);
      if (clientData && clientData.userId !== excludeUserId) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(message));
            sentCount++;
          } catch (error) {
            // Handle send errors gracefully
            console.error('Error sending message to client:', error);
          }
        }
      }
    });

    return sentCount;
  }

  getSessionClients(sessionId: string) {
    return this.sessions.get(sessionId) || new Set();
  }

  getClientCount(sessionId: string) {
    return this.getSessionClients(sessionId).size;
  }
}

describe('Chat WebSocket Service Tests', () => {
  let mockService: MockChatWebSocketService;
  let mockClient1: any;
  let mockClient2: any;
  let mockClient3: any;

  beforeEach(() => {
    mockService = new MockChatWebSocketService();
    
    // Create mock WebSocket clients
    mockClient1 = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn()
    };
    
    mockClient2 = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn()
    };
    
    mockClient3 = {
      readyState: WebSocket.CLOSED,
      send: jest.fn(),
      close: jest.fn()
    };
  });

  describe('Client Management', () => {
    it('should add client to session', () => {
      const sessionId = 'session123';
      
      mockService.addClientToSession(sessionId, mockClient1);
      
      expect(mockService.getClientCount(sessionId)).toBe(1);
      expect(mockService.getSessionClients(sessionId).has(mockClient1)).toBe(true);
    });

    it('should add multiple clients to same session', () => {
      const sessionId = 'session123';
      
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);
      
      expect(mockService.getClientCount(sessionId)).toBe(2);
      expect(mockService.getSessionClients(sessionId).has(mockClient1)).toBe(true);
      expect(mockService.getSessionClients(sessionId).has(mockClient2)).toBe(true);
    });

    it('should remove client from session', () => {
      const sessionId = 'session123';
      
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);
      
      expect(mockService.getClientCount(sessionId)).toBe(2);
      
      mockService.removeClient(mockClient1);
      
      expect(mockService.getClientCount(sessionId)).toBe(1);
      expect(mockService.getSessionClients(sessionId).has(mockClient1)).toBe(false);
      expect(mockService.getSessionClients(sessionId).has(mockClient2)).toBe(true);
    });

    it('should clean up empty sessions', () => {
      const sessionId = 'session123';
      
      mockService.addClientToSession(sessionId, mockClient1);
      expect(mockService.getClientCount(sessionId)).toBe(1);
      
      mockService.removeClient(mockClient1);
      expect(mockService.getClientCount(sessionId)).toBe(0);
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast message to all clients in session', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello world',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      const sentCount = mockService.broadcastToSession(sessionId, message);

      expect(sentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should exclude specified user from broadcast', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello world',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      // Add clients with different user IDs
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);
      
      // Mock client data to have different user IDs
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'user2' });

      const sentCount = mockService.broadcastToSession(sessionId, message, 'user1');

      expect(sentCount).toBe(1);
      expect(mockClient1.send).not.toHaveBeenCalled();
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should not send to closed connections', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello world',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient3); // Closed client

      const sentCount = mockService.broadcastToSession(sessionId, message);

      expect(sentCount).toBe(1);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient3.send).not.toHaveBeenCalled();
    });

    it('should handle empty sessions gracefully', () => {
      const sessionId = 'nonexistent';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello world',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      const sentCount = mockService.broadcastToSession(sessionId, message);

      expect(sentCount).toBe(0);
    });
  });

  describe('Message Types', () => {
    it('should handle different message types', () => {
      const sessionId = 'session123';
      const messageTypes = [
        {
          type: 'message',
          message: {
            id: 'msg1',
            text: 'Hello',
            sender: 'user',
            timestamp: new Date().toISOString()
          }
        },
        {
          type: 'typing',
          isTyping: true,
          userId: 'user1'
        },
        {
          type: 'session_update',
          session: {
            id: 'session123',
            status: 'active'
          }
        }
      ];

      mockService.addClientToSession(sessionId, mockClient1);

      messageTypes.forEach((message) => {
        const sentCount = mockService.broadcastToSession(sessionId, message);
        expect(sentCount).toBe(1);
        expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle client send errors gracefully', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello world',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      // Mock client that throws error on send
      const errorClient = {
        readyState: WebSocket.OPEN,
        send: jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
        close: jest.fn()
      };

      mockService.addClientToSession(sessionId, errorClient);

      // Should not throw error
      expect(() => {
        mockService.broadcastToSession(sessionId, message);
      }).not.toThrow();
    });

    it('should handle malformed messages', () => {
      const sessionId = 'session123';
      const malformedMessage = {
        type: 'message',
        // Missing required fields
      };

      mockService.addClientToSession(sessionId, mockClient1);

      const sentCount = mockService.broadcastToSession(sessionId, malformedMessage);

      expect(sentCount).toBe(1);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(malformedMessage));
    });
  });

  describe('Session Management', () => {
    it('should handle multiple sessions independently', () => {
      const session1 = 'session1';
      const session2 = 'session2';

      mockService.addClientToSession(session1, mockClient1);
      mockService.addClientToSession(session2, mockClient2);

      expect(mockService.getClientCount(session1)).toBe(1);
      expect(mockService.getClientCount(session2)).toBe(1);

      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello',
          sender: 'user',
          timestamp: new Date().toISOString()
        }
      };

      mockService.broadcastToSession(session1, message);
      expect(mockClient1.send).toHaveBeenCalled();
      expect(mockClient2.send).not.toHaveBeenCalled();

      // Reset mocks
      (mockClient1.send as jest.Mock).mockClear();
      (mockClient2.send as jest.Mock).mockClear();

      mockService.broadcastToSession(session2, message);
      expect(mockClient1.send).not.toHaveBeenCalled();
      expect(mockClient2.send).toHaveBeenCalled();
    });
  });

  describe('Real-time Message Flow Tests', () => {
    it('should handle user to admin real-time message flow', () => {
      const sessionId = 'session123';
      const userMessage = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello admin, I need help!',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      // Add user and admin to session
      mockService.addClientToSession(sessionId, mockClient1); // User
      mockService.addClientToSession(sessionId, mockClient2); // Admin

      // Mock client data with different user IDs
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      const sentCount = mockService.broadcastToSession(sessionId, userMessage);

      expect(sentCount).toBe(2); // Both user and admin should receive
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
    });

    it('should handle admin to user real-time message flow', () => {
      const sessionId = 'session123';
      const adminMessage = {
        type: 'message',
        message: {
          id: 'msg2',
          text: 'Hello! How can I help you?',
          sender: 'support',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      // Add user and admin to session
      mockService.addClientToSession(sessionId, mockClient1); // User
      mockService.addClientToSession(sessionId, mockClient2); // Admin

      // Mock client data with different user IDs
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      const sentCount = mockService.broadcastToSession(sessionId, adminMessage);

      expect(sentCount).toBe(2); // Both user and admin should receive
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
    });

    it('should handle bidirectional conversation flow', () => {
      const sessionId = 'session123';
      const conversation = [
        {
          type: 'message',
          message: {
            id: 'msg1',
            text: 'Hi, I have a question',
            sender: 'user',
            timestamp: new Date().toISOString(),
            sessionId
          }
        },
        {
          type: 'message',
          message: {
            id: 'msg2',
            text: 'Hello! What can I help you with?',
            sender: 'support',
            timestamp: new Date().toISOString(),
            sessionId
          }
        },
        {
          type: 'message',
          message: {
            id: 'msg3',
            text: 'I need help with my order',
            sender: 'user',
            timestamp: new Date().toISOString(),
            sessionId
          }
        },
        {
          type: 'message',
          message: {
            id: 'msg4',
            text: 'Sure, what is your order number?',
            sender: 'support',
            timestamp: new Date().toISOString(),
            sessionId
          }
        }
      ];

      // Add user and admin to session
      mockService.addClientToSession(sessionId, mockClient1); // User
      mockService.addClientToSession(sessionId, mockClient2); // Admin

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      let totalSentCount = 0;
      conversation.forEach((message, index) => {
        const sentCount = mockService.broadcastToSession(sessionId, message);
        totalSentCount += sentCount;
        
        expect(sentCount).toBe(2); // Both clients should receive each message
      });

      expect(totalSentCount).toBe(8); // 4 messages × 2 clients
      expect(mockClient1.send).toHaveBeenCalledTimes(4);
      expect(mockClient2.send).toHaveBeenCalledTimes(4);
    });

    it('should handle typing indicators in real-time', () => {
      const sessionId = 'session123';
      const typingStart = {
        type: 'typing',
        sessionId,
        userId: 'user1',
        isTyping: true
      };

      const typingStop = {
        type: 'typing',
        sessionId,
        userId: 'user1',
        isTyping: false
      };

      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      // Test typing start
      const startSentCount = mockService.broadcastToSession(sessionId, typingStart);
      expect(startSentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(typingStart));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(typingStart));

      // Reset mocks
      (mockClient1.send as jest.Mock).mockClear();
      (mockClient2.send as jest.Mock).mockClear();

      // Test typing stop
      const stopSentCount = mockService.broadcastToSession(sessionId, typingStop);
      expect(stopSentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(typingStop));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(typingStop));
    });

    it('should handle message read status updates', () => {
      const sessionId = 'session123';
      const readUpdate = {
        type: 'message_read',
        messageId: 'msg1',
        sessionId,
        userId: 'admin1',
        timestamp: new Date().toISOString()
      };

      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      const sentCount = mockService.broadcastToSession(sessionId, readUpdate);
      expect(sentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(readUpdate));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(readUpdate));
    });

    it('should handle session join/leave events', () => {
      const sessionId = 'session123';
      const joinEvent = {
        type: 'session_joined',
        sessionId,
        userId: 'user1',
        timestamp: new Date().toISOString()
      };

      const leaveEvent = {
        type: 'session_left',
        sessionId,
        userId: 'user1',
        timestamp: new Date().toISOString()
      };

      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      // Test join event
      const joinSentCount = mockService.broadcastToSession(sessionId, joinEvent);
      expect(joinSentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(joinEvent));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(joinEvent));

      // Reset mocks
      (mockClient1.send as jest.Mock).mockClear();
      (mockClient2.send as jest.Mock).mockClear();

      // Test leave event
      const leaveSentCount = mockService.broadcastToSession(sessionId, leaveEvent);
      expect(leaveSentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(leaveEvent));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(leaveEvent));
    });

    it('should handle message delivery confirmation', () => {
      const sessionId = 'session123';
      const deliveryConfirmation = {
        type: 'message_delivered',
        messageId: 'msg1',
        sessionId,
        userId: 'user1',
        timestamp: new Date().toISOString()
      };

      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      const sentCount = mockService.broadcastToSession(sessionId, deliveryConfirmation);
      expect(sentCount).toBe(2);
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(deliveryConfirmation));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(deliveryConfirmation));
    });

    it('should handle multiple admins in same session', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello everyone!',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      // Add user and multiple admins to session
      mockService.addClientToSession(sessionId, mockClient1); // User
      mockService.addClientToSession(sessionId, mockClient2); // Admin 1
      mockService.addClientToSession(sessionId, mockClient3); // Admin 2

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });
      (mockService as any).clients.set(mockClient3, { sessionId, userId: 'admin2' });

      const sentCount = mockService.broadcastToSession(sessionId, message);
      expect(sentCount).toBe(2); // Only open connections (client1 and client2)
      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient3.send).not.toHaveBeenCalled(); // Closed connection
    });

    it('should handle connection recovery and rejoin', () => {
      const sessionId = 'session123';
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello after reconnection!',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      // Initially add client
      mockService.addClientToSession(sessionId, mockClient1);
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });

      // Simulate disconnection
      mockService.removeClient(mockClient1);
      expect(mockService.getClientCount(sessionId)).toBe(0);

      // Simulate reconnection with new client
      const newClient = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      mockService.addClientToSession(sessionId, newClient);
      (mockService as any).clients.set(newClient, { sessionId, userId: 'user1' });

      expect(mockService.getClientCount(sessionId)).toBe(1);

      // Test message after reconnection
      const sentCount = mockService.broadcastToSession(sessionId, message);
      expect(sentCount).toBe(1);
      expect(newClient.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should handle high-frequency message sending', () => {
      const sessionId = 'session123';
      const messageCount = 100;
      
      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      // Mock client data
      (mockService as any).clients.set(mockClient1, { sessionId, userId: 'user1' });
      (mockService as any).clients.set(mockClient2, { sessionId, userId: 'admin1' });

      let totalSentCount = 0;
      
      // Send many messages rapidly
      for (let i = 0; i < messageCount; i++) {
        const message = {
          type: 'message',
          message: {
            id: `msg${i}`,
            text: `Message ${i}`,
            sender: i % 2 === 0 ? 'user' : 'support',
            timestamp: new Date().toISOString(),
            sessionId
          }
        };

        const sentCount = mockService.broadcastToSession(sessionId, message);
        totalSentCount += sentCount;
      }

      expect(totalSentCount).toBe(messageCount * 2); // Each message to 2 clients
      expect(mockClient1.send).toHaveBeenCalledTimes(messageCount);
      expect(mockClient2.send).toHaveBeenCalledTimes(messageCount);
    });

    it('should handle session cleanup when all clients leave', () => {
      const sessionId = 'session123';
      
      // Add clients to session
      mockService.addClientToSession(sessionId, mockClient1);
      mockService.addClientToSession(sessionId, mockClient2);

      expect(mockService.getClientCount(sessionId)).toBe(2);

      // Remove first client
      mockService.removeClient(mockClient1);
      expect(mockService.getClientCount(sessionId)).toBe(1);

      // Remove second client
      mockService.removeClient(mockClient2);
      expect(mockService.getClientCount(sessionId)).toBe(0);

      // Session should be cleaned up
      const message = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      const sentCount = mockService.broadcastToSession(sessionId, message);
      expect(sentCount).toBe(0); // No clients to send to
    });
  });
});
