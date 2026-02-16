module.exports = {
  apps: [
    {
      name: 'autodetail-app',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: '/var/www/autodetailapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      // Logging
      error_file: '/var/log/autodetailapp/error.log',
      out_file: '/var/log/autodetailapp/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Restart policy
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
