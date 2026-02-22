import * as THREE from 'three';
import { AudioController } from './audio.js';

// --- Configuration ---
const CONFIG = {
    PLAYER_SPEED_BASE: 50,
    PLAYER_SPEED_MAX: 100,
    PLAYER_ACCEL: 50,
    PLAYER_TURN_SPEED: 40,
    HOOP_RADIUS: 8,
    HOOP_THICKNESS: 0.5,
    SPAWN_DISTANCE: 400,
    REMOVE_DISTANCE: 50,
    OBSTACLE_SPAWN_RATE: 0.5, // 0-1 chance per segment
    HOOP_SPAWN_INTERVAL: 150, // Distance between hoops
};

// --- Game State ---
let state = {
    isRunning: false,
    score: 0,
    misses: 0,
    gameOver: false,
    isPaused: false,
    wasAutoPausedByVisibility: false, // NEW: Track if paused due to visibility change
    speed: CONFIG.PLAYER_SPEED_BASE,
    distanceTraveled: 0,
    lastSpawnZ: 0,
};

// --- Objects ---
let camera, scene, renderer;
let eagle;
let leftWing, rightWing;
let audioCtrl;
let objects = []; // Hoops and Obstacles
let explosions = []; // Particle systems
let keys = {};

// On-screen control states
let isAccelerateBtnPressed = false;
let isDpadUp = false;
let isDpadDown = false;
let isDpadLeft = false;
let isDpadRight = false;

// For D-pad touch tracking
let dpadTouchIdentifier = null; // To track a specific touch
let dpadRect = null; // Bounding rectangle of the dpad for calculations


// Constants for Touch Control
const TOUCH_ACCEL_THRESHOLD = 20; // Pixels moved before considering it a significant swipe for movement (no longer used for movement, but for reference)
const TOUCH_MOVE_SPEED_MULTIPLIER = 0.5; // Reduce touch movement speed by half


// Geometries & Materials Cache
const geometries = {
    hoop: new THREE.TorusGeometry(CONFIG.HOOP_RADIUS, CONFIG.HOOP_THICKNESS, 8, 16),
    wall: new THREE.BoxGeometry(20, 15, 2),
    fan: new THREE.CylinderGeometry(3, 3, 2, 16),
    log: new THREE.CylinderGeometry(1, 1, 30, 8)
};

const materials = {
    hoop: new THREE.MeshPhongMaterial({ color: 0xFFD700, emissive: 0xAA6600, emissiveIntensity: 0.2 }),
    hoopPassed: new THREE.MeshPhongMaterial({ color: 0x00FF00, emissive: 0x00AA00, emissiveIntensity: 0.5 }),
    wall: new THREE.MeshPhongMaterial({ color: 0xA52A2A }),
    fan: new THREE.MeshPhongMaterial({ color: 0x88CCFF }),
    log: new THREE.MeshPhongMaterial({ color: 0x5D4037 })
};

// Rotate geometries once if needed
geometries.fan.rotateX(Math.PI / 2);
geometries.log.rotateZ(Math.PI / 2);


// --- Helper functions for D-pad ---
function handleDpadTouch(clientX, clientY, rect) {
    resetDpadControls(); // Reset all before setting new ones

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // We only care about direction relative to center, not magnitude for simple D-pad
    const deadZone = rect.width * 0.2; // A small central dead zone

    const x = clientX - centerX;
    const y = clientY - centerY;

    if (Math.abs(x) > Math.abs(y)) { // More horizontal movement
        if (x < -deadZone) isDpadLeft = true;
        else if (x > deadZone) isDpadRight = true;
    } else { // More vertical movement
        if (y < -deadZone) isDpadUp = true;
        else if (y > deadZone) isDpadDown = true;
    }
}

function resetDpadControls() {
    isDpadUp = false;
    isDpadDown = false;
    isDpadLeft = false;
    isDpadRight = false;
}

