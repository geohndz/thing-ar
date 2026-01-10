# Thing1 + Thing2: AR Poster Scanner

An interactive AR experience for art shows. Visitors scan QR codes to access Thing2, point their phones at printed posters, and watch them come to life with video overlays.

## Overview

- **Thing1** (`/admin.html`) - Admin dashboard for uploading posters and videos
- **Thing2** (`/index.html`) - AR viewer that visitors use at the show

## Quick Start

### 1. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Firestore Database** (in test mode for development)
4. Enable **Storage** (in test mode for development)
5. Go to Project Settings > General > Your apps > Add web app
6. Copy the config values

### 2. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your Firebase credentials
```

### 3. Set Up Firebase Security Rules

#### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read, write: if true; // For development - tighten for production
      match /targets/{targetId} {
        allow read, write: if true;
      }
    }
  }
}
```

#### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /projects/{projectId}/{allPaths=**} {
      allow read, write: if true; // For development - tighten for production
    }
  }
}
```

### 4. Install & Run

```bash
npm install
npm run dev
```

- **Thing1 (Admin):** http://localhost:5173/admin.html
- **Thing2 (Viewer):** http://localhost:5173/

## Usage

### Setting Up Your AR Show (Thing1)

1. Open `/admin.html`
2. Enter your project name and social links
3. Click **Add Poster** to upload your poster images (PNG/JPG)
4. For each poster, click **Add video** to upload the corresponding MP4
5. Click **Compile Targets** to process the images for AR recognition
6. Click **Save Project**
7. Copy the share URL and generate a QR code from it

### Viewing AR (Thing2)

1. Scan the QR code or open the share URL
2. Allow camera access
3. Point your phone at a printed poster
4. Watch the video overlay appear!

## Deployment to Vercel

1. Push your code to GitHub
2. Connect the repo to [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Deploy!

## Tips for Best AR Tracking

- Use high-contrast images with distinctive features
- Avoid solid colors or repetitive patterns
- Print posters at a reasonable size (at least 8x10 inches)
- Good lighting helps recognition
- Videos should match the aspect ratio of your posters

## Tech Stack

- **Vite** - Build tool
- **MindAR.js** - Image-based AR tracking
- **A-Frame** - 3D/AR rendering
- **Firebase** - Database & file storage

## Project Structure

```
ar-poster/
├── index.html          # Thing2 - AR Viewer
├── admin.html          # Thing1 - Admin Dashboard
├── src/
│   ├── thing1.js       # Admin dashboard logic
│   ├── thing2.js       # AR viewer logic
│   ├── firebase.js     # Firebase configuration
│   └── styles/
│       ├── shared.css  # Common styles
│       ├── thing1.css  # Admin styles
│       └── thing2.css  # Viewer styles
├── .env.example        # Environment template
├── vite.config.js      # Vite configuration
└── package.json
```

## License

MIT

---

Built with ❤️ for interactive art experiences

