# Production Deployment Guide

This guide explains how to deploy the Multi-Vendor Platform to your production server.

## 🚀 Quick Deployment

### 1. Prepare Your Server

SSH into your production server:
```bash
ssh root@72.62.254.192
```

### 2. Deploy the Application

Clone/pull the repository and run the deployment script:

```bash
# Navigate to your project directory
cd /path/to/Multi-Vendor-Platform

# Make sure DATABASE_URL is set
export DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Run the deployment script
./deploy-production.sh
```

## 📋 What the Deployment Script Does

The `deploy-production.sh` script automatically:

1. ✅ **Checks DATABASE_URL** is configured
2. ✅ **Creates database backup** (before making changes)
3. ✅ **Runs database migrations** (applies any new schema changes)
4. ✅ **Shows migration status** (verifies all migrations are applied)
5. ✅ **Builds the application** (if build script exists)
6. ✅ **Restarts the application** (using PM2 or systemd)

## 🔧 Manual Deployment Steps

If you prefer to deploy manually or troubleshoot:

### Database Migrations

```bash
# Check migration status
node packages/database/src/migrate.mjs --status

# Run pending migrations
node packages/database/src/migrate.mjs
```

### Application Restart

```bash
# If using PM2
pm2 restart multivendor-platform

# If using systemd
systemctl restart multivendor-platform

# Or restart your Node.js process manually
```

## 🐘 Troubleshooting

### Database Migration Issues

If migrations fail:

1. **Check DATABASE_URL is correct**
   ```bash
   echo $DATABASE_URL
   ```

2. **Test database connection**
   ```bash
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

3. **Check migration status**
   ```bash
   node packages/database/src/migrate.mjs --status
   ```

### Application Issues

If the app won't start:

1. **Check logs**
   ```bash
   pm2 logs multivendor-platform
   # or
   journalctl -u multivendor-platform -f
   ```

2. **Verify environment variables**
   ```bash
   pm2 env multivendor-platform
   ```

3. **Check port availability**
   ```bash
   netstat -tulpn | grep :3000
   ```

## 🔒 Security Best Practices

1. **Never commit `.env.production`** to version control
2. **Use strong passwords** for database and JWT secrets
3. **Keep backups** of your database before major deployments
4. **Use SSH keys** instead of password authentication
5. **Limit database user permissions** to only what's needed

## 📊 Deployment Checklist

Before deploying to production:

- [ ] DATABASE_URL is set correctly
- [ ] All database migrations are applied locally
- [ ] Environment variables are configured
- [ ] Backup strategy is in place
- [ ] SSL/HTTPS is configured
- [ ] Firewall rules allow application traffic
- [ ] Monitoring/logging is set up

After deployment:

- [ ] Database migrations ran successfully
- [ ] Application starts without errors
- [ ] Inventory page loads products correctly
- [ ] All API endpoints respond properly
- [ ] Application logs show no critical errors