// --- Initialization ---
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 100, 500);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // Ground (Infinite scrolling illusion later, but for now just a large plane below)
    const planeGeo = new THREE.PlaneGeometry(2000, 10000);
    const planeMat = new THREE.MeshLambertMaterial({ color: 0x2E8B57 });
    const ground = new THREE.Mesh(planeGeo, planeMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -50;
    scene.add(ground);

    // Eagle (Player)
    createEagle();

    // Audio
    audioCtrl = new AudioController();

    // Event Listeners (Keyboard)
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyP') {
            togglePause();
        }
        keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => keys[e.code] = false);

    // NEW: Visibility API event listener for auto-pause/resume
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- New On-screen Control Event Listeners ---
    // Accelerate Button
    const accelerateBtn = document.getElementById('accelerate-btn');
    if (accelerateBtn) {
        accelerateBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isAccelerateBtnPressed = true;
        }, { passive: false });
        accelerateBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            isAccelerateBtnPressed = false;
        }, { passive: false });
        accelerateBtn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            isAccelerateBtnPressed = false;
        }, { passive: false });
    }

    // Mobile Pause Button
    const mobilePauseBtn = document.getElementById('pause-btn-mobile');
    if (mobilePauseBtn) {
        mobilePauseBtn.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent default browser behavior (e.g., tap highlight, double-tap zoom)
            togglePause();
        }, { passive: false });
    }
    
    // D-pad Control
    const dpadControl = document.getElementById('dpad-control');
    if (dpadControl) {
        dpadControl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && dpadTouchIdentifier === null) {
                dpadTouchIdentifier = e.touches[0].identifier;
                dpadRect = dpadControl.getBoundingClientRect(); // Get rect once on touchstart
                handleDpadTouch(e.touches[0].clientX, e.touches[0].clientY, dpadRect);
            }
        }, { passive: false });

        dpadControl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = Array.from(e.touches).find(t => t.identifier === dpadTouchIdentifier);
            if (touch && dpadRect) {
                handleDpadTouch(touch.clientX, touch.clientY, dpadRect);
            }
        }, { passive: false });

        dpadControl.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = Array.from(e.changedTouches).find(t => t.identifier === dpadTouchIdentifier);
            if (touch) {
                resetDpadControls();
                dpadTouchIdentifier = null;
                dpadRect = null;
            }
        }, { passive: false });

        dpadControl.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            const touch = Array.from(e.changedTouches).find(t => t.identifier === dpadTouchIdentifier);
            if (touch) {
                resetDpadControls();
                dpadTouchIdentifier = null;
                dpadRect = null;
            }
        }, { passive: false });
    }


    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    // Removed old document.getElementById('mobile-pause-btn') listener as it's replaced


    // Display version info
    if (typeof __COMMIT_HASH__ !== 'undefined' && typeof __BUILD_DATE__ !== 'undefined') {
        const versionInfoElement = document.getElementById('version-info');
        if (versionInfoElement) {
            versionInfoElement.innerHTML = `Version: ${__COMMIT_HASH__} Built: ${__BUILD_DATE__}`;
        }
    }

    // Hide mobile controls initially (they will be shown by startGame if on mobile)
    const mobileControls = document.getElementById('mobile-controls-container');
    if (mobileControls) {
        mobileControls.style.display = 'none';
    }


    // Loop
    animate();
}

