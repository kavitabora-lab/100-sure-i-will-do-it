// Dried Lands - Desert Survival Game with Infinite World

let scene, camera, renderer;
let player = null;
let resources = [];
let treasures = [];
let buildings = [];
let bullets = [];
let enemies = [];
let peasants = [];
let terrainChunks = new Map();
let terrainObjects = [];

let health = 100;
let hunger = 100;
let resourcesCollected = 0;
let treasureFound = 0;
let ammo = 30;

let gradientMap;

let gameTime = 0;
let lastTime = Date.now();
let sun;
let isDay = true;
let weather = 'clear';
let weatherTimer = 0;
let stormDuration = 0;

let gameRunning = true;
let playerSpeed = 0.3;
let moveDirection = new THREE.Vector3(0, 0, 0);
let playerVerticalVelocity = 0;
const GRAVITY = -0.03;
const JUMP_VELOCITY = 0.7;
let isOnGround = true;
let jumpCount = 0;
const MAX_JUMPS = 3;
let gunModel = null; // 3D gun model in hand
let hasGun = false;
let gunType = null; // 'AK47', 'MP40', 'M10'
let lastShotTime = 0;

// Gun types with different fire rates, ammo capacity
const GUN_TYPES = {
    AK47: { name: 'AK-47', fireRate: 80, ammo: 30, damage: 35 },
    MP40: { name: 'MP40', fireRate: 50, ammo: 32, damage: 45 },
    M10: { name: 'M1 Carbine', fireRate: 120, ammo: 15, damage: 55 }
};

// Mouse look state (right-click drag to look around)
let isRightMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let yaw = 0; // horizontal rotation
let pitch = -0.2; // vertical rotation (negative looks down)
const MOUSE_SENSITIVITY = 0.005;
let CAMERA_DISTANCE = 10;
const CAMERA_DISTANCE_MIN = 3;
const CAMERA_DISTANCE_MAX = 30;

const keys = {};
const CHUNK_SIZE = 50;
const WORLD_BORDER = 250; // Max distance from origin
const RENDER_DISTANCE = 3; // Chunks to render around player
const ENEMY_SPAWN_CHANCE = 0.08;
const RESOURCE_SPAWN_CHANCE = 0.15;
const BUILDING_SPAWN_CHANCE = 90; // 90% chance to spawn a building in a chunk
const WATCH_TOWER_SPAWN_CHANCE = 4.99; // 4.99% chance to spawn a watch tower in a chunk
const OASIS_SPAWN_CHANCE = 2.00067; // 2.00067% chance to spawn an oasis in a chunk
const PEASANT_SPAWN_CHANCE = 100; // spawn peasants near buildings
const FIRE_RATE = 100; // milliseconds between shots

function init() {
    // Disable mouse wheel zoom for strict first-person view
    document.addEventListener('wheel', (e) => {
        e.preventDefault();
    }, { passive: false });

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 200, 400);
    
    gradientMap = new THREE.DataTexture( new Uint8Array([0,0,0, 128,128,128, 255,255,255]), 3, 1, THREE.RGBFormat );
    gradientMap.needsUpdate = true;
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 10);
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('gameContainer').appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // Dust particles for anime atmosphere
    const particleCount = 500;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 2000;
        positions[i * 3 + 1] = Math.random() * 100;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: 0xF5DEB3, size: 1, transparent: true, opacity: 0.6 });
    const dustParticles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(dustParticles);
    
    // Sun
    const sunGeometry = new THREE.SphereGeometry(10, 16, 16);
    const sunMaterial = new THREE.MeshToonMaterial({ color: 0xFFFF00, gradientMap: gradientMap });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);
    
    // Create player
    createPlayer();

    // Attempt to restore progress from save data
    loadGame();
    
    // Clear terrain cache to force regeneration with new building styles
    terrainChunks.clear();
    
    // Spawn initial world
    updateWorldChunks();
    
    // Event listeners
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        // Triple jump on spacebar
        if ((e.key === ' ' || e.code === 'Space') && jumpCount < MAX_JUMPS) {
            playerVerticalVelocity = JUMP_VELOCITY;
            isOnGround = false;
            jumpCount++;
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    
    document.addEventListener('click', fireGun);

    // First-person look: pointer lock and mouse movement
    const canvas = renderer.domElement;
    canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            // pointer locked, resume first-person look
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== canvas) return;
        yaw -= e.movementX * MOUSE_SENSITIVITY;
        pitch -= e.movementY * MOUSE_SENSITIVITY;
        const maxPitch = Math.PI / 2 - 0.1;
        const minPitch = -Math.PI / 2 + 0.1;
        pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    });

    // No context menu required; pointer lock bypasses right-click
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    window.addEventListener('resize', onWindowResize);
    
    animate();
}

function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function getChunkKey(x, z) {
    return `${x},${z}`;
}

function getChunkCoords(worldX, worldZ) {
    return {
        x: Math.floor(worldX / CHUNK_SIZE),
        z: Math.floor(worldZ / CHUNK_SIZE)
    };
}

