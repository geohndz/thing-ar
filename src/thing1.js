// Thing1 - Admin Dashboard
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

// Store original poster files for compilation (avoids CORS issues)
const posterFiles = new Map();

// ============================================
// DOM Elements
// ============================================

const projectNameInput = document.getElementById('project-name');
const portfolioUrlInput = document.getElementById('portfolio-url');
const linkedinUrlInput = document.getElementById('linkedin-url');
const instagramUrlInput = document.getElementById('instagram-url');
const postersGrid = document.getElementById('posters-grid');
const addPosterBtn = document.getElementById('add-poster-btn');
const posterInput = document.getElementById('poster-input');
const videoInput = document.getElementById('video-input');
const compileBtn = document.getElementById('compile-btn');
const saveBtn = document.getElementById('save-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const posterCount = document.getElementById('poster-count');
const shareUrl = document.getElementById('share-url');
const copyUrlBtn = document.getElementById('copy-url-btn');
const previewBtn = document.getElementById('preview-btn');
const compileModal = document.getElementById('compile-modal');
const compileProgress = document.getElementById('compile-progress');
const compileStatus = document.getElementById('compile-status');
const compilePercent = document.getElementById('compile-percent');
const toastContainer = document.getElementById('toast-container');

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
      projectNameInput.value = project.name || '';
      portfolioUrlInput.value = project.portfolioUrl || '';
      linkedinUrlInput.value = project.linkedinUrl || '';
      instagramUrlInput.value = project.instagramUrl || '';
      
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
  addPosterBtn.addEventListener('click', () => {
    posterInput.click();
  });
  
  // Poster file selected
  posterInput.addEventListener('change', handlePosterUpload);
  
  // Video file selected
  videoInput.addEventListener('change', handleVideoUpload);
  
  // Compile button
  compileBtn.addEventListener('click', compileTargets);
  
  // Save button
  saveBtn.addEventListener('click', saveProject);
  
  // Copy URL button
  copyUrlBtn.addEventListener('click', copyShareUrl);
  
  // Preview button
  previewBtn.addEventListener('click', openPreview);
}

// ============================================
// Poster Management
// ============================================