function createEagle() {
    const eagleGroup = new THREE.Group();

    // Body
    const bodyGeo = new THREE.ConeGeometry(1, 4, 8);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x8B4513 }); // SaddleBrown
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    eagleGroup.add(body);

    // Wings
    const wingMat = new THREE.MeshPhongMaterial({ color: 0xA0522D });

    const wingGeoLeft = new THREE.BoxGeometry(3, 0.2, 1.5);
    wingGeoLeft.translate(-1.5, 0, 0); // Pivot at the right edge
    leftWing = new THREE.Mesh(wingGeoLeft, wingMat);
    leftWing.position.set(0, 0.5, 0);
    eagleGroup.add(leftWing);

    const wingGeoRight = new THREE.BoxGeometry(3, 0.2, 1.5);
    wingGeoRight.translate(1.5, 0, 0); // Pivot at the left edge
    rightWing = new THREE.Mesh(wingGeoRight, wingMat);
    rightWing.position.set(0, 0.5, 0);
    eagleGroup.add(rightWing);

    // Head
    const headGeo = new THREE.SphereGeometry(0.8, 8, 8);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.5, -2);
    eagleGroup.add(head);

    // Beak
    const beakGeo = new THREE.ConeGeometry(0.3, 1, 8);
    beakGeo.rotateX(Math.PI / 2);
    const beakMat = new THREE.MeshPhongMaterial({ color: 0xFFD700 });
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.position.set(0, 0.3, -2.8);
    eagleGroup.add(beak);

    eagle = eagleGroup;
    scene.add(eagle);
}

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    // Show mobile controls if on a mobile viewport
    const mobileControls = document.getElementById('mobile-controls-container');
    if (mobileControls && window.innerWidth <= 768) { // Check for mobile viewport
        mobileControls.style.display = 'flex';
    }

    resetGame();
    state.isRunning = true;
    audioCtrl.resumeMusic();
}

function restartGame() {
    startGame();
}

function resetGame() {
    state.score = 0;
    state.misses = 0;
    state.gameOver = false;
    state.distanceTraveled = 0;
    state.lastSpawnZ = 0;
    state.speed = CONFIG.PLAYER_SPEED_BASE;

    if (audioCtrl) audioCtrl.setIntensity(0);

    eagle.position.set(0, 0, 0);
    eagle.rotation.set(0, 0, 0);

    // Clear objects
    objects.forEach(obj => scene.remove(obj.mesh));
    objects = [];
    
    // Clear explosions
    explosions.forEach(exp => exp.meshes.forEach(m => scene.remove(m)));
    explosions = [];

    // Show eagle
    eagle.visible = true;

    // Reset UI
    updateUI();
}

function updateUI() {
    document.getElementById('score').innerText = `Score: ${state.score}`;
    document.getElementById('misses').innerText = `Misses: ${state.misses}/3`;
}

function updateSpeedUI(currentSpeed) {
    // Convert speed to MPH (CONFIG.PLAYER_SPEED_MAX = 100 MPH)
    const mph = Math.round((currentSpeed / CONFIG.PLAYER_SPEED_MAX) * 100);
    document.getElementById('speed-meter').innerText = `Speed: ${mph} MPH`;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function createExplosion(pos) {
    const particleCount = 20;
    const meshes = [];
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshPhongMaterial({ color: 0xFF4500 }); // OrangeRed

    for (let i = 0; i < particleCount; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        // Random velocity
        mesh.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );
        scene.add(mesh);
        meshes.push(mesh);
    }
    
    explosions.push({
        meshes: meshes,
        life: 2.0 // seconds
    });
}

function updateExplosions(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.life -= dt;
        
        if (exp.life <= 0) {
            exp.meshes.forEach(m => scene.remove(m));
            explosions.splice(i, 1);
            continue;
        }

        exp.meshes.forEach(m => {
            m.position.addScaledVector(m.userData.velocity, dt);
            m.rotation.x += dt * 5;
            m.rotation.y += dt * 5;
        });
    }
}

// --- Game Logic ---

function spawnObjects(playerZ) {
    const spawnZ = playerZ - CONFIG.SPAWN_DISTANCE;

    // Spawn periodically
    if (state.lastSpawnZ - spawnZ >= CONFIG.HOOP_SPAWN_INTERVAL) {
        state.lastSpawnZ = spawnZ;
        
        // Random Position
        const x = (Math.random() - 0.5) * 80; // +/- 40 range
        const y = (Math.random() * 30) + 5;   // 5 to 35 height
        
        spawnHoop(x, y, spawnZ);

        // Increase obstacle chance with score
        const obstacleChance = Math.min(0.2 + (state.score * 0.05), 0.8);

        if (Math.random() < obstacleChance) {
             // Type of obstacle
             const type = Math.random();
             if (type < 0.33) spawnWall(x, y, spawnZ);
             else if (type < 0.66) spawnFan(x, y, spawnZ);
             else spawnLog(x, y, spawnZ);
        }
    }
}

