// ===================== 3D 光影坐标球组件 =====================
// 基于 Three.js 实现可交互的 3D 球体光源选择器

class LightingBall3D {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.positions = options.positions || [];
    this.selectedId = options.selectedId || null;
    this.onSelect = options.onSelect || (() => {});
    this.isRim = options.isRim || false;
    this.isRotating = false;
    this.prevMouse = { x: 0, y: 0 };
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.group = null;
    this.sphereMesh = null;
    this.selectedMesh = null;
    this.lightMeshes = [];
    this.raycaster = null;
    this.mouse = null;
    this.animFrame = null;
    this.initialized = false;
    
    // Wait for container to be visible
    this._waitForContainer();
  }

  _waitForContainer() {
    const el = this.container;
    if (!el) {
      console.error('[LightingBall3D] Container not found:', this.containerId);
      return;
    }
    
    const tryInit = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0 && !this.initialized) {
        this._init();
        this.initialized = true;
      }
    };
    
    // Try immediately
    tryInit();
    
    // Also observe changes
    if (!this.initialized) {
      const ro = new ResizeObserver(tryInit);
      ro.observe(el);
    }
  }

  _init() {
    if (!this.container) return;

    const el = this.container;
    const W = el.clientWidth || 200;
    const H = el.clientHeight || (this.isRim ? 140 : 200);

    // Initialize raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    this.camera.position.set(0, 0.3, 3.5);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a1a2e, 1); // 深蓝灰色背景
    el.appendChild(this.renderer.domElement);

    // Lights - 增加光照强度让球体更明显
    const ambient = new THREE.AmbientLight(0x8899aa, 0.8);
    this.scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 2, 30);
    point.position.set(3, 3, 5);
    this.scene.add(point);
    // 添加另一个补光
    const fillLight = new THREE.PointLight(0x6677aa, 1, 20);
    fillLight.position.set(-2, 1, 3);
    this.scene.add(fillLight);

    // Main group (rotates with mouse drag)
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Sphere - 增加不透明度让球体更明显可见
    const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
    const sphereMat = new THREE.MeshPhongMaterial({
      color: 0x4a5a7a,
      emissive: 0x2a3a5a,
      specular: 0x8899bb,
      shininess: 60,
      transparent: true,
      opacity: this.isRim ? 0.85 : 0.6, // 增加不透明度
      side: this.isRim ? THREE.BackSide : THREE.FrontSide,
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.group.add(this.sphereMesh);

    // Wireframe on top - 更亮的网格
    const wireGeo = new THREE.SphereGeometry(1.002, 32, 32);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x7a9ab0,
      wireframe: true,
      transparent: true,
      opacity: this.isRim ? 0.4 : 0.5, // 增加透明度
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.name = 'wire';
    this.group.add(wireMesh);

    // Equator ring
    const ringGeo = new THREE.RingGeometry(0.99, 1.01, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6677aa, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'equator';
    this.group.add(ring);

    // Front indicator dot - 更亮的前方指示器
    const dotGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x88aacc });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(0, 0, 1.05);
    dot.name = 'frontDot';
    this.group.add(dot);

    // Create light position dots
    this._createLightDots();

    // Selected indicator (golden sphere)
    const selGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const selMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.selectedMesh = new THREE.Mesh(selGeo, selMat);
    this.selectedMesh.visible = false;
    this.group.add(this.selectedMesh);

    // Initial rotation for rim (tilt so back is visible)
    if (this.isRim) {
      this.group.rotation.x = -Math.PI * 0.35;
    }

    // Events
    this._bindEvents(W, H);

    // Render loop
    this._animate();

    // Mark selected
    this._updateSelection();
  }

  _createLightDots() {
    // Clear existing
    this.lightMeshes.forEach(m => this.group.remove(m));
    this.lightMeshes = [];

    this.positions.forEach(pos => {
      const { x, y, z, id, visible } = pos;
      const geo = new THREE.SphereGeometry(0.07, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        color: visible === false ? 0x556677 : 0xffffff,
        emissive: visible === false ? 0x334455 : 0x6699bb,
        specular: 0xffffff,
        shininess: 100,
        transparent: visible === false,
        opacity: visible === false ? 0.5 : 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.userData = { id, originalColor: mat.color.getHex(), originalEmissive: mat.emissive.getHex(), originalOpacity: mat.opacity, faded: visible === false };
      mesh.name = 'lightDot';
      this.group.add(mesh);
      this.lightMeshes.push(mesh);
    });
  }

  _bindEvents(W, H) {
    const canvas = this.renderer.domElement;

    // Mouse drag to rotate
    canvas.addEventListener('mousedown', e => {
      this.isRotating = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mousemove', e => {
      if (!this.isRotating) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.group.rotation.y += dx * 0.008;
      this.group.rotation.x += dy * 0.008;
      // Clamp X rotation
      if (!this.isRim) {
        this.group.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.group.rotation.x));
      }
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mouseup', () => {
      this.isRotating = false;
    });

    // Click to select
    canvas.addEventListener('click', e => {
      if (this.isRotating) return;
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.lightMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData.faded) return; // Don't select faded (back) positions
        this.selectedId = hit.userData.id;
        this._updateSelection();
        this.onSelect(hit.userData.id, this.positions.find(p => p.id === this.selectedId));
      }
    });

    // Touch support
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this.isRotating = true;
      this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!this.isRotating) return;
      const dx = e.touches[0].clientX - this.prevMouse.x;
      const dy = e.touches[0].clientY - this.prevMouse.y;
      this.group.rotation.y += dx * 0.008;
      this.group.rotation.x += dy * 0.008;
      this.prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (!this.isRotating) return;
      this.isRotating = false;
      // Tap to select (last touch point)
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.lightMeshes);
        if (intersects.length > 0) {
          const hit = intersects[0].object;
          if (!hit.userData.faded) {
            this.selectedId = hit.userData.id;
            this._updateSelection();
            this.onSelect(hit.userData.id, this.positions.find(p => p.id === this.selectedId));
          }
        }
      }
    }, { passive: false });

    // Resize
    const ro = new ResizeObserver(() => {
      const w = this.container.clientWidth || 200;
      const h = this.container.clientHeight || (this.isRim ? 140 : 200);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    ro.observe(this.container);
  }

  _updateSelection() {
    // Hide selected indicator by default
    this.selectedMesh.visible = false;

    // Reset all dots
    this.lightMeshes.forEach(mesh => {
      const ud = mesh.userData;
      if (ud.faded) {
        mesh.material.color.setHex(0x556677);
        mesh.material.emissive.setHex(0x334455);
        mesh.material.opacity = 0.5;
      } else {
        mesh.material.color.setHex(0xffffff);
        mesh.material.emissive.setHex(0x6699bb);
        mesh.material.opacity = 1;
      }
    });

    if (!this.selectedId) return;

    // Highlight selected
    const selectedMesh = this.lightMeshes.find(m => m.userData.id === this.selectedId);
    if (selectedMesh) {
      selectedMesh.material.color.setHex(0xffd700);
      selectedMesh.material.emissive.setHex(0xffaa00);
      selectedMesh.material.opacity = 1;
      this.selectedMesh.position.copy(selectedMesh.position);
      this.selectedMesh.visible = true;
    }
  }

  setSelected(id) {
    this.selectedId = id;
    this._updateSelection();
  }

  setPositions(positions) {
    this.positions = positions;
    this._createLightDots();
    this._updateSelection();
  }

  _animate() {
    this.animFrame = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}

// ===================== 3D 坐标球管理器 =====================
window.LightingBallManager = {
  instances: {},

  create(containerId, options) {
    if (this.instances[containerId]) {
      this.instances[containerId].destroy();
    }
    this.instances[containerId] = new LightingBall3D(containerId, options);
    return this.instances[containerId];
  },

  get(containerId) {
    return this.instances[containerId];
  },

  destroy(containerId) {
    if (this.instances[containerId]) {
      this.instances[containerId].destroy();
      delete this.instances[containerId];
    }
  },

  destroyAll() {
    Object.keys(this.instances).forEach(k => this.destroy(k));
  }
};