function generateChunk(chunkX, chunkZ) {
    const key = getChunkKey(chunkX, chunkZ);
    if (terrainChunks.has(key)) return;
    
    const group = new THREE.Group();
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
    const groundMaterial = new THREE.MeshToonMaterial({ color: 0xd4a574, gradientMap: gradientMap });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    ground.receiveShadow = true;
    group.add(ground);
    
    // Generate terrain features based on chunk position
    const seed = chunkX * 73856093 ^ chunkZ * 19349663;
    
    console.log('generateChunk showing running code:', chunkX, chunkZ); // debug check

    // Hills/obstacles (now box hills to make code change obvious)
    const hillCount = Math.floor(seededRandom(seed) * 5);
    for (let i = 0; i < hillCount; i++) {
        const hillSeed = seed + i * 12345;
        const localX = seededRandom(hillSeed) * CHUNK_SIZE;
        const localZ = seededRandom(hillSeed + 1) * CHUNK_SIZE;
        const size = seededRandom(hillSeed + 2) * 3 + 2;
        const height = seededRandom(hillSeed + 3) * 4 + 2;
        
        const hillGeometry = new THREE.BoxGeometry(size, height, size);
        const hillMaterial = new THREE.MeshToonMaterial({ color: 0xff0000, gradientMap: gradientMap });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        
        hill.position.set(
            chunkX * CHUNK_SIZE + localX,
            0,
            chunkZ * CHUNK_SIZE + localZ
        );
        
        hill.castShadow = true;
        hill.receiveShadow = true;
        group.add(hill);
        terrainObjects.push(hill);
    }
    
    // Resources
    const resourceCount = Math.floor(seededRandom(seed + 100) * 8);
    for (let i = 0; i < resourceCount; i++) {
        if (seededRandom(seed + 100 + i) < RESOURCE_SPAWN_CHANCE) {
            const resourceSeed = seed + 100 + i;
            const localX = seededRandom(resourceSeed) * CHUNK_SIZE;
            const localZ = seededRandom(resourceSeed + 1) * CHUNK_SIZE;
            
            const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
            const material = new THREE.MeshToonMaterial({ color: 0x90ee90, gradientMap: gradientMap });
            const resource = new THREE.Mesh(geometry, material);
            
            resource.position.set(
                chunkX * CHUNK_SIZE + localX,
                0.3,
                chunkZ * CHUNK_SIZE + localZ
            );
            
            resource.castShadow = true;
            resource.collected = false;
            group.add(resource);
            resources.push(resource);
        }
    }
    
    // Enemies
    const enemyCount = Math.floor(seededRandom(seed + 200) * 6);
    for (let i = 0; i < enemyCount; i++) {
        if (seededRandom(seed + 200 + i) < ENEMY_SPAWN_CHANCE) {
            const enemySeed = seed + 200 + i;
            const localX = seededRandom(enemySeed) * CHUNK_SIZE;
            const localZ = seededRandom(enemySeed + 1) * CHUNK_SIZE;
            
            const enemyGroup = new THREE.Group();
            
            // Enemy Head
            const enemyHeadGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            const enemyHeadMaterial = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: gradientMap });
            const enemyHead = new THREE.Mesh(enemyHeadGeometry, enemyHeadMaterial);
            enemyHead.position.y = 1.5;
            enemyHead.castShadow = true;
            enemyGroup.add(enemyHead);
            
            // Enemy Torso
            const enemyTorsoGeometry = new THREE.BoxGeometry(0.6, 1, 0.4);
            const enemyTorsoMaterial = new THREE.MeshToonMaterial({ color: 0x440000, gradientMap: gradientMap });
            const enemyTorso = new THREE.Mesh(enemyTorsoGeometry, enemyTorsoMaterial);
            enemyTorso.position.y = 0.8;
            enemyTorso.castShadow = true;
            enemyGroup.add(enemyTorso);
            
            // Enemy Arms
            const enemyArmGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
            const enemyArmMaterial = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: gradientMap });
            
            const enemyLeftArm = new THREE.Mesh(enemyArmGeometry, enemyArmMaterial);
            enemyLeftArm.position.set(-0.5, 1, 0);
            enemyLeftArm.castShadow = true;
            enemyGroup.add(enemyLeftArm);
            
            const enemyRightArm = new THREE.Mesh(enemyArmGeometry, enemyArmMaterial);
            enemyRightArm.position.set(0.5, 1, 0);
            enemyRightArm.castShadow = true;
            enemyGroup.add(enemyRightArm);
            
            // Enemy Legs
            const enemyLegGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
            const enemyLegMaterial = new THREE.MeshToonMaterial({ color: 0x1a1a1a, gradientMap: gradientMap });
            
            const enemyLeftLeg = new THREE.Mesh(enemyLegGeometry, enemyLegMaterial);
            enemyLeftLeg.position.set(-0.2, 0.2, 0);
            enemyLeftLeg.castShadow = true;
            enemyGroup.add(enemyLeftLeg);
            
            const enemyRightLeg = new THREE.Mesh(enemyLegGeometry, enemyLegMaterial);
            enemyRightLeg.position.set(0.2, 0.2, 0);
            enemyRightLeg.castShadow = true;
            enemyGroup.add(enemyRightLeg);
            
            enemyGroup.position.set(
                chunkX * CHUNK_SIZE + localX,
                0,
                chunkZ * CHUNK_SIZE + localZ
            );
            
            enemyGroup.health = 100;
            enemyGroup.maxHealth = 100;
            
            // Add health bar above enemy
            const healthBarGeometry = new THREE.PlaneGeometry(1, 0.2);
            const healthBarMaterial = new THREE.MeshToonMaterial({ color: 0xFF0000, gradientMap: gradientMap });
            const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
            healthBar.position.y = 2.5;
            healthBar.position.z = 0.1;
            healthBar.scale.x = enemyGroup.health / enemyGroup.maxHealth;
            healthBar.userData.isHealthBar = true;
            enemyGroup.add(healthBar);
            enemyGroup.healthBar = healthBar;
            
            group.add(enemyGroup);
            enemies.push(enemyGroup);
        }
    }
    
    // Treasure (rare)
    if (seededRandom(seed + 300) < 0.02) {
        const treasureSeed = seed + 300;
        const localX = seededRandom(treasureSeed) * CHUNK_SIZE;
        const localZ = seededRandom(treasureSeed + 1) * CHUNK_SIZE;
        
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshToonMaterial({
            color: 0xffd700,
            emissive: 0xffd700,
            emissiveIntensity: 0.4
        });
        const treasure = new THREE.Mesh(geometry, material);
        
        treasure.position.set(
            chunkX * CHUNK_SIZE + localX,
            0.5,
            chunkZ * CHUNK_SIZE + localZ
        );
        
        treasure.castShadow = true;
        group.add(treasure);
        treasures.push(treasure);
    }
    
    // Buildings (Huts)
    const buildingCount = Math.floor(seededRandom(seed + 400) * 3);
    for (let i = 0; i < buildingCount; i++) {
        if (seededRandom(seed + 400 + i) < BUILDING_SPAWN_CHANCE) {
            const buildingSeed = seed + 400 + i;
            const localX = seededRandom(buildingSeed) * CHUNK_SIZE;
            const localZ = seededRandom(buildingSeed + 1) * CHUNK_SIZE;
            const buildingWorldX = chunkX * CHUNK_SIZE + localX;
            const buildingWorldZ = chunkZ * CHUNK_SIZE + localZ;
            
            const buildingGroup = new THREE.Group();
            
            // Hut with plate-based construction like oasis
            const wallHeight = seededRandom(buildingSeed + 3) * 1 + 2;
            const wallThickness = 0.2;
            const wallWidth = seededRandom(buildingSeed + 2) * 1.5 + 3;
            const doorWidth = 1;
            const doorHeight = 1.5;
            
            // Back wall
            const backWallGeometry = new THREE.BoxGeometry(wallWidth, wallHeight, wallThickness);
            const wallMaterial = new THREE.MeshToonMaterial({ color: 0xA0826D, gradientMap: gradientMap });
            const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
            backWall.position.set(0, wallHeight / 2, -wallWidth / 2 + wallThickness / 2);
            backWall.castShadow = true;
            backWall.receiveShadow = true;
            buildingGroup.add(backWall);
            
            // Left wall
            const leftWall = new THREE.Mesh(backWallGeometry, wallMaterial);
            leftWall.rotation.y = Math.PI / 2;
            leftWall.position.set(-wallWidth / 2 + wallThickness / 2, wallHeight / 2, 0);
            leftWall.castShadow = true;
            leftWall.receiveShadow = true;
            buildingGroup.add(leftWall);
            
            // Right wall
            const rightWall = new THREE.Mesh(backWallGeometry, wallMaterial);
            rightWall.rotation.y = Math.PI / 2;
            rightWall.position.set(wallWidth / 2 - wallThickness / 2, wallHeight / 2, 0);
            rightWall.castShadow = true;
            rightWall.receiveShadow = true;
            buildingGroup.add(rightWall);
            
            // Front wall with door opening (two plates: above door and sides)
            // Above door
            const aboveDoorGeometry = new THREE.BoxGeometry(wallWidth, wallHeight - doorHeight, wallThickness);
            const aboveDoor = new THREE.Mesh(aboveDoorGeometry, wallMaterial);
            aboveDoor.position.set(0, wallHeight - (wallHeight - doorHeight) / 2, wallWidth / 2 - wallThickness / 2);
            aboveDoor.castShadow = true;
            aboveDoor.receiveShadow = true;
            buildingGroup.add(aboveDoor);
            
            // Left side of door
            const sideDoorGeometry = new THREE.BoxGeometry((wallWidth - doorWidth) / 2, doorHeight, wallThickness);
            const leftDoorSide = new THREE.Mesh(sideDoorGeometry, wallMaterial);
            leftDoorSide.position.set(-doorWidth / 2 - (wallWidth - doorWidth) / 4, doorHeight / 2, wallWidth / 2 - wallThickness / 2);
            leftDoorSide.castShadow = true;
            leftDoorSide.receiveShadow = true;
            buildingGroup.add(leftDoorSide);
            
            // Right side of door
            const rightDoorSide = new THREE.Mesh(sideDoorGeometry, wallMaterial);
            rightDoorSide.position.set(doorWidth / 2 + (wallWidth - doorWidth) / 4, doorHeight / 2, wallWidth / 2 - wallThickness / 2);
            rightDoorSide.castShadow = true;
            rightDoorSide.receiveShadow = true;
            buildingGroup.add(rightDoorSide);
            
            // Roof plate
            const roofGeometry = new THREE.BoxGeometry(wallWidth + 0.5, wallThickness, wallWidth + 0.5);
            const roofMaterial = new THREE.MeshToonMaterial({ color: 0x6B5D4F, gradientMap: gradientMap });
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.y = wallHeight + wallThickness / 2;
            roof.castShadow = true;
            roof.receiveShadow = true;
            buildingGroup.add(roof);

            // Debug marker: make buildings unmistakable
            const markerGeometry = new THREE.BoxGeometry(1.2, 2.8, 1.2);
            const markerMaterial = new THREE.MeshToonMaterial({ color: 0xFF0000, emissive: 0x880000, gradientMap: gradientMap });
            const buildingMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            buildingMarker.position.set(0, 1.4, 0);
            buildingMarker.userData.debugMarker = true;
            buildingGroup.add(buildingMarker);
            
            // Door
            const doorGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.1);
            const doorMaterial = new THREE.MeshToonMaterial({ color: 0x3a2f25, gradientMap: gradientMap });
            const door = new THREE.Mesh(doorGeometry, doorMaterial);
            door.position.set(0, 0.6, hutRadius + 0.05);
            buildingGroup.add(door);
            
            // Ammo crate inside building
            if (seededRandom(buildingSeed + 4) < 0.6) {
                const ammoGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
                const ammoMaterial = new THREE.MeshToonMaterial({ color: 0xFFD700, gradientMap: gradientMap });
                const ammoBox = new THREE.Mesh(ammoGeometry, ammoMaterial);
                ammoBox.position.y = 0.3;
                ammoBox.position.z = -0.5;
                ammoBox.isAmmo = true;
                ammoBox.ammoAmount = 25;
                buildingGroup.add(ammoBox);
            }
            
            // Gun box inside building (with random gun type)
            if (seededRandom(buildingSeed + 5) < 0.3) {
                const gunTypes = ['AK47', 'MP40', 'M10'];
                const randomGunType = gunTypes[Math.floor(seededRandom(buildingSeed + 6) * gunTypes.length)];
                
                const gunGeometry = new THREE.BoxGeometry(0.6, 0.2, 0.2);
                const gunMaterial = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: gradientMap });
                const gunBox = new THREE.Mesh(gunGeometry, gunMaterial);
                gunBox.position.y = 0.4;
                gunBox.position.x = -0.5;
                gunBox.isGun = true;
                gunBox.gunType = randomGunType;
                buildingGroup.add(gunBox);
            }
            
            buildingGroup.position.set(buildingWorldX, 0, buildingWorldZ);
            group.add(buildingGroup);
            buildings.push(buildingGroup);
            
            // Spawn peasants near buildings
            for (let p = 0; p < Math.floor(seededRandom(buildingSeed + 7) * 2); p++) {
                if (seededRandom(buildingSeed + 7 + p) < PEASANT_SPAWN_CHANCE) {
                    const peasantOffsetX = (seededRandom(buildingSeed + 8 + p) - 0.5) * 8;
                    const peasantOffsetZ = (seededRandom(buildingSeed + 9 + p) - 0.5) * 8;
                    createPeasant(buildingWorldX + peasantOffsetX, buildingWorldZ + peasantOffsetZ);
                }
            }
        }
    }
    
    // Watch Towers
    if (seededRandom(seed + 500) < WATCH_TOWER_SPAWN_CHANCE / 100) {
        const towerSeed = seed + 500;
        const localX = seededRandom(towerSeed) * CHUNK_SIZE;
        const localZ = seededRandom(towerSeed + 1) * CHUNK_SIZE;
        const towerWorldX = chunkX * CHUNK_SIZE + localX;
        const towerWorldZ = chunkZ * CHUNK_SIZE + localZ;
        createWatchTower(towerWorldX, towerWorldZ);
    }
    
    // Oasis
    if (seededRandom(seed + 600) < OASIS_SPAWN_CHANCE / 100) {
        const oasisSeed = seed + 600;
        const localX = seededRandom(oasisSeed) * CHUNK_SIZE;
        const localZ = seededRandom(oasisSeed + 1) * CHUNK_SIZE;
        const oasisWorldX = chunkX * CHUNK_SIZE + localX;
        const oasisWorldZ = chunkZ * CHUNK_SIZE + localZ;
        createOasis(oasisWorldX, oasisWorldZ);
    }
    
    scene.add(group);
    terrainChunks.set(key, group);
}

