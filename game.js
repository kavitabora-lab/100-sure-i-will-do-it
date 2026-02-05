// Dried Lands - Desert Survival Game with Infinite World

let scene, camera, renderer;
let player = null;
let resources = [];
let treasures = [];
let buildings = [];
let bullets = [];
let terrainChunks = new Map();
let terrainObjects = [];

let health = 100;
let hunger = 100;
let resourcesCollected = 0;
let treasureFound = 0;
let ammo = 30;

let gameRunning = true;
let playerSpeed = 0.3;
let moveDirection = new THREE.Vector3(0, 0, 0);
let hasGun = false;
let lastShotTime = 0;

const keys = {};
const CHUNK_SIZE = 50;
const WORLD_BORDER = 250; // Max distance from origin
const RENDER_DISTANCE = 3; // Chunks to render around player
const ENEMY_SPAWN_CHANCE = 0.08;
const RESOURCE_SPAWN_CHANCE = 0.15;
const BUILDING_SPAWN_CHANCE = 0.05;
const FIRE_RATE = 100; // milliseconds between shots

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc2a26d);
    scene.fog = new THREE.Fog(0xc2a26d, 200, 400);
    
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
    
    // Create player
    createPlayer();
    
    // Spawn initial world
    updateWorldChunks();
    
    // Event listeners
    document.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });
    
    document.addEventListener('click', fireGun);
    
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
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0xd4a574 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    ground.receiveShadow = true;
    group.add(ground);
    
    // Generate terrain features based on chunk position
    const seed = chunkX * 73856093 ^ chunkZ * 19349663;
    
    // Hills/obstacles
    const hillCount = Math.floor(seededRandom(seed) * 5);
    for (let i = 0; i < hillCount; i++) {
        const hillSeed = seed + i * 12345;
        const localX = seededRandom(hillSeed) * CHUNK_SIZE;
        const localZ = seededRandom(hillSeed + 1) * CHUNK_SIZE;
        const size = seededRandom(hillSeed + 2) * 3 + 2;
        const height = seededRandom(hillSeed + 3) * 4 + 2;
        
        const hillGeometry = new THREE.ConeGeometry(size, height, 16);
        const hillMaterial = new THREE.MeshLambertMaterial({ color: 0xa0826d });
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
            const material = new THREE.MeshStandardMaterial({ color: 0x90ee90 });
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
            const enemyHeadMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
            const enemyHead = new THREE.Mesh(enemyHeadGeometry, enemyHeadMaterial);
            enemyHead.position.y = 1.5;
            enemyHead.castShadow = true;
            enemyGroup.add(enemyHead);
            
            // Enemy Torso
            const enemyTorsoGeometry = new THREE.BoxGeometry(0.6, 1, 0.4);
            const enemyTorsoMaterial = new THREE.MeshStandardMaterial({ color: 0x440000 });
            const enemyTorso = new THREE.Mesh(enemyTorsoGeometry, enemyTorsoMaterial);
            enemyTorso.position.y = 0.8;
            enemyTorso.castShadow = true;
            enemyGroup.add(enemyTorso);
            
            // Enemy Arms
            const enemyArmGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
            const enemyArmMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
            
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
            const enemyLegMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
            
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
            
            enemyGroup.health = 50;
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
        const material = new THREE.MeshStandardMaterial({
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
    
    // Buildings
    const buildingCount = Math.floor(seededRandom(seed + 400) * 3);
    for (let i = 0; i < buildingCount; i++) {
        if (seededRandom(seed + 400 + i) < BUILDING_SPAWN_CHANCE) {
            const buildingSeed = seed + 400 + i;
            const localX = seededRandom(buildingSeed) * CHUNK_SIZE;
            const localZ = seededRandom(buildingSeed + 1) * CHUNK_SIZE;
            
            const buildingGroup = new THREE.Group();
            
            // Building walls
            const buildingWidth = seededRandom(buildingSeed + 2) * 3 + 4;
            const buildingHeight = seededRandom(buildingSeed + 3) * 2 + 3;
            
            const wallGeometry = new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingWidth);
            const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x8B7355 });
            const walls = new THREE.Mesh(wallGeometry, wallMaterial);
            walls.position.y = buildingHeight / 2;
            walls.castShadow = true;
            walls.receiveShadow = true;
            buildingGroup.add(walls);
            
            // Roof
            const roofGeometry = new THREE.ConeGeometry(buildingWidth * 0.7, buildingHeight * 0.5, 4);
            const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
            const roof = new THREE.Mesh(roofGeometry, roofMaterial);
            roof.position.y = buildingHeight + buildingHeight * 0.25;
            roof.castShadow = true;
            buildingGroup.add(roof);
            
            // Door
            const doorGeometry = new THREE.BoxGeometry(0.8, 1.5, 0.2);
            const doorMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
            const door = new THREE.Mesh(doorGeometry, doorMaterial);
            door.position.set(0, 0.8, buildingWidth / 2 + 0.1);
            buildingGroup.add(door);
            
            // Ammo box inside building
            if (seededRandom(buildingSeed + 4) < 0.6) {
                const ammoGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
                const ammoMaterial = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
                const ammoBox = new THREE.Mesh(ammoGeometry, ammoMaterial);
                ammoBox.position.y = 0.5;
                ammoBox.isAmmo = true;
                ammoBox.ammoAmount = 20;
                buildingGroup.add(ammoBox);
            }
            
            // Gun box inside building
            if (seededRandom(buildingSeed + 5) < 0.3) {
                const gunGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.3);
                const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
                const gunBox = new THREE.Mesh(gunGeometry, gunMaterial);
                gunBox.position.y = 0.5;
                gunBox.position.z = -1;
                gunBox.isGun = true;
                buildingGroup.add(gunBox);
            }
            
            buildingGroup.position.set(
                chunkX * CHUNK_SIZE + localX,
                0,
                chunkZ * CHUNK_SIZE + localZ
            );
            
            group.add(buildingGroup);
            buildings.push(buildingGroup);
        }
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
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf4a460 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);
    
    // Torso (rectangular box)
    const torsoGeometry = new THREE.BoxGeometry(0.6, 1, 0.4);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0xff6b4a });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 0.8;
    torso.castShadow = true;
    group.add(torso);
    
    // Left Arm (cylinder)
    const armGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0xf4a460 });
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
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
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
    player.velocity = new THREE.Vector3(0, 0, 0);
}

