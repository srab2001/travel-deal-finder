// PM2 ecosystem file. Run with: `pm2 start ecosystem.config.js`
// See docs/DEPLOYMENT.md for full setup instructions.

module.exports = {
  apps: [
    {
      name: 'travel-deal-finder',
      script: './index.js',
      args: '--daemon',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