function unloadChunk(chunkX, chunkZ) {
    const key = getChunkKey(chunkX, chunkZ);
    const chunk = terrainChunks.get(key);
    if (chunk) {
        scene.remove(chunk);
        terrainChunks.delete(key);
    }
}

function updateWorldChunks() {
    const playerChunk = getChunkCoords(player.position.x, player.position.z);
    
    // Load chunks around player
    for (let x = playerChunk.x - RENDER_DISTANCE; x <= playerChunk.x + RENDER_DISTANCE; x++) {
        for (let z = playerChunk.z - RENDER_DISTANCE; z <= playerChunk.z + RENDER_DISTANCE; z++) {
            generateChunk(x, z);
        }
    }
    
    // Unload far chunks
    terrainChunks.forEach((chunk, key) => {
        const [x, z] = key.split(',').map(Number);
        if (Math.abs(x - playerChunk.x) > RENDER_DISTANCE + 1 || 
            Math.abs(z - playerChunk.z) > RENDER_DISTANCE + 1) {
            unloadChunk(x, z);
        }
    });
}

function createPlayer() {
    const group = new THREE.Group();
    
    // Head (cube)
    const headGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMaterial = new THREE.MeshToonMaterial({ color: 0xf4a460, gradientMap: gradientMap });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);
    
    // Torso (rectangular box)
    const torsoGeometry = new THREE.BoxGeometry(0.6, 1, 0.4);
    const torsoMaterial = new THREE.MeshToonMaterial({ color: 0xff6b4a, gradientMap: gradientMap });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.8;
    torso.castShadow = true;
    group.add(torso);
    
    // Left Arm (cylinder)
    const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const armMaterial = new THREE.MeshToonMaterial({ color: 0xf4a460, gradientMap: gradientMap });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.5, 1, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    
    // Right Arm (cylinder)
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.5, 1, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    
    // Left Leg (cylinder)
    const legGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const legMaterial = new THREE.MeshToonMaterial({ color: 0x1a1a2e, gradientMap: gradientMap });
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.2, 0.2, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    
    // Right Leg (cylinder)
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.2, 0.2, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    
    group.position.set(0, 0, 0);
    scene.add(group);
    player = group;
    player.visible = false; // Hide third-person body in first-person mode
    player.velocity = new THREE.Vector3(0, 0, 0);
}