function spawnHoop(x, y, z) {
    const mesh = new THREE.Mesh(geometries.hoop, materials.hoop.clone());
    mesh.position.set(x, y, z);
    scene.add(mesh);
    
    objects.push({
        type: 'hoop',
        mesh: mesh,
        passed: false,
        active: true
    });
}

function spawnWall(targetX, targetY, z) {
    const mesh = new THREE.Mesh(geometries.wall, materials.wall);
    
    // Position it near the hoop to block it
    const offsetX = (Math.random() - 0.5) * 10;
    mesh.position.set(targetX + offsetX, targetY, z - 20); 
    
    scene.add(mesh);
    objects.push({
        type: 'wall',
        mesh: mesh,
        active: true,
        moving: Math.random() > 0.5,
        speed: (Math.random() - 0.5) * 20
    });
}

function spawnFan(targetX, targetY, z) {
    const mesh = new THREE.Mesh(geometries.fan, materials.fan);
    
    // Offset from hoop
    mesh.position.set(targetX + 10, targetY, z - 10);
    
    scene.add(mesh);
    
    objects.push({
        type: 'fan',
        mesh: mesh,
        active: true,
        force: -30 // Push left
    });
}

function spawnLog(targetX, targetY, z) {
    const mesh = new THREE.Mesh(geometries.log, materials.log);
    
    mesh.position.set(targetX, targetY + (Math.random() * 10 - 5), z - 15);
    scene.add(mesh);
    
    objects.push({
        type: 'log',
        mesh: mesh,
        active: true,
        swinging: true,
        angle: 0
    });
}

function updateObjects(dt) {
    const playerPos = eagle.position;
    
    // Check misses first
    for (const obj of objects) {
        if (obj.type === 'hoop' && obj.active && !obj.passed && !obj.missed) {
             // If hoop is behind player by more than a tiny bit, it's missed
             // Player goes negative Z. If hoop.z > player.z + 1, it's behind.
             if (obj.mesh.position.z > playerPos.z + 1) {
                 obj.missed = true;
                 state.misses++;
                 obj.active = false; // No longer interactive
                 obj.mesh.material.color.setHex(0xFF0000); // Turn red
                 
                 updateUI();
                 audioCtrl.setIntensity(state.misses / 3.0 + state.score * 0.05);

                 if (state.misses >= 3) {
                     gameOver();
                 }
             }
        }
    }

    // Filter out objects that are too far behind
    for (let i = objects.length - 1; i >= 0; i--) {
        const obj = objects[i];
        
        // Logic for obstacles
        if (obj.type === 'wall' && obj.moving) {
            obj.mesh.position.x += obj.speed * dt;
            if (Math.abs(obj.mesh.position.x - playerPos.x) > 50) obj.speed *= -1; // Bounce vaguely
        }
        else if (obj.type === 'log' && obj.swinging) {
            obj.angle += dt * 2;
            obj.mesh.position.y += Math.sin(obj.angle) * 0.1;
        }
        else if (obj.type === 'fan') {
            obj.mesh.rotation.z += 10 * dt;
            // Fan Logic applied in checkCollisions if close
        }

        // Cleanup
        if (obj.mesh.position.z > playerPos.z + CONFIG.REMOVE_DISTANCE) {
            scene.remove(obj.mesh);
            
            if (obj.type === 'hoop') {
                obj.mesh.material.dispose();
            }
            
            objects.splice(i, 1);
        }
    }
}

