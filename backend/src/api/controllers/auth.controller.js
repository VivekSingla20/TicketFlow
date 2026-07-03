const authService = require('../../services/auth.service');

async function register(request, reply) {
  const { email, password } = request.body;
  const user = await authService.register(email, password);
  return reply.status(201).send({ success: true, data: user });
}

async function login(request, reply) {
  const { email, password } = request.body;
  const result = await authService.login(email, password);
  return reply.status(200).send({ success: true, data: result });
}

async function refresh(request, reply) {
  const { refreshToken } = request.body;
  const result = await authService.refresh(refreshToken);
  return reply.status(200).send({ success: true, data: result });
}

async function logout(request, reply) {
  const { refreshToken } = request.body;
  await authService.logout(request.user.id, request.user.jti, refreshToken);
  return reply.status(200).send({ success: true, message: 'Logged out successfully' });
}

module.exports = { register, login, refresh, logout };
