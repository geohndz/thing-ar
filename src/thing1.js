// AR Setup - Admin Dashboard
import { defineCustomElements } from '@ionic/core/loader/index.js';
import { toastController, loadingController, alertController } from '@ionic/core';
import '@ionic/core/css/ionic.bundle.css';
import '@ionic/core/css/palettes/dark.class.css';
import {
  createProject,
  getProject,
  updateProject,
  addTarget,
  getTargets,
  updateTarget,
  deleteTarget,
  uploadPoster,
  uploadVideo,
  uploadTargetsMind,
  deleteFile
} from './firebase.js';

// Import MindAR Compiler from npm package
import { Compiler } from 'mind-ar/src/image-target/compiler.js';

// ============================================
// State
// ============================================

let currentProject = null;
let targets = [];
let currentTargetIndex = null; // For video upload
let isCompiled = false;
let loader = null;

// Store original poster files for compilation (avoids CORS issues)
const posterFiles = new Map();

// ============================================
// DOM Elements
// ============================================

const getEl = (id) => document.getElementById(id);

const projectNameInput = () => getEl('project-name');
const portfolioUrlInput = () => getEl('portfolio-url');
const linkedinUrlInput = () => getEl('linkedin-url');
const instagramUrlInput = () => getEl('instagram-url');
const postersGrid = () => getEl('posters-grid');
const addPosterBtn = () => getEl('add-poster-btn');
const posterInput = () => getEl('poster-input');
const videoInput = () => getEl('video-input');
const compileBtn = () => getEl('compile-btn');
const saveBtn = () => getEl('save-btn');
const statusDot = () => getEl('status-dot');
const statusText = () => getEl('status-text');
const posterCount = () => getEl('poster-count');
const shareUrlInput = () => getEl('share-url');
const copyUrlBtn = () => getEl('copy-url-btn');
const previewBtn = () => getEl('preview-btn');
// const compileModal = document.getElementById('compile-modal');
// const compileProgress = document.getElementById('compile-progress');
// const compileStatus = document.getElementById('compile-status');
// const toastContainer = document.getElementById('toast-container');


// ============================================
// Initialize
// ============================================

async function init() {
  // Check for existing project ID in URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('p');
  
  // Only load project if explicitly in URL - always start fresh otherwise
  if (projectId) {
    await loadProject(projectId);
  }
  // If no project ID, start with empty form (fresh project)
  
  setupEventListeners();
  updateUI();
}

async function loadProject(projectId) {
  try {
    const project = await getProject(projectId);
    if (project) {
      currentProject = project;
      targets = await getTargets(projectId);
      isCompiled = project.compiled || false;
      
      // Populate form
      projectNameInput().value = project.name || '';
      portfolioUrlInput().value = project.portfolioUrl || '';
      linkedinUrlInput().value = project.linkedinUrl || '';
      instagramUrlInput().value = project.instagramUrl || '';
      
      // Update URL
      window.history.replaceState({}, '', `?p=${projectId}`);
      localStorage.setItem('thing1_last_project', projectId);
      
      // Clear local poster files (they need to be re-added if user wants to recompile)
      posterFiles.clear();
      
      showToast('Project loaded', 'success');
    }
  } catch (error) {
    console.error('Error loading project:', error);
    showToast('Failed to load project', 'error');
  }
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Add poster button
  addPosterBtn().addEventListener('click', () => {
    posterInput().click();
  });
  
  // Poster file selected
  posterInput().addEventListener('change', handlePosterUpload);
  
  // Video file selected
  videoInput().addEventListener('change', handleVideoUpload);
  
  // Compile button
  compileBtn().addEventListener('click', compileTargets);
  
  // Save button
  saveBtn().addEventListener('click', saveProject);
  
  // Copy URL button
  copyUrlBtn().addEventListener('click', copyShareUrl);
  
  // Preview button
  previewBtn().addEventListener('click', openPreview);
}

// ============================================
// Poster Management
// ============================================

async function handlePosterUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Ensure project exists
  if (!currentProject) {
    try {
      await createNewProject();
    } catch (e) {
      console.error('Failed to create project:', e);
      showToast('Failed to create project: ' + e.message, 'error');
      return;
    }
  }
  
  const targetIndex = targets.length;
  
  try {
    showToast('Uploading poster...', 'info');
    
    // Store file locally for compilation
    posterFiles.set(targetIndex, file);
    
    // Upload poster image
    const { url: posterUrl, path: posterPath } = await uploadPoster(
      currentProject.id,
      targetIndex,
      file
    );
    
    // Create target in database
    const targetId = await addTarget(currentProject.id, {
      targetIndex,
      posterUrl,
      posterPath,
      posterFilename: file.name,
      videoUrl: null,
      videoPath: null,
      videoFilename: null
    });
    
    // Add to local state
    targets.push({
      id: targetId,
      targetIndex,
      posterUrl,
      posterPath,
      posterFilename: file.name,
      videoUrl: null,
      videoPath: null,
      videoFilename: null
    });
    
    // Mark as not compiled since we added new content
    isCompiled = false;
    await updateProject(currentProject.id, { compiled: false });
    
    updateUI();
    showToast('Poster added!', 'success');
  } catch (error) {
    console.error('Error uploading poster:', error);
    showToast('Failed to upload poster', 'error');
  }
  
  // Reset input
  posterInput().value = '';
}

