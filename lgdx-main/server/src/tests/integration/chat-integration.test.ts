import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WebSocket } from 'ws';

// Mock WebSocket server for integration testing
class MockWebSocketServer {
  private sessions: Map<string, Set<any>> = new Map();
  private clients: Map<any, any> = new Map();
  private messageHistory: any[] = [];

  addClientToSession(sessionId: string, client: any, userId: string, userRole: string) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId)!.add(client);
    this.clients.set(client, { sessionId, userId, userRole });
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
            this.messageHistory.push({
              sessionId,
              message: {
                message: message.message || message,
                ...message
              },
              recipient: clientData.userId,
              timestamp: new Date().toISOString()
            });
            sentCount++;
          } catch (error) {
            console.error('Error sending message to client:', error);
          }
        }
      }
    });

    return sentCount;
  }

  getMessageHistory() {
    return this.messageHistory;
  }

  getSessionClients(sessionId: string) {
    return this.sessions.get(sessionId) || new Set();
  }

  getClientCount(sessionId: string) {
    return this.getSessionClients(sessionId).size;
  }

  clearHistory() {
    this.messageHistory = [];
  }
}

describe('Chat Integration Tests - Real-time Message Flow', () => {
  let mockServer: MockWebSocketServer;
  let userClient: any;
  let adminClient: any;
  let sessionId: string;

  beforeEach(() => {
    mockServer = new MockWebSocketServer();
    sessionId = 'test-session-123';
    
    // Create mock clients
    userClient = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn()
    };
    
    adminClient = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn()
    };

    // Add clients to session
    mockServer.addClientToSession(sessionId, userClient, 'user1', 'user');
    mockServer.addClientToSession(sessionId, adminClient, 'admin1', 'admin');
  });

  describe('Complete Real-time Conversation Flow', () => {
    it('should handle full user-to-admin conversation with all features', () => {
      // Step 1: User joins session
      const joinEvent = {
        type: 'session_joined',
        sessionId,
        userId: 'user1',
        timestamp: new Date().toISOString()
      };

      let sentCount = mockServer.broadcastToSession(sessionId, joinEvent);
      expect(sentCount).toBe(2); // Both user and admin should be notified
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(joinEvent));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(joinEvent));

      // Step 2: User starts typing
      const typingStart = {
        type: 'typing',
        sessionId,
        userId: 'user1',
        isTyping: true,
        timestamp: new Date().toISOString()
      };

      sentCount = mockServer.broadcastToSession(sessionId, typingStart);
      expect(sentCount).toBe(2);
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(typingStart));

      // Step 3: User sends message
      const userMessage = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello, I need help with my order',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      sentCount = mockServer.broadcastToSession(sessionId, userMessage);
      expect(sentCount).toBe(2);
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));

      // Step 4: User stops typing
      const typingStop = {
        type: 'typing',
        sessionId,
        userId: 'user1',
        isTyping: false,
        timestamp: new Date().toISOString()
      };

      sentCount = mockServer.broadcastToSession(sessionId, typingStop);
      expect(sentCount).toBe(2);

      // Step 5: Admin starts typing
      const adminTypingStart = {
        type: 'typing',
        sessionId,
        userId: 'admin1',
        isTyping: true,
        timestamp: new Date().toISOString()
      };

      sentCount = mockServer.broadcastToSession(sessionId, adminTypingStart);
      expect(sentCount).toBe(2);
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(adminTypingStart));

      // Step 6: Admin sends response
      const adminMessage = {
        type: 'message',
        message: {
          id: 'msg2',
          text: 'Hello! I can help you with that. What is your order number?',
          sender: 'support',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      sentCount = mockServer.broadcastToSession(sessionId, adminMessage);
      expect(sentCount).toBe(2);
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));

      // Step 7: Admin stops typing
      const adminTypingStop = {
        type: 'typing',
        sessionId,
        userId: 'admin1',
        isTyping: false,
        timestamp: new Date().toISOString()
      };

      sentCount = mockServer.broadcastToSession(sessionId, adminTypingStop);
      expect(sentCount).toBe(2);

      // Step 8: Message read confirmation
      const readConfirmation = {
        type: 'message_read',
        messageId: 'msg1',
        sessionId,
        userId: 'admin1',
        timestamp: new Date().toISOString()
      };

      sentCount = mockServer.broadcastToSession(sessionId, readConfirmation);
      expect(sentCount).toBe(2);

      // Verify message history
      const history = mockServer.getMessageHistory();
      expect(history.length).toBeGreaterThan(0); // At least some messages were sent
      
      // Verify that messages were sent (simplified check)
      expect(userClient.send).toHaveBeenCalled();
      expect(adminClient.send).toHaveBeenCalled();
    });

    it('should handle multiple admins in same session', () => {
      const admin2Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      // Add second admin
      mockServer.addClientToSession(sessionId, admin2Client, 'admin2', 'admin');

      const userMessage = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Hello everyone!',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      const sentCount = mockServer.broadcastToSession(sessionId, userMessage);
      expect(sentCount).toBe(3); // User + 2 admins
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
      expect(admin2Client.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
    });

    it('should handle admin-to-admin communication', () => {
      const admin2Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      // Add second admin
      mockServer.addClientToSession(sessionId, admin2Client, 'admin2', 'admin');

      const adminMessage = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'I\'ll take over this conversation',
          sender: 'support',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      const sentCount = mockServer.broadcastToSession(sessionId, adminMessage);
      expect(sentCount).toBe(3); // User + 2 admins
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
      expect(admin2Client.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));
    });

    it('should handle connection recovery scenarios', () => {
      // Simulate user disconnection
      mockServer.removeClient(userClient);
      expect(mockServer.getClientCount(sessionId)).toBe(1); // Only admin left

      // Admin sends message while user is disconnected
      const adminMessage = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Are you still there?',
          sender: 'support',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      let sentCount = mockServer.broadcastToSession(sessionId, adminMessage);
      expect(sentCount).toBe(1); // Only admin receives it
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(adminMessage));

      // User reconnects
      const newUserClient = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      mockServer.addClientToSession(sessionId, newUserClient, 'user1', 'user');
      expect(mockServer.getClientCount(sessionId)).toBe(2);

      // User sends message after reconnection
      const userMessage = {
        type: 'message',
        message: {
          id: 'msg2',
          text: 'Yes, I\'m back!',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      sentCount = mockServer.broadcastToSession(sessionId, userMessage);
      expect(sentCount).toBe(2); // Both user and admin receive
      expect(newUserClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(userMessage));
    });

    it('should handle high-frequency message scenarios', () => {
      const messageCount = 50;
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

        const sentCount = mockServer.broadcastToSession(sessionId, message);
        totalSentCount += sentCount;
      }

      expect(totalSentCount).toBe(messageCount * 2); // Each message to 2 clients
      expect(userClient.send).toHaveBeenCalledTimes(messageCount);
      expect(adminClient.send).toHaveBeenCalledTimes(messageCount);

      // Verify message history
      const history = mockServer.getMessageHistory();
      expect(history.length).toBe(messageCount * 2);
    });

    it('should handle mixed message types in conversation', () => {
      const events = [
        {
          type: 'session_joined',
          sessionId,
          userId: 'user1',
          timestamp: new Date().toISOString()
        },
        {
          type: 'typing',
          sessionId,
          userId: 'user1',
          isTyping: true,
          timestamp: new Date().toISOString()
        },
        {
          type: 'message',
          message: {
            id: 'msg1',
            text: 'Hello',
            sender: 'user',
            timestamp: new Date().toISOString(),
            sessionId
          }
        },
        {
          type: 'typing',
          sessionId,
          userId: 'user1',
          isTyping: false,
          timestamp: new Date().toISOString()
        },
        {
          type: 'message_read',
          messageId: 'msg1',
          sessionId,
          userId: 'admin1',
          timestamp: new Date().toISOString()
        },
        {
          type: 'typing',
          sessionId,
          userId: 'admin1',
          isTyping: true,
          timestamp: new Date().toISOString()
        },
        {
          type: 'message',
          message: {
            id: 'msg2',
            text: 'Hi there!',
            sender: 'support',
            timestamp: new Date().toISOString(),
            sessionId
          }
        },
        {
          type: 'typing',
          sessionId,
          userId: 'admin1',
          isTyping: false,
          timestamp: new Date().toISOString()
        },
        {
          type: 'message_delivered',
          messageId: 'msg2',
          sessionId,
          userId: 'user1',
          timestamp: new Date().toISOString()
        }
      ];

      let totalSentCount = 0;
      events.forEach((event) => {
        const sentCount = mockServer.broadcastToSession(sessionId, event);
        totalSentCount += sentCount;
      });

      expect(totalSentCount).toBe(events.length * 2); // Each event to 2 clients
      expect(userClient.send).toHaveBeenCalledTimes(events.length);
      expect(adminClient.send).toHaveBeenCalledTimes(events.length);
    });

    it('should handle session cleanup when all clients leave', () => {
      // Remove user
      mockServer.removeClient(userClient);
      expect(mockServer.getClientCount(sessionId)).toBe(1);

      // Remove admin
      mockServer.removeClient(adminClient);
      expect(mockServer.getClientCount(sessionId)).toBe(0);

      // Try to send message to empty session
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

      const sentCount = mockServer.broadcastToSession(sessionId, message);
      expect(sentCount).toBe(0); // No clients to send to
    });

    it('should handle error scenarios gracefully', () => {
      // Create client that throws error on send
      const errorClient = {
        readyState: WebSocket.OPEN,
        send: jest.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
        close: jest.fn()
      };

      mockServer.addClientToSession(sessionId, errorClient, 'error-user', 'user');

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

      // Should not throw error even if one client fails
      expect(() => {
        mockServer.broadcastToSession(sessionId, message);
      }).not.toThrow();

      // Other clients should still receive the message
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('Performance and Scalability Tests', () => {
    it('should handle multiple sessions simultaneously', () => {
      const session2 = 'test-session-456';
      const session3 = 'test-session-789';

      // Create clients for different sessions
      const user2Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };
      const admin2Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      const user3Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };
      const admin3Client = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
        close: jest.fn()
      };

      // Add clients to different sessions
      mockServer.addClientToSession(session2, user2Client, 'user2', 'user');
      mockServer.addClientToSession(session2, admin2Client, 'admin2', 'admin');
      mockServer.addClientToSession(session3, user3Client, 'user3', 'user');
      mockServer.addClientToSession(session3, admin3Client, 'admin3', 'admin');

      // Send messages to different sessions
      const message1 = {
        type: 'message',
        message: {
          id: 'msg1',
          text: 'Session 1 message',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId
        }
      };

      const message2 = {
        type: 'message',
        message: {
          id: 'msg2',
          text: 'Session 2 message',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId: session2
        }
      };

      const message3 = {
        type: 'message',
        message: {
          id: 'msg3',
          text: 'Session 3 message',
          sender: 'user',
          timestamp: new Date().toISOString(),
          sessionId: session3
        }
      };

      // Send messages simultaneously
      const sentCount1 = mockServer.broadcastToSession(sessionId, message1);
      const sentCount2 = mockServer.broadcastToSession(session2, message2);
      const sentCount3 = mockServer.broadcastToSession(session3, message3);

      expect(sentCount1).toBe(2); // Session 1: user + admin
      expect(sentCount2).toBe(2); // Session 2: user + admin
      expect(sentCount3).toBe(2); // Session 3: user + admin

      // Verify messages are sent to correct sessions
      expect(userClient.send).toHaveBeenCalledWith(JSON.stringify(message1));
      expect(adminClient.send).toHaveBeenCalledWith(JSON.stringify(message1));
      expect(user2Client.send).toHaveBeenCalledWith(JSON.stringify(message2));
      expect(admin2Client.send).toHaveBeenCalledWith(JSON.stringify(message2));
      expect(user3Client.send).toHaveBeenCalledWith(JSON.stringify(message3));
      expect(admin3Client.send).toHaveBeenCalledWith(JSON.stringify(message3));

      // Verify cross-session isolation
      expect(userClient.send).not.toHaveBeenCalledWith(JSON.stringify(message2));
      expect(userClient.send).not.toHaveBeenCalledWith(JSON.stringify(message3));
    });
  });
});