function updatePlayer() {
    moveDirection.set(0, 0, 0);
    
    if (keys['w'] || keys['arrowup']) moveDirection.z -= 1;
    if (keys['s'] || keys['arrowdown']) moveDirection.z += 1;
    if (keys['a'] || keys['arrowleft']) moveDirection.x -= 1;
    if (keys['d'] || keys['arrowright']) moveDirection.x += 1;
    
    if (moveDirection.length() > 0) {
        moveDirection.normalize();
        const newPos = player.position.clone().add(moveDirection.clone().multiplyScalar(playerSpeed));
        
        // World border constraint
        const distance = Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z);
        if (distance <= WORLD_BORDER) {
            player.position.copy(newPos);
        }
        
        hunger -= 0.01;
    }
    
    // Decay health and hunger
    hunger -= 0.005;
    if (hunger <= 0) health -= 0.5;
    
    // Camera follow player
    camera.position.x = player.position.x;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position.x, 1, player.position.z);
    
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

function updateHUD() {
    const healthPercent = Math.max(0, health);
    const hungerPercent = Math.max(0, hunger);
    
    document.getElementById('healthBar').style.width = healthPercent + '%';
    document.getElementById('hungerBar').style.width = hungerPercent + '%';
    document.getElementById('treasureCount').textContent = treasureFound;
    document.getElementById('resourceCount').textContent = resourcesCollected;
    document.getElementById('ammoCount').textContent = ammo;
    document.getElementById('gunStatus').textContent = hasGun ? "✓ Equipped" : "✗ No Gun";
}

function fireGun() {
    if (!gameRunning || !hasGun || ammo <= 0) return;
    
    const now = Date.now();
    if (now - lastShotTime < FIRE_RATE) return;
    
    lastShotTime = now;
    ammo--;
    
    // Create bullet from player position
    const bulletGeometry = new THREE.SphereGeometry(0.1, 4, 4);
    const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFF00 });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.copy(player.position);
    bullet.position.y += 1;
        updateBullets();
    
    // Calculate direction from camera
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    direction.normalize();
    
    bullet.velocity = direction.multiplyScalar(1);
    bullet.lifetime = 0;
    
    scene.add(bullet);
    bullets.push(bullet);
    
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
                scene.remove(enemy);
                ammo += 2; // Get ammo from killing enemies
                updateHUD();
                return false;
            }
            return true;
        });
        
        // Check world boundaries
        if (bullet.position.length() > WORLD_BORDER) {
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

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (gameRunning) {
        updatePlayer();
    }
    
    renderer.render(scene, camera);
}

// Start the game
init();