function createGunModel(type) {
    const gunGroup = new THREE.Group();
    
    if (type === 'AK47') {
        // AK-47: barrel, stock, magazine
        const barrelGeometry = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8);
        const barrelMaterial = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: gradientMap });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = 0.6;
        gunGroup.add(barrel);
        
        // Stock
        const stockGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.8);
        const stockMaterial = new THREE.MeshToonMaterial({ color: 0x8B4513, gradientMap: gradientMap });
        const stock = new THREE.Mesh(stockGeometry, stockMaterial);
        stock.position.x = -0.4;
        gunGroup.add(stock);
        
        // Magazine
        const magGeometry = new THREE.BoxGeometry(0.12, 0.3, 0.4);
        const magMaterial = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: gradientMap });
        const mag = new THREE.Mesh(magGeometry, magMaterial);
        mag.position.set(-0.1, -0.15, 0);
        gunGroup.add(mag);
    } else if (type === 'MP40') {
        // MP40: compact submachine gun
        const barrelGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
        const barrelMaterial = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: gradientMap });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = 0.5;
        gunGroup.add(barrel);
        
        // Receiver
        const receiverGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.6);
        const receiverMaterial = new THREE.MeshToonMaterial({ color: 0x111111, gradientMap: gradientMap });
        const receiver = new THREE.Mesh(receiverGeometry, receiverMaterial);
        gunGroup.add(receiver);
        
        // Stock (short)
        const stockGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.5);
        const stockMaterial = new THREE.MeshToonMaterial({ color: 0x666666, gradientMap: gradientMap });
        const stock = new THREE.Mesh(stockGeometry, stockMaterial);
        stock.position.x = -0.35;
        gunGroup.add(stock);
    } else if (type === 'M10') {
        // M1 Carbine: longer rifle
        const barrelGeometry = new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8);
        const barrelMaterial = new THREE.MeshToonMaterial({ color: 0x333333, gradientMap: gradientMap });
        const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = 0.7;
        gunGroup.add(barrel);
        
        // Wooden stock
        const stockGeometry = new THREE.BoxGeometry(0.13, 0.13, 1);
        const stockMaterial = new THREE.MeshToonMaterial({ color: 0xA0826D, gradientMap: gradientMap });
        const stock = new THREE.Mesh(stockGeometry, stockMaterial);
        stock.position.x = -0.5;
        gunGroup.add(stock);
        
        // Magazine
        const magGeometry = new THREE.BoxGeometry(0.1, 0.25, 0.35);
        const magMaterial = new THREE.MeshToonMaterial({ color: 0x222222, gradientMap: gradientMap });
        const mag = new THREE.Mesh(magGeometry, magMaterial);
        mag.position.set(-0.05, -0.12, 0);
        gunGroup.add(mag);
    }
    
    return gunGroup;
}

