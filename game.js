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

// Global Touch Variables
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let touchCurrentY = 0;
let isTouching = false;
let isAccelerating = false; // For continuous acceleration on touch

// Constants for Touch Control
const TOUCH_ACCEL_THRESHOLD = 20; // Pixels moved before considering it a significant swipe for movement


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

    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyP') {
            togglePause();
        }
        keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => keys[e.code] = false);

    // Touch Event Listeners
    document.addEventListener('touchstart', (e) => {
        // Only prevent default if the target is NOT a button or other interactive element
        // Check if the touched element or any of its parents is a button
        let targetIsButton = false;
        let currentTarget = e.target;
        while (currentTarget) {
            if (currentTarget.tagName === 'BUTTON' || currentTarget.tagName === 'A' || currentTarget.tagName === 'INPUT' || currentTarget.classList.contains('interactive-ui')) {
                targetIsButton = true;
                break;
            }
            currentTarget = currentTarget.parentElement;
        }

        if (!targetIsButton) {
            e.preventDefault(); // Prevent scrolling/zooming only if not interacting with a UI button
        }

        if (state.gameOver || state.isPaused) return; // Prevent input when game is not active
        if (e.touches.length === 1) { // Single touch for movement/acceleration
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchCurrentX = touchStartX; // Initialize current with start
            touchCurrentY = touchStartY; // Initialize current with start
            isTouching = true;
            isAccelerating = true; // Start accelerating on first touch
        } else if (e.touches.length === 2) { // Two fingers to pause
            togglePause();
        }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (isTouching && e.touches.length === 1) {
            e.preventDefault(); // Always prevent default on touchmove if moving
            touchCurrentX = e.touches[0].clientX;
            touchCurrentY = e.touches[0].clientY;
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        // Similar logic for touchend to ensure buttons are clickable
        let targetIsButton = false;
        let currentTarget = e.target;
        while (currentTarget) {
            if (currentTarget.tagName === 'BUTTON' || currentTarget.tagName === 'A' || currentTarget.tagName === 'INPUT' || currentTarget.classList.contains('interactive-ui')) {
                targetIsButton = true;
                break;
            }
            currentTarget = currentTarget.parentElement;
        }

        if (!targetIsButton) {
            e.preventDefault(); // Prevent tap highlight etc. only if not on a button
        }

        isTouching = false;
        isAccelerating = false; // Stop accelerating on touch release
        // Clear simulated key presses from touch
        keys['ArrowUp'] = false;
        keys['ArrowDown'] = false;
        keys['ArrowLeft'] = false;
        keys['ArrowRight'] = false;
        keys['Space'] = false; // Also clear space if it was simulated
    }, { passive: false });


    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('resume-btn').addEventListener('click', togglePause);
    document.getElementById('mobile-pause-btn').addEventListener('click', togglePause); // New mobile pause button

    // Display version info
    if (typeof __COMMIT_HASH__ !== 'undefined' && typeof __BUILD_DATE__ !== 'undefined') {
        const versionInfoElement = document.getElementById('version-info');
        if (versionInfoElement) {
            versionInfoElement.innerHTML = `Version: ${__COMMIT_HASH__} Built: ${__BUILD_DATE__}`;
        }
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
    
    resetGame();
    state.isRunning = true;
    audioCtrl.startMusic();
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
    if (!state.isRunning || state.gameOver) return;
    
    state.isPaused = !state.isPaused;
    
    if (state.isPaused) {
        document.getElementById('pause-screen').style.display = 'block';
    } else {
        document.getElementById('pause-screen').style.display = 'none';
        animate(); 
    }
}

function gameOver() {
    if (state.gameOver) return; // Prevent multiple triggers
    state.gameOver = true;
    state.isRunning = false;
    
    // Explosion
    createExplosion(eagle.position);
    eagle.visible = false;

    audioCtrl.playCrashSound();
    audioCtrl.playGameOverMusic();
    
    document.getElementById('final-score').innerText = `Score: ${state.score}`;
    document.getElementById('game-over-screen').style.display = 'block';
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

    // Input Handling (Keyboard & Touch)
    let moveLeft = keys['ArrowLeft'] || keys['KeyA'];
    let moveRight = keys['ArrowRight'] || keys['KeyD'];
    let moveUp = keys['ArrowUp'] || keys['KeyW'];
    let moveDown = keys['ArrowDown'] || keys['KeyS'];
    let accelerate = keys['Space'];

    if (isTouching) {
        const deltaX = touchCurrentX - touchStartX;
        const deltaY = touchCurrentY - touchStartY;

        // Apply movement based on swipe direction and magnitude
        // Using a threshold to prevent accidental small movements
        if (Math.abs(deltaX) > TOUCH_ACCEL_THRESHOLD) {
            if (deltaX < 0) moveLeft = true;
            else moveRight = true;
        }
        if (Math.abs(deltaY) > TOUCH_ACCEL_THRESHOLD) {
            if (deltaY < 0) moveUp = true;
            else moveDown = true;
        }

        // Always accelerate if touch is active (single finger)
        accelerate = accelerate || isAccelerating; // Combine keyboard space with touch acceleration
    }

    if (moveUp) eagle.position.y += CONFIG.PLAYER_TURN_SPEED * dt * 0.5;
    if (moveDown) eagle.position.y -= CONFIG.PLAYER_TURN_SPEED * dt * 0.5;
    if (moveLeft) eagle.position.x -= CONFIG.PLAYER_TURN_SPEED * dt;
    if (moveRight) eagle.position.x += CONFIG.PLAYER_TURN_SPEED * dt;
    
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