function checkCollisions(dt) {
    const playerPos = eagle.position;
    // Simple bounding sphere for player
    const playerRadius = 1.5;

    for (const obj of objects) {
        if (!obj.active) continue;

        const dz = obj.mesh.position.z - playerPos.z;
        
        // Only check objects nearby in Z
        if (Math.abs(dz) < 5) {
            const dx = obj.mesh.position.x - playerPos.x;
            const dy = obj.mesh.position.y - playerPos.y;
            const distSq = dx*dx + dy*dy;
            
            if (obj.type === 'hoop') {
                if (distSq < (CONFIG.HOOP_RADIUS * CONFIG.HOOP_RADIUS)) {
                    // Inside hoop radius
                    // Mark passed only if we are very close to the center plane
                    if (Math.abs(dz) < 1.0) {
                        obj.passed = true;
                        obj.active = false; // Don't check again
                        obj.mesh.material.color.setHex(0x00FF00); // Turn green
                        state.score++;
                        updateUI();
                        audioCtrl.playCollectSound();
                        
                        // Increase speed slightly
                        state.speed = Math.min(state.speed + 1, CONFIG.PLAYER_SPEED_MAX);
                    }
                }
            } else if (obj.type === 'wall' || obj.type === 'log') {
                // Approximate collision for obstacles
                // Wall is box, Log is cylinder. Simplified to sphere check for now or basic bounds
                let collisionDist = 3; // Generic size
                if (obj.type === 'wall') collisionDist = 8;
                if (obj.type === 'log') collisionDist = 2; // Radius
                
                // For log (horizontal), x distance matters less if within length
                if (obj.type === 'log') {
                   if (Math.abs(dx) < 15 && Math.abs(dy) < 2) { // 15 = half length, 2 = radius
                       gameOver();
                   }
                } else if (obj.type === 'wall') {
                   if (Math.abs(dx) < 10 && Math.abs(dy) < 7.5) {
                       gameOver();
                   }
                }
            } else if (obj.type === 'fan') {
                // Fan pushes player
                if (distSq < 100) { // Range of effect
                    eagle.position.x += (obj.force * dt * (1 - Math.sqrt(distSq)/10));
                }
            }
        }
    }
}

function togglePause() {
    if (!state.isRunning || state.gameOver) return; // Keep this line
    state.isPaused = !state.isPaused;
    console.log('togglePause called. state.isPaused is now:', state.isPaused); // NEW LOG

    const pauseScreen = document.getElementById('pause-screen');
    const mobileControls = document.getElementById('mobile-controls-container');

    if (state.isPaused) {
        pauseScreen.style.display = 'block';
        audioCtrl.pauseMusic(); // Pause music - ADDED
        console.log('Game paused. Music paused.'); // NEW LOG
        if (window.innerWidth <= 768 && mobileControls) {
            mobileControls.style.display = 'none'; // Handle mobile controls in if block
        }
    } else {
        pauseScreen.style.display = 'none';
        audioCtrl.resumeMusic(); // Resume music - ADDED
        console.log('Game unpaused. Music resumed.'); // NEW LOG
        if (window.innerWidth <= 768 && mobileControls) {
            mobileControls.style.display = 'flex'; // Handle mobile controls in else block
        }
        requestAnimationFrame(animate); // NEW: Explicitly restart the animation loop
    }
    // No need to manually trigger animate() here, as requestAnimationFrame will pick up
    // once isPaused is false. Removed animate() call from original else block.
}

function gameOver() {
    if (state.gameOver) return; // Prevent multiple triggers
    state.gameOver = true;
    state.isRunning = false;
    
    // Hide mobile controls
    const mobileControls = document.getElementById('mobile-controls-container');
    if (mobileControls) {
        mobileControls.style.display = 'none';
    }

    // Explosion
    createExplosion(eagle.position);
    eagle.visible = false;

    audioCtrl.playCrashSound();
    audioCtrl.playGameOverMusic();
    
    document.getElementById('final-score').innerText = `Score: ${state.score}`;
    document.getElementById('game-over-screen').style.display = 'block';
}

