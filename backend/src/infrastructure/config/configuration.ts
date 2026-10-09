// ============================================================
// 配置管理：把 env 变量做类型化，带默认值
// ============================================================
export default () => ({
  app: {
    port: parseInt(process.env.APP_PORT || '3000', 10),
    env: process.env.APP_ENV || 'development',
    url: process.env.APP_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
    adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-secret-change-me-please-xxxxxxxxxxxxxxx',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.MAIL_FROM || 'no-reply@local.dev',
    fromName: process.env.MAIL_FROM_NAME || 'The Intimate Edit',
  },
  devSmtp: {
    host: process.env.DEV_SMTP_HOST || '127.0.0.1',
    port: parseInt(process.env.DEV_SMTP_PORT || '1025', 10),
    user: process.env.DEV_SMTP_USER || '',
    pass: process.env.DEV_SMTP_PASS || '',
  },
  proxyline: {
    apiBaseUrl: process.env.PROXYLINE_API_BASE_URL || 'https://panel.proxyline.net/api',
    apiKey: process.env.PROXYLINE_API_KEY || '',
    alertThresholdUsd: parseFloat(process.env.PROXYLINE_BALANCE_ALERT_THRESHOLD_USD || '20'),
  },
});
