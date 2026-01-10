// Thing2 - AR Viewer
import { defineCustomElements } from '@ionic/core/loader';
import { loadingController, alertController } from '@ionic/core';
import '@ionic/core/css/ionic.bundle.css';
import '@ionic/core/css/palettes/dark.class.css';
import { getProject, getTargets } from './firebase.js';

// ============================================
// State
// ============================================

let project = null;
let targets = [];
let arScene = null;
let arSystem = null;
let videoElements = [];
let loader = null;

// ============================================
// DOM Elements
// ============================================

const arContainer = document.getElementById('ar-container');
const arSceneEl = document.getElementById('ar-scene');
const arAssets = document.getElementById('ar-assets');
const arTargetsEl = document.getElementById('ar-targets');
const fabContainer = document.getElementById('fab-container');
const fabPortfolio = document.getElementById('fab-portfolio');
const fabLinkedin = document.getElementById('fab-linkedin');
const fabInstagram = document.getElementById('fab-instagram');
const statusOverlay = document.getElementById('status-overlay');

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
    
    loader = await loadingController.create({
      message: 'Loading project...',
      spinner: 'crescent',
      mode: 'ios',
      cssClass: 'custom-loader'
    });
    await loader.present();
    
    // Load project data
    project = await getProject(projectId);
    
    if (!project) {
      await loader.dismiss();
      showError('Project not found.');
      return;
    }
    
    if (!project.compiled || !project.mindUrl) {
      await loader.dismiss();
      showError('This project hasn\'t been set up yet. Ask the creator to compile it in Thing1.');
      return;
    }
    
    // Load targets
    loader.message = 'Loading targets...';
    targets = await getTargets(projectId);
    
    if (targets.length === 0) {
      await loader.dismiss();
      showError('No posters have been added to this project yet.');
      return;
    }
    
    // Set up social links
    setupSocialLinks();
    
    // Initialize AR
    loader.message = 'Setting up AR...';
    await initializeAR();
    
  } catch (error) {
    console.error('Initialization error:', error);
    if (loader) await loader.dismiss();
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
  if (loader) loader.message = 'Requesting camera access...';
  
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
      if (loader) await loader.dismiss();
      
      // Add scanning indicator
      addScanningIndicator();
      
    } catch (error) {
      console.error('AR start error:', error);
      if (loader) await loader.dismiss();
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
  statusOverlay.appendChild(indicator);
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
    statusOverlay.appendChild(indicator);
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

async function showError(message) {
  const alert = await alertController.create({
    header: 'Error',
    message: message,
    mode: 'ios',
    buttons: [
      {
        text: 'Retry',
        handler: () => {
          window.location.reload();
        }
      }
    ]
  });
  await alert.present();
}

// ============================================
// FAB Interaction
// ============================================

// FAB is handled by Ionic components now
// Social links are updated in setupSocialLinks via href

// ============================================
// Start
// ============================================

defineCustomElements();
init();


