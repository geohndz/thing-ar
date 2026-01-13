// Thing2 - AR Viewer
import { getProject, getTargets } from './firebase.js';

// ============================================
// State
// ============================================

let project = null;
let targets = [];
let arScene = null;
let arSystem = null;
let videoElements = [];

// ============================================
// DOM Elements
// ============================================

const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const errorScreen = document.getElementById('error-screen');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');
const fabContainer = document.getElementById('fab-container');
const fabMain = document.getElementById('fab-main');
const fabPortfolio = document.getElementById('fab-portfolio');
const fabLinkedin = document.getElementById('fab-linkedin');
const fabInstagram = document.getElementById('fab-instagram');
const arContainer = document.getElementById('ar-container');
const arSceneEl = document.getElementById('ar-scene');
const arAssets = document.getElementById('ar-assets');
const arTargetsEl = document.getElementById('ar-targets');

// ============================================
// Initialize
// ============================================

async function init() {
  try {
    // Get project ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('p');
    
    if (!projectId) {
      showError('No project specified. Scan a QR code to start.');
      return;
    }
    
    loadingText.textContent = 'Loading project...';
    
    // Load project data
    project = await getProject(projectId);
    
    if (!project) {
      showError('Project not found.');
      return;
    }
    
    if (!project.compiled || !project.mindUrl) {
      showError('This project hasn\'t been set up yet. Ask the creator to compile it in Thing1.');
      return;
    }
    
    // Load targets
    loadingText.textContent = 'Loading targets...';
    targets = await getTargets(projectId);
    
    if (targets.length === 0) {
      showError('No posters have been added to this project yet.');
      return;
    }
    
    // Set up social links
    setupSocialLinks();
    
    // Initialize AR
    loadingText.textContent = 'Setting up AR...';
    await initializeAR();
    
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to load project. Please try again.');
  }
}

// ============================================
// Social Links Setup
// ============================================

function setupSocialLinks() {
  if (project.portfolioUrl) {
    fabPortfolio.href = project.portfolioUrl;
    fabPortfolio.style.display = 'flex';
  } else {
    fabPortfolio.style.display = 'none';
  }
  
  if (project.linkedinUrl) {
    fabLinkedin.href = project.linkedinUrl;
    fabLinkedin.style.display = 'flex';
  } else {
    fabLinkedin.style.display = 'none';
  }
  
  if (project.instagramUrl) {
    fabInstagram.href = project.instagramUrl;
    fabInstagram.style.display = 'flex';
  } else {
    fabInstagram.style.display = 'none';
  }
}

// ============================================
// AR Initialization
// ============================================

