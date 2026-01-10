// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

// Your Firebase configuration
// Replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_AUTH_DOMAIN",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_STORAGE_BUCKET",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

console.log('Firebase config:', {
  apiKey: firebaseConfig.apiKey ? '✓ set' : '✗ missing',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ============================================
// Firestore Operations
// ============================================

/**
 * Create a new project
 */
export async function createProject(projectData) {
  const projectId = crypto.randomUUID();
  const projectRef = doc(db, 'projects', projectId);
  
  await setDoc(projectRef, {
    ...projectData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    compiled: false,
    targetCount: 0
  });
  
  return projectId;
}

/**
 * Get a project by ID
 */
export async function getProject(projectId) {
  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);
  
  if (projectSnap.exists()) {
    return { id: projectSnap.id, ...projectSnap.data() };
  }
  
  return null;
}

/**
 * Update a project
 */
export async function updateProject(projectId, data) {
  const projectRef = doc(db, 'projects', projectId);
  await updateDoc(projectRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * Get all projects
 */
export async function getAllProjects() {
  const projectsRef = collection(db, 'projects');
  const snapshot = await getDocs(projectsRef);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/**
 * Add a target to a project
 */
export async function addTarget(projectId, targetData) {
  const targetId = crypto.randomUUID();
  const targetRef = doc(db, 'projects', projectId, 'targets', targetId);
  
  await setDoc(targetRef, {
    ...targetData,
    createdAt: serverTimestamp()
  });
  
  return targetId;
}

/**
 * Get all targets for a project
 */
export async function getTargets(projectId) {
  const targetsRef = collection(db, 'projects', projectId, 'targets');
  const snapshot = await getDocs(targetsRef);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })).sort((a, b) => a.targetIndex - b.targetIndex);
}

/**
 * Update a target
 */
export async function updateTarget(projectId, targetId, data) {
  const targetRef = doc(db, 'projects', projectId, 'targets', targetId);
  await updateDoc(targetRef, data);
}

/**
 * Delete a target
 */
export async function deleteTarget(projectId, targetId) {
  const targetRef = doc(db, 'projects', projectId, 'targets', targetId);
  await deleteDoc(targetRef);
}

// ============================================
// Storage Operations
// ============================================

/**
 * Upload a poster image
 */
export async function uploadPoster(projectId, targetIndex, file) {
  const extension = file.name.split('.').pop();
  const path = `projects/${projectId}/posters/${targetIndex}.${extension}`;
  const storageRef = ref(storage, path);
  
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  
  return { path, url };
}

/**
 * Upload a video
 */
export async function uploadVideo(projectId, targetIndex, file) {
  const extension = file.name.split('.').pop();
  const path = `projects/${projectId}/videos/${targetIndex}.${extension}`;
  const storageRef = ref(storage, path);
  
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  
  return { path, url };
}

/**
 * Upload compiled targets.mind file
 */
export async function uploadTargetsMind(projectId, mindBuffer) {
  const path = `projects/${projectId}/targets.mind`;
  const storageRef = ref(storage, path);
  
  const blob = new Blob([mindBuffer], { type: 'application/octet-stream' });
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  
  return { path, url };
}

/**
 * Get download URL for a file
 */
export async function getFileUrl(path) {
  const storageRef = ref(storage, path);
  return await getDownloadURL(storageRef);
}

/**
 * Delete a file from storage
 */
export async function deleteFile(path) {
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

/**
 * Delete all files in a project folder
 */
export async function deleteProjectFiles(projectId) {
  const folderRef = ref(storage, `projects/${projectId}`);
  const list = await listAll(folderRef);
  
  // Delete all files
  await Promise.all(list.items.map(item => deleteObject(item)));
  
  // Recursively delete subfolders
  await Promise.all(list.prefixes.map(async (prefix) => {
    const subList = await listAll(prefix);
    await Promise.all(subList.items.map(item => deleteObject(item)));
  }));
}

export { db, storage };