function createPeasant(x, z) {
    const group = new THREE.Group();
    
    // Head (smaller than player)
    const headGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMaterial = new THREE.MeshToonMaterial({ color: 0xd4a574, gradientMap: gradientMap });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.2;
    head.castShadow = true;
    group.add(head);
    
    // Torso
    const torsoGeometry = new THREE.BoxGeometry(0.4, 0.8, 0.3);
    const torsoMaterial = new THREE.MeshToonMaterial({ color: 0x8B7355, gradientMap: gradientMap });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.6;
    torso.castShadow = true;
    group.add(torso);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8);
    const armMaterial = new THREE.MeshToonMaterial({ color: 0xd4a574, gradientMap: gradientMap });
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.3, 0.8, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.3, 0.8, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8);
    const legMaterial = new THREE.MeshToonMaterial({ color: 0x4a3728, gradientMap: gradientMap });
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.15, 0.15, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.15, 0.15, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    
    group.position.set(x, 0, z);
    scene.add(group);
    
    // AI state
    group.velocity = new THREE.Vector3(0, 0, 0);
    group.direction = Math.random() * Math.PI * 2;
    group.speed = 0.05;
    group.wanderTimer = 0;
    
    peasants.push(group);
    return group;
}

function createWatchTower(x, z) {
    const group = new THREE.Group();
    
    // Base
    const baseGeometry = new THREE.BoxGeometry(6, 1, 6);
    const baseMaterial = new THREE.MeshToonMaterial({ color: 0x8B4513, gradientMap: gradientMap });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Tower walls - make it taller like a hut but higher
    const wallHeight = 8;
    const wallThickness = 0.2;
    const wallWidth = 4;
    
    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(wallWidth, wallHeight, wallThickness);
    const wallMaterial = new THREE.MeshToonMaterial({ color: 0xA0522D, gradientMap: gradientMap });
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, wallHeight / 2 + 1, -wallWidth / 2 + wallThickness / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);
    
    // Left wall
    const leftWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-wallWidth / 2 + wallThickness / 2, wallHeight / 2 + 1, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(wallWidth / 2 - wallThickness / 2, wallHeight / 2 + 1, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);
    
    // Front wall
    const frontWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    frontWall.position.set(0, wallHeight / 2 + 1, wallWidth / 2 - wallThickness / 2);
    frontWall.castShadow = true;
    frontWall.receiveShadow = true;
    group.add(frontWall);
    
    // Roof plate
    const roofGeometry = new THREE.BoxGeometry(wallWidth + 0.5, wallThickness, wallWidth + 0.5);
    const roofMaterial = new THREE.MeshToonMaterial({ color: 0x6B5D4F, gradientMap: gradientMap });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = wallHeight + 1 + wallThickness / 2;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    
    // Ammo on roof
    const ammoGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const ammoMaterial = new THREE.MeshToonMaterial({ color: 0xFFD700, gradientMap: gradientMap });
    const ammo = new THREE.Mesh(ammoGeometry, ammoMaterial);
    ammo.position.set(0, wallHeight + 1.5, 0);
    ammo.isAmmo = true;
    ammo.ammoAmount = 30; // more ammo on towers
    group.add(ammo);
    
    group.position.set(x, 0, z);
    scene.add(group);
    buildings.push(group);
}

