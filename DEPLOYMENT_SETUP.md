# Deployment Setup Guide

## Environment Variables Required

### Firebase Configuration (Choose ONE method)

#### Method 1: Single Environment Variable (Recommended)
Set `FIREBASE_SERVICE_ACCOUNT` to the entire JSON content of your Firebase service account file:
```bash
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
```

#### Method 2: Individual Variables
Set these three environment variables:
```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

**Note:** For `FIREBASE_PRIVATE_KEY`, make sure to include the `\n` characters or use actual newlines.

### Email Configuration (Optional)
```bash
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
```

**Note:** If email credentials are not set, the app will work but won't send welcome emails.

### Database Configuration
```bash
MONGODB_URI=your-mongodb-connection-string
```

### Cloudinary Configuration (Optional)
```bash
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
```

### JWT Secret
```bash
JWT_SECRET=your-secret-key
```

## Setting Environment Variables on Render

1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add each environment variable
5. Save and redeploy

## Setting Environment Variables on Other Platforms

### Heroku
```bash
heroku config:set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

### Railway
Add via Railway dashboard → Variables tab

### Vercel
Add via Vercel dashboard → Settings → Environment Variables

## Security Notes

⚠️ **NEVER commit these files to Git:**
- `college360x-firebase-adminsdk-*.json` (Firebase credentials)
- `.env` files
- Any files containing secrets

✅ **Always use environment variables in production**

## Verification

After deployment, check logs for:
- ✅ `Firebase Admin SDK initialized successfully`
- ✅ `SMTP transporter configured successfully` (if email is configured)
- ⚠️ If you see warnings, the features will be disabled but the app will still work