// NEW: Function to handle visibility changes
function handleVisibilityChange() {
    console.log('Visibility changed:', document.visibilityState); // NEW LOG
    if (document.visibilityState === 'hidden') {
        console.log('Document hidden. state.isRunning:', state.isRunning, 'state.isPaused:', state.isPaused, 'state.gameOver:', state.gameOver); // NEW LOG
        // If the game is running and not already manually paused, auto-pause it
        if (state.isRunning && !state.isPaused && !state.gameOver) {
            console.log('Auto-pausing due to visibility hidden.'); // NEW LOG
            togglePause();
            state.wasAutoPausedByVisibility = true; // Mark as auto-paused
            console.log('Auto-pause flag set:', state.wasAutoPausedByVisibility); // NEW LOG
        }
    } else { // document.visibilityState === 'visible'
        console.log('Document visible. state.wasAutoPausedByVisibility:', state.wasAutoPausedByVisibility, 'state.isPaused:', state.isPaused, 'state.isRunning:', state.isRunning); // NEW LOG
        // If the game was auto-paused due to visibility, unpause it
        if (state.wasAutoPausedByVisibility && state.isPaused && state.isRunning) {
            console.log('Auto-unpausing due to visibility visible.'); // NEW LOG
            togglePause();
            state.wasAutoPausedByVisibility = false; // Reset the flag
            console.log('Auto-pause flag reset:', state.wasAutoPausedByVisibility); // NEW LOG
        }
    }
}


function animate() {
    if (state.isPaused) return; 
    requestAnimationFrame(animate);

    const dt = 0.016; 
    
    updateExplosions(dt);

    if (!state.isRunning) {
        renderer.render(scene, camera);
        return;
    }

    // Input Handling (Keyboard & On-screen controls)
    let moveLeft = keys['ArrowLeft'] || keys['KeyA'] || isDpadLeft;
    let moveRight = keys['ArrowRight'] || keys['KeyD'] || isDpadRight;
    let moveUp = keys['ArrowUp'] || keys['KeyW'] || isDpadUp;
    let moveDown = keys['ArrowDown'] || keys['KeyS'] || isDpadDown;
    let accelerate = keys['Space'] || isAccelerateBtnPressed;

    let currentTurnSpeed = CONFIG.PLAYER_TURN_SPEED; // Initialize with base turn speed

    if (isDpadUp || isDpadDown || isDpadLeft || isDpadRight) { // If any D-pad control is active
        currentTurnSpeed = CONFIG.PLAYER_TURN_SPEED * TOUCH_MOVE_SPEED_MULTIPLIER;
    }
    
    if (moveUp) eagle.position.y += currentTurnSpeed * dt * 0.5;
    if (moveDown) eagle.position.y -= currentTurnSpeed * dt * 0.5;
    if (moveLeft) eagle.position.x -= currentTurnSpeed * dt;
    if (moveRight) eagle.position.x += currentTurnSpeed * dt;
    
    // Clamp X/Y
    eagle.position.y = Math.max(1, Math.min(eagle.position.y, 50));
    eagle.position.x = Math.max(-100, Math.min(eagle.position.x, 100));

    // Banking effect
    const targetRotZ = (moveLeft) ? 0.5 : (moveRight) ? -0.5 : 0;
    eagle.rotation.z += (targetRotZ - eagle.rotation.z) * 5 * dt;

    // Wing flapping
    const wingBop = Math.sin(Date.now() * 0.015) * 0.4;
    leftWing.rotation.z = wingBop;
    rightWing.rotation.z = -wingBop;

    // Movement
    let currentSpeed = state.speed;
    if (accelerate) currentSpeed += CONFIG.PLAYER_ACCEL;
    
    updateSpeedUI(currentSpeed);

    const moveDist = currentSpeed * dt;
    eagle.position.z -= moveDist;
    state.distanceTraveled += moveDist;

    // Camera follow
    camera.position.z = eagle.position.z + 10;
    camera.position.y = eagle.position.y + 3;
    camera.position.x = eagle.position.x * 0.5; // Slight lag/pan
    camera.lookAt(eagle.position.x, eagle.position.y, eagle.position.z - 20);

    // Spawning & Logic
    spawnObjects(eagle.position.z);
    updateObjects(dt);
    checkCollisions(dt);
    
    renderer.render(scene, camera);
}

// Start
init();