function createOasis(x, z) {
    const group = new THREE.Group();
    
    // Water pool at bottom
    const waterGeometry = new THREE.CylinderGeometry(10, 10, 0.5, 16);
    const waterMaterial = new THREE.MeshToonMaterial({ color: 0x1E90FF, gradientMap: gradientMap });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.y = 0.25;
    group.add(water);
    
    // Grass patches
    for (let i = 0; i < 20; i++) {
        const grassGeometry = new THREE.PlaneGeometry(1, 1);
        const grassMaterial = new THREE.MeshToonMaterial({ color: 0x228B22, gradientMap: gradientMap });
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.position.set((Math.random() - 0.5) * 20, 0.5, (Math.random() - 0.5) * 20);
        grass.rotation.x = -Math.PI / 2;
        group.add(grass);
    }
    
    // Trees
    for (let i = 0; i < 5; i++) {
        const treeGroup = new THREE.Group();
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
        const trunkMaterial = new THREE.MeshToonMaterial({ color: 0x8B4513, gradientMap: gradientMap });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 1.5;
        treeGroup.add(trunk);
        
        const leavesGeometry = new THREE.SphereGeometry(2, 8, 8);
        const leavesMaterial = new THREE.MeshToonMaterial({ color: 0x228B22, gradientMap: gradientMap });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 3.5;
        treeGroup.add(leaves);
        
        treeGroup.position.set((Math.random() - 0.5) * 15, 0, (Math.random() - 0.5) * 15);
        group.add(treeGroup);
    }
    
    // Small hut with basement
    const wallHeight = 2;
    const wallThickness = 0.2;
    const wallWidth = 4;
    const doorWidth = 1;
    const doorHeight = 1.5;
    
    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(wallWidth, wallHeight, wallThickness);
    const wallMaterial = new THREE.MeshToonMaterial({ color: 0xA0826D, gradientMap: gradientMap });
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, wallHeight / 2, -wallWidth / 2 + wallThickness / 2);
    group.add(backWall);
    
    // Left wall
    const leftWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-wallWidth / 2 + wallThickness / 2, wallHeight / 2, 0);
    group.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(wallWidth / 2 - wallThickness / 2, wallHeight / 2, 0);
    group.add(rightWall);
    
    // Front wall with door opening (two plates: above door and sides)
    // Above door
    const aboveDoorGeometry = new THREE.BoxGeometry(wallWidth, wallHeight - doorHeight, wallThickness);
    const aboveDoor = new THREE.Mesh(aboveDoorGeometry, wallMaterial);
    aboveDoor.position.set(0, wallHeight - (wallHeight - doorHeight) / 2, wallWidth / 2 - wallThickness / 2);
    group.add(aboveDoor);
    
    // Left side of door
    const sideDoorGeometry = new THREE.BoxGeometry((wallWidth - doorWidth) / 2, doorHeight, wallThickness);
    const leftDoorSide = new THREE.Mesh(sideDoorGeometry, wallMaterial);
    leftDoorSide.position.set(-doorWidth / 2 - (wallWidth - doorWidth) / 4, doorHeight / 2, wallWidth / 2 - wallThickness / 2);
    group.add(leftDoorSide);
    
    // Right side of door
    const rightDoorSide = new THREE.Mesh(sideDoorGeometry, wallMaterial);
    rightDoorSide.position.set(doorWidth / 2 + (wallWidth - doorWidth) / 4, doorHeight / 2, wallWidth / 2 - wallThickness / 2);
    group.add(rightDoorSide);
    
    // Roof plate
    const roofGeometry = new THREE.BoxGeometry(wallWidth + 0.5, wallThickness, wallWidth + 0.5);
    const roofMaterial = new THREE.MeshToonMaterial({ color: 0x6B5D4F, gradientMap: gradientMap });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = wallHeight + wallThickness / 2;
    group.add(roof);
    
    // Basement
    const basementGeometry = new THREE.BoxGeometry(5, 3, 5);
    const basementMaterial = new THREE.MeshToonMaterial({ color: 0x654321, gradientMap: gradientMap });
    const basement = new THREE.Mesh(basementGeometry, basementMaterial);
    basement.position.y = -1.5;
    group.add(basement);
    
    group.position.set(x, 0, z);
    scene.add(group);
    buildings.push(group);
}

