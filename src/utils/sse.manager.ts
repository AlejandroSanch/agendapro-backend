import { Response } from 'express';

// Store clients by businessId (userId from the token)
const clients: Record<string, Response[]> = {};

export const SseManager = {
  addClient(businessId: string, res: Response) {
    if (!clients[businessId]) {
      clients[businessId] = [];
    }
    clients[businessId].push(res);

    // Keep connection alive with heartbeat comments periodically (optional but good practice)
    const interval = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    // Remove client when connection is closed
    res.on('close', () => {
      clearInterval(interval);
      clients[businessId] = clients[businessId].filter((client) => client !== res);
      if (clients[businessId].length === 0) {
        delete clients[businessId];
      }
    });
  },

  broadcast(businessId: string, event: string, data: any) {
    const businessClients = clients[businessId];
    if (businessClients && businessClients.length > 0) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      businessClients.forEach((client) => {
        client.write(payload);
      });
    }
  }
};