async function handlePosterUpload(event) {
  console.log('handlePosterUpload called', event);
  const file = event.target.files[0];
  console.log('Selected file:', file);
  if (!file) {
    console.log('No file selected');
    return;
  }
  
  // Ensure project exists
  if (!currentProject) {
    console.log('No current project, creating new one...');
    try {
      await createNewProject();
      console.log('Project created:', currentProject);
    } catch (e) {
      console.error('Failed to create project:', e);
      showToast('Failed to create project: ' + e.message, 'error');
      return;
    }
  }
  
  const targetIndex = targets.length;
  console.log('Target index:', targetIndex);
  
  try {
    console.log('Starting upload...');
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
  posterInput.value = '';
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
  videoInput.value = '';
  currentTargetIndex = null;
}

async function removePoster(targetIndex) {
  const target = targets.find(t => t.targetIndex === targetIndex);
  if (!target) return;
  
  if (!confirm('Delete this poster and its video?')) return;
  
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

// ============================================
// Project Management
// ============================================

async function createNewProject() {
  const projectData = {
    name: projectNameInput.value || 'Untitled Project',
    portfolioUrl: portfolioUrlInput.value || '',
    linkedinUrl: linkedinUrlInput.value || '',
    instagramUrl: instagramUrlInput.value || ''
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
      name: projectNameInput.value || 'Untitled Project',
      portfolioUrl: portfolioUrlInput.value || '',
      linkedinUrl: linkedinUrlInput.value || '',
      instagramUrl: instagramUrlInput.value || ''
    });
    
    currentProject.name = projectNameInput.value;
    currentProject.portfolioUrl = portfolioUrlInput.value;
    currentProject.linkedinUrl = linkedinUrlInput.value;
    currentProject.instagramUrl = instagramUrlInput.value;
    
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
    showToast(`Please re-upload ${missingFiles.length} poster(s) to compile. Local files were cleared on page reload.`, 'error');
    return;
  }
  
  // Show modal
  compileModal.classList.remove('hidden');
  compileProgress.style.width = '0%';
  compileStatus.textContent = 'Preparing images...';
  
  try {
    // Load all poster images from local files (no CORS issues!)
    const images = await Promise.all(
      targets.map(async (target, i) => {
        const status = `Loading unit ${i + 1}/${targets.length}`;
        compileStatus.textContent = status;
        const progress = ((i + 1) / targets.length) * 30;
        compileProgress.style.width = `${progress}%`;
        if (compilePercent) compilePercent.textContent = `${Math.round(progress)}%`;
        
        const file = posterFiles.get(target.targetIndex);
        return createImageBitmap(file);
      })
    );
    
    compileStatus.textContent = 'Preparing targets...';
    compileProgress.style.width = '40%';
    if (compilePercent) compilePercent.textContent = '40%';
    
    // Use MindAR compiler
    const compiler = new Compiler();
    
    // Compile with progress callback
    const dataList = await compiler.compileImageTargets(images, (progress) => {
      // progress comes as 0-100, not 0-1
      const normalizedProgress = progress > 1 ? progress / 100 : progress;
      const percent = 40 + (normalizedProgress * 50);
      compileProgress.style.width = `${Math.min(percent, 95)}%`;
      if (compilePercent) compilePercent.textContent = `${Math.round(Math.min(percent, 95))}%`;
      compileStatus.textContent = `Compiling... ${Math.round(Math.min(progress, 100))}%`;
    });
    
    compileStatus.textContent = 'Finalizing...';
    compileProgress.style.width = '95%';
    if (compilePercent) compilePercent.textContent = '95%';
    
    // Export to buffer (use the compiled dataList to avoid stale internal state)
    const exportedBuffer = await compiler.exportData(dataList);
    
    // Upload to Firebase
    compileStatus.textContent = 'Sending to Thing 2...';
    const { url: mindUrl } = await uploadTargetsMind(currentProject.id, exportedBuffer);
    
    // Update project
    await updateProject(currentProject.id, {
      compiled: true,
      targetCount: targets.length,
      mindUrl
    });
    
    currentProject.mindUrl = mindUrl;
    isCompiled = true;
    
    compileProgress.style.width = '100%';
    if (compilePercent) compilePercent.textContent = '100%';
    compileStatus.textContent = 'Ready!';
    
    setTimeout(() => {
      compileModal.classList.add('hidden');
      updateUI();
      showToast('Project updated successfully', 'success');
    }, 500);
    
  } catch (error) {
    console.error('Compilation error:', error);
    compileModal.classList.add('hidden');
    showToast('Auto-compile failed. Please use the online compiler and upload the .mind file.', 'error');
  }
}

// ============================================
// UI Updates
// ============================================

function updateUI() {
  // Update poster count
  posterCount.textContent = `${targets.length} Unit${targets.length !== 1 ? 's' : ''}`;
  
  // Update status
  if (isCompiled) {
    statusDot.classList.add('compiled');
    statusDot.classList.remove('compiling');
    statusText.textContent = `Ready for Thing 2 (${targets.length} Targets)`;
  } else if (targets.length > 0) {
    statusDot.classList.remove('compiled', 'compiling');
    statusText.textContent = 'Wait! Compilation needed';
  } else {
    statusDot.classList.remove('compiled', 'compiling');
    statusText.textContent = 'No data added yet';
  }
  
  // Update share URL
  if (currentProject) {
    const baseUrl = window.location.origin;
    shareUrl.value = `${baseUrl}/?p=${currentProject.id}`;
  } else {
    shareUrl.value = '';
    shareUrl.placeholder = 'Save project to get share link';
  }
  
  // Render poster cards
  renderPosterCards();
}

function renderPosterCards() {
  // Clear existing cards (except add button)
  const existingCards = postersGrid.querySelectorAll('.poster-card-filled');
  existingCards.forEach(card => card.remove());
  
  // Add cards for each target
  targets.forEach((target, index) => {
    const card = createPosterCard(target);
    postersGrid.insertBefore(card, addPosterBtn);
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
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
    <div class="poster-info">
      <div class="poster-name">${target.posterFilename || 'Poster'}</div>
      <div class="poster-video-status ${hasVideo ? 'has-video' : 'no-video'}">
        ${hasVideo ? `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Video added
        ` : `
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
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
    videoInput.click();
  });
  
  return card;
}

// ============================================
// Utilities
// ============================================

function copyShareUrl() {
  if (!shareUrl.value) {
    showToast('Save project first', 'error');
    return;
  }
  
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    showToast('URL copied!', 'success');
  }).catch(() => {
    // Fallback
    shareUrl.select();
    document.execCommand('copy');
    showToast('URL copied!', 'success');
  });
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

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Start
// ============================================

init();