async function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (!file || currentTargetIndex === null) return;
  
  const target = targets.find(t => t.targetIndex === currentTargetIndex);
  if (!target) return;
  
  try {
    showToast('Uploading video...', 'info');
    
    // Delete old video if exists
    if (target.videoPath) {
      try {
        await deleteFile(target.videoPath);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
    
    // Upload new video
    const { url: videoUrl, path: videoPath } = await uploadVideo(
      currentProject.id,
      currentTargetIndex,
      file
    );
    
    // Update target in database
    await updateTarget(currentProject.id, target.id, {
      videoUrl,
      videoPath,
      videoFilename: file.name
    });
    
    // Update local state
    target.videoUrl = videoUrl;
    target.videoPath = videoPath;
    target.videoFilename = file.name;
    
    updateUI();
    showToast('Video added!', 'success');
  } catch (error) {
    console.error('Error uploading video:', error);
    showToast('Failed to upload video', 'error');
  }
  
  // Reset
  videoInput().value = '';
  currentTargetIndex = null;
}

async function removePoster(targetIndex) {
  const target = targets.find(t => t.targetIndex === targetIndex);
  if (!target) return;
  
  const alert = await alertController.create({
    header: 'Delete Poster?',
    message: 'Are you sure you want to delete this poster and its video?',
    mode: 'ios',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Delete',
        role: 'destructive',
        handler: async () => {
          try {
            // Delete files from storage
            if (target.posterPath) {
              try { await deleteFile(target.posterPath); } catch (e) {}
            }
            if (target.videoPath) {
              try { await deleteFile(target.videoPath); } catch (e) {}
            }
            
            // Delete from database
            await deleteTarget(currentProject.id, target.id);
            
            // Remove from local state
            targets = targets.filter(t => t.id !== target.id);
            posterFiles.delete(targetIndex);
            
            // Re-index remaining targets
            const newPosterFiles = new Map();
            targets.forEach((t, i) => {
              const oldIndex = t.targetIndex;
              t.targetIndex = i;
              if (posterFiles.has(oldIndex)) {
                newPosterFiles.set(i, posterFiles.get(oldIndex));
              }
            });
            posterFiles.clear();
            newPosterFiles.forEach((v, k) => posterFiles.set(k, v));
            
            // Mark as not compiled
            isCompiled = false;
            await updateProject(currentProject.id, { compiled: false });
            
            updateUI();
            showToast('Poster removed', 'success');
          } catch (error) {
            console.error('Error removing poster:', error);
            showToast('Failed to remove poster', 'error');
          }
        }
      }
    ]
  });
  
  await alert.present();
}

// ============================================
// Project Management
// ============================================

async function createNewProject() {
  const projectData = {
    name: projectNameInput().value || 'Untitled Project',
    portfolioUrl: portfolioUrlInput().value || '',
    linkedinUrl: linkedinUrlInput().value || '',
    instagramUrl: instagramUrlInput().value || ''
  };
  
  const projectId = await createProject(projectData);
  currentProject = { id: projectId, ...projectData };
  
  // Update URL
  window.history.replaceState({}, '', `?p=${projectId}`);
  localStorage.setItem('thing1_last_project', projectId);
  
  return projectId;
}

async function saveProject() {
  if (!currentProject) {
    await createNewProject();
    showToast('Project created!', 'success');
    updateUI();
    return;
  }
  
  try {
    await updateProject(currentProject.id, {
      name: projectNameInput().value || 'Untitled Project',
      portfolioUrl: portfolioUrlInput().value || '',
      linkedinUrl: linkedinUrlInput().value || '',
      instagramUrl: instagramUrlInput().value || ''
    });
    
    currentProject.name = projectNameInput().value;
    currentProject.portfolioUrl = portfolioUrlInput().value;
    currentProject.linkedinUrl = linkedinUrlInput().value;
    currentProject.instagramUrl = instagramUrlInput().value;
    
    showToast('Project saved!', 'success');
    updateUI();
  } catch (error) {
    console.error('Error saving project:', error);
    showToast('Failed to save project', 'error');
  }
}

// ============================================
// Target Compilation
// ============================================

