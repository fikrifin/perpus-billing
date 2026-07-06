const sockets = new Set();

export function registerRealtime(app) {
  app.get('/ws', { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'connected', at: new Date().toISOString() }));
    socket.on('close', () => sockets.delete(socket));
  });
}

export function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, payload, at: new Date().toISOString() });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(message);
  }
}