function updatePlayer() {
    // Sand storm effects
    if (weather === 'sandstorm') {
        // Occasional fling
        if (Math.random() < 0.02) { // 2% chance per frame
            playerVerticalVelocity += Math.random() * 0.8 + 0.3; // fling up
            const flingAngle = Math.random() * Math.PI * 2;
            const flingDistance = Math.random() * 5 + 2;
            player.position.x += Math.cos(flingAngle) * flingDistance;
            player.position.z += Math.sin(flingAngle) * flingDistance;
        }
        // Health damage from storm
        if (Math.random() < 0.001) { // rare damage
            health -= 5;
            if (health <= 0) {
                gameRunning = false;
                document.getElementById('gameOver').style.display = 'block';
            }
        }
    }
    
    // Camera-relative movement: use camera forward projected onto XZ plane
    moveDirection.set(0, 0, 0);

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir); // world-space forward
    camDir.y = 0;
    camDir.normalize();
    const forward = camDir;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    if (keys['w'] || keys['arrowup']) moveDirection.add(forward);
    if (keys['s'] || keys['arrowdown']) moveDirection.sub(forward);
    if (keys['a'] || keys['arrowleft']) moveDirection.sub(right);
    if (keys['d'] || keys['arrowright']) moveDirection.add(right);


    if (moveDirection.length() > 0) {
        moveDirection.normalize();
        const newPos = player.position.clone().add(moveDirection.clone().multiplyScalar(playerSpeed));
        // Infinite world - no border constraint
        player.position.x = newPos.x;
        player.position.z = newPos.z;
        hunger -= 0.01;
    }

    // Gravity and jumping
    playerVerticalVelocity += GRAVITY;
    player.position.y += playerVerticalVelocity;
    if (player.position.y <= 0) {
        player.position.y = 0;
        playerVerticalVelocity = 0;
        isOnGround = true;
        jumpCount = 0;
    } else {
        isOnGround = false;
    }

    // Rotate player to face movement/camera direction (so character looks where camera drag points)
    if (forward.lengthSq() > 0.0001) {
        player.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI;
    }

    // Decay health and hunger
    hunger -= 0.005;
    if (hunger <= 0) health -= 0.5;
    
    // First-person camera matched to player position + headset height
    camera.position.set(player.position.x, player.position.y + 1.6, player.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0;

    // Gun model now follows camera directly (child of camera), no explicit lookAt needed
    // (if there is still an old gunModel from third-person attach, it will remain camera-locked)

    
    // Update world chunks
    updateWorldChunks();
    
    // Check collection
    resources = resources.filter((resource) => {
        if (!resource.collected && player.position.distanceTo(resource.position) < 2) {
            resource.collected = true;
            scene.remove(resource);
            resourcesCollected++;
            hunger = Math.min(100, hunger + 15);
            return false;
        }
        return true;
    });
    
    // Check building items
    buildings.forEach((building) => {
        building.children.forEach((item, index) => {
            if (item.isAmmo && player.position.distanceTo(item.getWorldPosition(new THREE.Vector3())) < 2) {
                ammo += item.ammoAmount;
                building.remove(item);
                item.isAmmo = false;
            }
            if (item.isGun && player.position.distanceTo(item.getWorldPosition(new THREE.Vector3())) < 2) {
                hasGun = true;
                gunType = item.gunType || 'AK47'; // default to AK47
                ammo = GUN_TYPES[gunType].ammo; // reset ammo for new gun
                
                // Remove old gun model if exists
                if (gunModel && gunModel.parent) {
                    gunModel.parent.remove(gunModel);
                }
                
                // Create and attach new gun model
                gunModel = createGunModel(gunType);
                gunModel.position.set(0.3, -0.2, -0.5); // camera-relative position in first-person view
                gunModel.scale.set(0.8, 0.8, 0.8);
                camera.add(gunModel);
                
                building.remove(item);
                item.isGun = false;
            }
        });
    });
    
    treasures = treasures.filter((treasure) => {
        if (player.position.distanceTo(treasure.position) < 2) {
            treasureFound++;
            scene.remove(treasure);
            document.getElementById('treasure-found').style.display = 'block';
            gameRunning = false;
            return false;
        }
        return true;
    });
    
    // Enemy collision
    enemies = enemies.filter((enemy) => {
        if (player.position.distanceTo(enemy.position) < 1.5) {
            health -= 0.2;
        }
        
        // Enemy animation - swing arms and walk
        const children = enemy.children;
        if (children.length > 3) {
            // Swing arms
            const leftArm = children[2];
            const rightArm = children[3];
            if (leftArm) leftArm.rotation.z = Math.sin(Date.now() * 0.005) * 0.4;
            if (rightArm) rightArm.rotation.z = Math.sin(Date.now() * 0.005 + Math.PI) * 0.4;
        }
        
        return true;
    });
    
    // Death check
    if (health <= 0) {
        endGame();
    }
    
    updateHUD();
}

const SAVE_KEY = 'dried_lands_save_v1';

function updateHUD() {
    const healthPercent = Math.max(0, health);
    const hungerPercent = Math.max(0, hunger);
    
    document.getElementById('healthBar').style.width = healthPercent + '%';
    document.getElementById('hungerBar').style.width = hungerPercent + '%';
    document.getElementById('treasureCount').textContent = treasureFound;
    document.getElementById('resourceCount').textContent = resourcesCollected;
    document.getElementById('ammoCount').textContent = ammo;
    document.getElementById('gunStatus').textContent = hasGun ? `✓ ${GUN_TYPES[gunType].name}` : "✗ No Gun";
    document.getElementById('weatherStatus').textContent = weather === 'sandstorm' ? 'Sand Storm' : 'Clear';
}

function saveGame() {
    try {
        const saveData = {
            player: {
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
            },
            yaw,
            pitch,
            health,
            hunger,
            resourcesCollected,
            treasureFound,
            ammo,
            hasGun,
            gunType,
            gameRunning,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        console.log('Game saved successfully');
    } catch (err) {
        console.warn('Unable to save game data:', err);
    }
}

function loadGame() {
    try {
        const data = localStorage.getItem(SAVE_KEY);
        if (!data) return false;
        const saved = JSON.parse(data);
        if (!saved) return false;

        player.position.set(saved.player.x, saved.player.y, saved.player.z);
        yaw = saved.yaw || 0;
        pitch = saved.pitch || 0;
        health = saved.health ?? 100;
        hunger = saved.hunger ?? 100;
        resourcesCollected = saved.resourcesCollected ?? 0;
        treasureFound = saved.treasureFound ?? 0;
        ammo = saved.ammo ?? 30;
        hasGun = saved.hasGun ?? false;
        gunType = saved.gunType || null;
        gameRunning = saved.gameRunning !== undefined ? saved.gameRunning : true;

        if (gunModel && gunModel.parent) gunModel.parent.remove(gunModel);
        gunModel = null;

        if (hasGun && gunType) {
            gunModel = createGunModel(gunType);
            gunModel.position.set(0.3, -0.2, -0.5);
            gunModel.scale.set(0.8, 0.8, 0.8);
            camera.add(gunModel);
        }

        updateHUD();
        console.log('Game loaded from save');
        return true;
    } catch (err) {
        console.warn('Unable to load saved game:', err);
        return false;
    }
}

function clearSaveData() {
    localStorage.removeItem(SAVE_KEY);
    console.log('Save data cleared');
}

function fireGun() {
    if (!gameRunning || !hasGun || ammo <= 0) return;
    
    const now = Date.now();
    const fireRate = GUN_TYPES[gunType]?.fireRate || FIRE_RATE;
    if (now - lastShotTime < fireRate) return;
    
    lastShotTime = now;
    ammo--;
    
    // Create bullet from player position
    const bulletGeometry = new THREE.SphereGeometry(0.1, 4, 4);
    const bulletMaterial = new THREE.MeshToonMaterial({ color: 0xFFFF00, gradientMap: gradientMap });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.copy(player.position);
    bullet.position.y += 1;
        updateBullets();
    
    // Calculate direction from camera
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    direction.normalize();
    
    bullet.velocity = direction.clone().multiplyScalar(0.5);
    bullet.lifetime = 0;
    
    scene.add(bullet);
    bullets.push(bullet);
    
    // Draw yellow line showing bullet direction
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [
        bullet.position.clone(),
        bullet.position.clone().add(direction.clone().multiplyScalar(100))
    ];
    lineGeometry.setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xFFFF00, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);
    
    // Remove line after 200ms for visual feedback
    setTimeout(() => scene.remove(line), 200);
    
    updateHUD();
}

