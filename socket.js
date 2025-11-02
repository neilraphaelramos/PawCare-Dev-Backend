const { Server } = require('socket.io');

function initSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log('[Socket] New client connected:', socket.id);

    socket.on('joinConsult', ({ consultID, userType, name }) => {
      socket.join(consultID);
      console.log(`[Socket] ${userType} (${name}) joined room ${consultID}`);
      socket.to(consultID).emit('systemMessage', `${userType} (${name}) joined the consultation`);
    });

    socket.on('sendMessage', ({ consultID, from, name, text, photo }) => {
      const message = { consultID, from, name, text, photo, timestamp: new Date() };
      console.log(`[Socket] Message from ${name} (${from}) in room ${consultID}:`, text);
      socket.to(consultID).emit('receiveMessage', message);
    });

    socket.on("registerUser", (userId) => {
      socket.join(`user_${userId}`);
      console.log(`[Socket] User ${userId} registered in room user_${userId}`);
    });

    socket.on("sendNotification", (notification) => {
      console.log(`[Socket] Sending notification to user_${notification.UID}`);
      io.to(`user_${notification.UID}`).emit("newNotification", {
        id: notification.id || Date.now(),
        title_notify: notification.title,
        type_notify: notification.type,
        details: notification.details,
        notify_date: new Date(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected (${socket.id}), reason:`, reason);
    });
  });

  return io;
}

module.exports = initSocket;