async function initializeAR() {
  console.log('initializeAR called');
  console.log('Project mindUrl:', project.mindUrl);
  console.log('Targets:', targets);
  
  // DEBUG: Fetch the .mind file manually to check its size
  let mindBlobUrl = project.mindUrl;
  try {
    console.log('Fetching .mind file to verify...');
    const response = await fetch(project.mindUrl);
    const buffer = await response.arrayBuffer();
    console.log('Downloaded .mind file size:', buffer.byteLength, 'bytes');
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    // Convert to data URL to eliminate any extra fetch indirection
    const mindBlob = new Blob([buffer], { type: 'application/octet-stream' });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(mindBlob);
    });
    mindBlobUrl = dataUrl;
    console.log('Using data URL for mind file');
    
    // Log any fetch sizes (if MindAR fetches again)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        const clone = res.clone();
        const buf = await clone.arrayBuffer();
        const url = args[0] instanceof Request ? args[0].url : args[0];
        console.log('Fetch size:', buf.byteLength, 'bytes', 'url:', url);
      } catch (err) {
        // ignore
      }
      return res;
    };
  } catch (e) {
    console.error('Failed to fetch .mind file:', e);
  }
  
  // Update the mindar-image component and system directly to ensure the new source is used
  arSceneEl.setAttribute('mindar-image', `imageTargetSrc: ${mindBlobUrl}; autoStart: false; uiScanning: no; uiLoading: no;`);
  const mindarComp = arSceneEl.components['mindar-image'];
  if (mindarComp) {
    mindarComp.data.imageTargetSrc = mindBlobUrl;
  }
  const mindarSystem = arSceneEl.systems['mindar-image-system'];
  if (mindarSystem) {
    mindarSystem.imageTargetSrc = mindBlobUrl;
    console.log('Updated mindar system imageTargetSrc:', mindarSystem.imageTargetSrc);
  }
  console.log('Set mindar-image attribute + system override');
  
  // Create video assets and target entities
  targets.forEach((target, index) => {
    if (target.videoUrl) {
      // Create video element
      const video = document.createElement('video');
      video.id = `video-${index}`;
      video.src = target.videoUrl;
      video.setAttribute('preload', 'auto');
      video.setAttribute('loop', 'true');
      video.setAttribute('muted', 'true');
      video.setAttribute('playsinline', 'true');
      video.setAttribute('crossorigin', 'anonymous');
      video.muted = true;
      arAssets.appendChild(video);
      videoElements.push(video);
      
      // Create target entity with video
      const targetEntity = document.createElement('a-entity');
      targetEntity.setAttribute('mindar-image-target', `targetIndex: ${index}`);
      
      // Create video plane
      // Aspect ratio will be determined by the video, defaulting to 16:9
      const videoPlane = document.createElement('a-video');
      videoPlane.setAttribute('src', `#video-${index}`);
      videoPlane.setAttribute('position', '0 0 0');
      videoPlane.setAttribute('width', '1');
      videoPlane.setAttribute('height', '1.78'); // Approximate phone screen ratio
      videoPlane.setAttribute('video-handler', '');
      
      targetEntity.appendChild(videoPlane);
      arTargetsEl.appendChild(targetEntity);
    }
  });
  
  // Register custom component for video handling
  AFRAME.registerComponent('video-handler', {
    init: function() {
      const video = this.el.components.material?.material?.map?.image;
      
      this.el.parentEl.addEventListener('targetFound', () => {
        if (video) {
          video.play().catch(e => console.log('Video autoplay prevented:', e));
        }
        showTargetFound();
      });
      
      this.el.parentEl.addEventListener('targetLost', () => {
        if (video) {
          video.pause();
        }
        hideTargetFound();
      });
    }
  });
  
  // Wait for scene to be ready
  loadingText.textContent = 'Requesting camera access...';
  
  console.log('Scene hasLoaded:', arSceneEl.hasLoaded);
  
  const startAR = async () => {
    console.log('Starting AR...');
    try {
      // Get MindAR system
      arSystem = arSceneEl.systems['mindar-image-system'];
      console.log('MindAR system:', arSystem);
      
      if (!arSystem) {
        console.error('MindAR system not found!');
        showError('AR system failed to initialize. Please refresh.');
        return;
      }
      
      // Start AR
      console.log('Calling arSystem.start()...');
      await arSystem.start();
      console.log('AR started successfully!');
      
      // Hide loading screen
      loadingScreen.classList.add('hidden');
      
      // Add scanning indicator
      addScanningIndicator();
      
    } catch (error) {
      console.error('AR start error:', error);
      if (error.name === 'NotAllowedError') {
        showError('Camera access denied. Please allow camera access and refresh.');
      } else {
        showError('Failed to start AR: ' + error.message);
      }
    }
  };
  
  if (arSceneEl.hasLoaded) {
    console.log('Scene already loaded, starting AR immediately');
    await startAR();
  } else {
    console.log('Waiting for scene to load...');
    arSceneEl.addEventListener('loaded', startAR);
  }
  
  arSceneEl.addEventListener('arError', (event) => {
    console.error('AR Error:', event);
    showError('AR error occurred. Please refresh and try again.');
  });
}

// ============================================
// UI Helpers
// ============================================

function addScanningIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'scanning-indicator visible';
  indicator.innerHTML = `
    <div class="scanning-dot"></div>
    <span>Scanning for posters...</span>
  `;
  document.body.appendChild(indicator);
}

function showTargetFound() {
  // Remove scanning indicator temporarily
  const scanningIndicator = document.querySelector('.scanning-indicator');
  if (scanningIndicator) {
    scanningIndicator.classList.remove('visible');
  }
  
  // Show target found indicator
  let indicator = document.querySelector('.target-found');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'target-found';
    indicator.textContent = 'Poster detected!';
    document.body.appendChild(indicator);
  }
  indicator.classList.add('visible');
}

function hideTargetFound() {
  const indicator = document.querySelector('.target-found');
  if (indicator) {
    indicator.classList.remove('visible');
  }
  
  // Show scanning indicator again
  const scanningIndicator = document.querySelector('.scanning-indicator');
  if (scanningIndicator) {
    scanningIndicator.classList.add('visible');
  }
}

function showError(message) {
  loadingScreen.classList.add('hidden');
  errorText.textContent = message;
  errorScreen.classList.remove('hidden');
}

// ============================================
// FAB Interaction
// ============================================

if (fabMain && fabContainer) {
  fabMain.addEventListener('click', () => {
    fabContainer.classList.toggle('expanded');
  });
}

// Close FAB when clicking outside
if (fabContainer) {
  document.addEventListener('click', (e) => {
    if (!fabContainer.contains(e.target)) {
      fabContainer.classList.remove('expanded');
    }
  });
}

// Close FAB when clicking a link
if (fabContainer) {
  [fabPortfolio, fabLinkedin, fabInstagram].forEach(link => {
    if (!link) return;
    link.addEventListener('click', () => {
      setTimeout(() => {
        fabContainer.classList.remove('expanded');
      }, 100);
    });
  });
}

// ============================================
// Retry Handler
// ============================================

if (retryBtn) {
  retryBtn.addEventListener('click', () => {
    window.location.reload();
  });
}

// ============================================
// Start
// ============================================

init();