async function compileTargets() {
  if (targets.length === 0) {
    showToast('Add at least one poster first', 'error');
    return;
  }
  
  // Check if we have all poster files locally
  const missingFiles = targets.filter(t => !posterFiles.has(t.targetIndex));
  if (missingFiles.length > 0) {
    showToast(`Please re-upload ${missingFiles.length} poster(s) to compile.`, 'error');
    return;
  }
  
  const loading = await loadingController.create({
    message: 'Compiling targets...',
    spinner: 'crescent',
    mode: 'ios'
  });
  await loading.present();
  
  try {
    // Load all poster images from local files
    const images = await Promise.all(
      targets.map(async (target, i) => {
        const file = posterFiles.get(target.targetIndex);
        return createImageBitmap(file);
      })
    );
    
    // Use MindAR compiler
    const compiler = new Compiler();
    
    // Compile
    const dataList = await compiler.compileImageTargets(images, (progress) => {
      loading.message = `Compiling... ${Math.round(progress)}%`;
    });
    
    loading.message = 'Exporting...';
    
    // Export to buffer
    const exportedBuffer = await compiler.exportData(dataList);
    
    loading.message = 'Uploading...';
    const { url: mindUrl } = await uploadTargetsMind(currentProject.id, exportedBuffer);
    
    // Update project
    await updateProject(currentProject.id, {
      compiled: true,
      targetCount: targets.length,
      mindUrl
    });
    
    currentProject.mindUrl = mindUrl;
    isCompiled = true;
    
    await loading.dismiss();
    updateUI();
    showToast('Targets compiled successfully!', 'success');
    
  } catch (error) {
    console.error('Compilation error:', error);
    await loading.dismiss();
    showToast('Compilation failed.', 'error');
  }
}

// ============================================
// UI Updates
// ============================================

function updateUI() {
  // Update poster count
  posterCount().textContent = `${targets.length} poster${targets.length !== 1 ? 's' : ''}`;
  
  // Update status
  if (isCompiled) {
    statusDot().classList.add('compiled');
    statusDot().classList.remove('compiling');
    statusText().textContent = `Compiled (${targets.length} targets)`;
  } else if (targets.length > 0) {
    statusDot().classList.remove('compiled', 'compiling');
    statusText().textContent = 'Not compiled - changes pending';
  } else {
    statusDot().classList.remove('compiled', 'compiling');
    statusText().textContent = 'No posters added';
  }
  
  // Update share URL
  if (currentProject) {
    const baseUrl = window.location.origin;
    shareUrlInput().value = `${baseUrl}/?p=${currentProject.id}`;
  } else {
    shareUrlInput().value = '';
    shareUrlInput().placeholder = 'Save project to get share link';
  }
  
  // Render poster cards
  renderPosterCards();
}

function renderPosterCards() {
  // Clear existing cards (except add button)
  const existingCards = postersGrid().querySelectorAll('.poster-card-filled');
  existingCards.forEach(card => card.remove());
  
  // Add cards for each target
  targets.forEach((target, index) => {
    const card = createPosterCard(target);
    postersGrid().insertBefore(card, addPosterBtn());
  });
}

function createPosterCard(target) {
  const card = document.createElement('div');
  card.className = 'poster-card poster-card-filled';
  card.dataset.index = target.targetIndex;
  
  const hasVideo = !!target.videoUrl;
  const hasLocalFile = posterFiles.has(target.targetIndex);
  
  // Use local file URL if available, otherwise use Firebase URL
  const imageUrl = hasLocalFile 
    ? URL.createObjectURL(posterFiles.get(target.targetIndex))
    : target.posterUrl;
  
  card.innerHTML = `
    <div class="poster-preview">
      <img src="${imageUrl}" alt="Poster ${target.targetIndex + 1}" />
      <span class="poster-index">${target.targetIndex + 1}</span>
      ${!hasLocalFile ? '<span class="poster-warning" title="Re-upload to compile">⚠️</span>' : ''}
      <button class="poster-delete" title="Delete poster">
        <ion-icon name="close-outline"></ion-icon>
      </button>
    </div>
    <div class="poster-info">
      <div class="poster-name">${target.posterFilename || 'Poster'}</div>
      <div class="poster-video-status ${hasVideo ? 'has-video' : 'no-video'}">
        ${hasVideo ? `
          <ion-icon name="checkmark-circle-outline"></ion-icon>
          Video added
        ` : `
          <ion-icon name="add-circle-outline"></ion-icon>
          No video
        `}
      </div>
      <button class="video-upload-btn">${hasVideo ? 'Replace video' : 'Add video'}</button>
    </div>
  `;
  
  // Event listeners
  const deleteBtn = card.querySelector('.poster-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removePoster(target.targetIndex);
  });
  
  const videoBtn = card.querySelector('.video-upload-btn');
  videoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    currentTargetIndex = target.targetIndex;
    videoInput().click();
  });
  
  return card;
}

// ============================================
// Utilities
// ============================================

async function copyShareUrl() {
  if (!shareUrlInput().value) {
    showToast('Save project first', 'error');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(shareUrlInput().value);
    showToast('URL copied!', 'success');
  } catch (err) {
    // Fallback
    shareUrlInput().select();
    document.execCommand('copy');
    showToast('URL copied!', 'success');
  }
}

function openPreview() {
  if (!currentProject) {
    showToast('Save project first', 'error');
    return;
  }
  
  if (!isCompiled) {
    showToast('Compile targets first', 'error');
    return;
  }
  
  window.open(`/?p=${currentProject.id}`, '_blank');
}

async function showToast(message, type = 'info') {
  const color = type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary';
  const toast = await toastController.create({
    message: message,
    duration: 3000,
    color: color,
    position: 'bottom',
    mode: 'ios'
  });
  await toast.present();
}

// ============================================
// Start
// ============================================

defineCustomElements();
init();