function updateBullets() {
    bullets = bullets.filter((bullet) => {
        bullet.position.add(bullet.velocity);
        bullet.lifetime += 1;
        
        // Remove bullets that are too old
        if (bullet.lifetime > 500) {
            scene.remove(bullet);
            return false;
        }
        
        // Check collision with enemies
        enemies = enemies.filter((enemy) => {
            if (bullet.position.distanceTo(enemy.position) < 1) {
                scene.remove(bullet);
                enemy.health -= GUN_TYPES[gunType]?.damage || 1;
                
                if (enemy.health <= 0) {
                    scene.remove(enemy);
                    ammo += 2; // Get ammo from killing enemies
                    updateHUD();
                    return false;
                } else {
                    // Update health bar
                    if (enemy.healthBar) {
                        enemy.healthBar.scale.x = Math.max(0, enemy.health / enemy.maxHealth);
                    }
                    return true;
                }
            }
            return true;
        });
        
        // Check collision with peasants
        peasants = peasants.filter((peasant) => {
            if (bullet.position.distanceTo(peasant.position) < 0.8) {
                scene.remove(bullet);
                scene.remove(peasant);
                return false;
            }
            return true;
        });
        
        // Check world boundaries (expanded for infinite world)
        if (bullet.position.length() > 1000) {
            scene.remove(bullet);
            return false;
        }
        
        return true;
    });
}

function endGame() {
    gameRunning = false;
    document.getElementById('finalHealth').textContent = Math.round(health);
    document.getElementById('finalResources').textContent = resourcesCollected;
    document.getElementById('gameOver').style.display = 'block';
}

function updatePeasants() {
    peasants.forEach((peasant) => {
        // Wander behavior
        peasant.wanderTimer--;
        if (peasant.wanderTimer <= 0) {
            peasant.direction += (Math.random() - 0.5) * 0.5;
            peasant.wanderTimer = Math.floor(Math.random() * 100) + 50;
        }
        
        // Move based on wandering direction
        peasant.position.x += Math.sin(peasant.direction) * peasant.speed;
        peasant.position.z += Math.cos(peasant.direction) * peasant.speed;
        
        // Rotate torso to face direction
        peasant.rotation.y = peasant.direction;
        
        // Animate walking legs
        if (peasant.children.length > 4) {
            const leftLeg = peasant.children[3];
            const rightLeg = peasant.children[4];
            const walkCycle = (Date.now() * 0.003) % (2 * Math.PI);
            if (leftLeg) leftLeg.rotation.z = Math.sin(walkCycle) * 0.3;
            if (rightLeg) rightLeg.rotation.z = Math.sin(walkCycle + Math.PI) * 0.3;
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    // Update game time for day-night cycle
    const now = Date.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    gameTime += delta / 60; // convert to minutes
    
    // Weather cycle every game day (20 minutes)
    weatherTimer += delta;
    if (weatherTimer > 1200) { // 20 minutes = 1 game day
        weatherTimer = 0;
        if (Math.random() < 0.857) { // 6/7 ≈ 85.7% chance for sand storm
            weather = 'sandstorm';
            stormDuration = Math.random() * 60 + 120; // 2-3 minutes in seconds
            scene.fog = new THREE.Fog(0xD2B48C, 20, 100); // sandy fog
        } else {
            weather = 'clear';
            scene.fog = new THREE.Fog(isDay ? 0x87CEEB : 0x000033, isDay ? 200 : 100, isDay ? 400 : 300);
        }
    }
    
    const cycle = gameTime % 20; // 20-minute cycle: 10 day, 10 night
    const dayTime = cycle < 10;
    
    if (dayTime !== isDay) {
        isDay = dayTime;
        if (isDay) {
            // Day: bright sky and lights
            scene.background = new THREE.Color(0x87CEEB);
            scene.fog = new THREE.Fog(0x87CEEB, 200, 400);
            ambientLight.intensity = 0.7;
            directionalLight.intensity = 1;
            sun.visible = true;
        } else {
            // Night: dark sky and dim lights
            scene.background = new THREE.Color(0x000033);
            scene.fog = new THREE.Fog(0x000033, 100, 300);
            ambientLight.intensity = 0.2;
            directionalLight.intensity = 0.3;
            sun.visible = false;
        }
    }
    
    if (isDay) {
        // Move sun across the sky
        const sunAngle = (cycle / 10) * Math.PI; // 0 to π
        sun.position.set(Math.sin(sunAngle) * 300, Math.cos(sunAngle) * 300 + 50, 0);
        directionalLight.position.copy(sun.position).normalize().multiplyScalar(100);
    }
    
    // Storm duration countdown
    if (weather === 'sandstorm') {
        stormDuration -= delta;
        if (stormDuration <= 0) {
            weather = 'clear';
            scene.fog = new THREE.Fog(isDay ? 0x87CEEB : 0x000033, isDay ? 200 : 100, isDay ? 400 : 300);
        }
    }
    
    if (gameRunning) {
        updatePlayer();
        updatePeasants();
    }
    
    renderer.render(scene, camera);
}

// Start the game
init();
