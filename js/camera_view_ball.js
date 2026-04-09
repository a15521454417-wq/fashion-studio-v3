// ===================== 相机视角 3D 坐标球组件 =====================
// 用于多角度生成时的相机视角控制

class CameraViewBall {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.pitch = options.pitch || 0;      // 俯仰角 -90 ~ 90
    this.yaw = options.yaw || 0;           // 偏航角 -180 ~ 180
    this.fov = options.fov || 50;          // 视野角/焦距
    this.onChange = options.onChange || (() => {});
    this.isRotating = false;
    this.prevMouse = { x: 0, y: 0 };
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.group = null;
    this.cameraIndicator = null;
    this.raycaster = null;
    this.mouse = null;
    this.animFrame = null;
    this.initialized = false;

    this._waitForContainer();
  }

  _waitForContainer() {
    const el = this.container;
    if (!el) {
      console.error('[CameraViewBall] Container not found:', this.containerId);
      return;
    }

    console.log('[CameraViewBall] Container found, size:', el.clientWidth, 'x', el.clientHeight);

    const tryInit = () => {
      console.log('[CameraViewBall] tryInit called, size:', el.clientWidth, 'x', el.clientHeight, 'initialized:', this.initialized);
      if (el.clientWidth > 0 && el.clientHeight > 0 && !this.initialized) {
        console.log('[CameraViewBall] Initializing...');
        this._init();
        this.initialized = true;
        console.log('[CameraViewBall] Initialized successfully');
      }
    };

    tryInit();

    if (!this.initialized) {
      console.log('[CameraViewBall] Scheduling ResizeObserver');
      const ro = new ResizeObserver(tryInit);
      ro.observe(el);
    }
  }

  _init() {
    if (!this.container) {
      console.error('[CameraViewBall._init] Container is null');
      return;
    }

    const el = this.container;
    const W = el.clientWidth || 180;
    const H = el.clientHeight || 180;

    console.log('[CameraViewBall._init] Starting, size:', W, 'x', H);
    console.log('[CameraViewBall._init] THREE defined:', typeof THREE !== 'undefined');

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    this.camera.position.set(0, 0, 3.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1a2030, 1);
    el.appendChild(this.renderer.domElement);

    // 添加光照
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 1, 20);
    point.position.set(2, 2, 3);
    this.scene.add(point);

    // 主组
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 中心球体（被摄物体）
    const centerGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const centerMat = new THREE.MeshPhongMaterial({
      color: 0x4466aa,
      emissive: 0x223355,
      specular: 0x6688bb,
      shininess: 60
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.name = 'center';
    this.group.add(centerMesh);

    // 相机指示器（带箭头的立方体）
    this._createCameraIndicator();

    // 球形网格
    const sphereGeo = new THREE.SphereGeometry(0.9, 24, 24);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x445566,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const wireMesh = new THREE.Mesh(sphereGeo, wireMat);
    wireMesh.name = 'wire';
    this.group.add(wireMesh);

    // 经纬线
    this._createLatitudeLines();
    this._createLongitudeLines();

    // 方向标签
    this._createLabels();

    // 相机目标点连线
    this._createCameraLine();

    this._bindEvents(W, H);
    this._updateCameraIndicator();
    this._animate();
  }

  _createCameraIndicator() {
    // 相机图标 - 用一个带方向的锥体表示
    const group = new THREE.Group();

    // 主体
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.08, 0.16);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0xff6644,
      emissive: 0x883322,
      specular: 0xffaa88,
      shininess: 80
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // 镜头
    const lensGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8);
    const lensMat = new THREE.MeshPhongMaterial({
      color: 0x222233,
      emissive: 0x111122,
      specular: 0x666688,
      shininess: 100
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.1;
    group.add(lens);

    // 取景框
    const frameGeo = new THREE.TorusGeometry(0.06, 0.01, 4, 4);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xff6644 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = 0.08;
    frame.rotation.x = Math.PI / 2;
    group.add(frame);

    group.name = 'camera';
    this.cameraIndicator = group;
    this.group.add(group);
  }

  _createLatitudeLines() {
    // 纬度线（水平圆环）
    const latitudes = [-60, -30, 0, 30, 60];
    latitudes.forEach(lat => {
      const radius = Math.cos(lat * Math.PI / 180) * 0.95;
      const geo = lat === 0
        ? new THREE.RingGeometry(radius - 0.005, radius + 0.005, 64)
        : new THREE.RingGeometry(radius - 0.003, radius + 0.003, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: lat === 0 ? 0x556677 : 0x334455,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: lat === 0 ? 0.5 : 0.3
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = Math.sin(lat * Math.PI / 180) * 0.95;
      ring.name = 'lat';
      this.group.add(ring);
    });
  }

  _createLongitudeLines() {
    // 经度线（垂直椭圆）
    const longitudes = [0, 45, 90, 135];
    longitudes.forEach((lon, i) => {
      const curve = new THREE.EllipseCurve(0, 0, 0.95, 0.95, 0, Math.PI, false, 0);
      const points = curve.getPoints(50);
      const geo = new THREE.BufferGeometry().setFromPoints(
        points.map(p => new THREE.Vector3(p.x, p.y, 0))
      );
      const mat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x667788 : 0x334455,
        transparent: true,
        opacity: i === 0 ? 0.5 : 0.3
      });
      const line = new THREE.Line(geo, mat);
      line.rotation.y = lon * Math.PI / 180;
      line.name = 'lon';
      this.group.add(line);
    });
  }

  _createLabels() {
    // 用小圆点标记主要方向
    const positions = [
      { label: 'F', pos: [0, 0, 1], color: 0xff6644 },    // 前
      { label: 'B', pos: [0, 0, -1], color: 0x667788 },   // 后
      { label: 'L', pos: [-1, 0, 0], color: 0x667788 },  // 左
      { label: 'R', pos: [1, 0, 0], color: 0x667788 },    // 右
      { label: 'T', pos: [0, 1, 0], color: 0x667788 },    // 上
      { label: 'U', pos: [0, -1, 0], color: 0x667788 },   // 下
    ];

    positions.forEach(p => {
      const geo = new THREE.SphereGeometry(0.03, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: p.color });
      const dot = new THREE.Mesh(geo, mat);
      dot.position.set(p.pos[0] * 1.05, p.pos[1] * 1.05, p.pos[2] * 1.05);
      dot.name = 'dir';
      this.group.add(dot);
    });
  }

  _createCameraLine() {
    // 相机到中心点的连线
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.2)];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0xff6644,
      dashSize: 0.05,
      gapSize: 0.03,
      transparent: true,
      opacity: 0.7
    });
    this.cameraLine = new THREE.Line(geo, mat);
    this.cameraLine.computeLineDistances();
    this.group.add(this.cameraLine);
  }

  _bindEvents(W, H) {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('mousedown', e => {
      this.isRotating = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mousemove', e => {
      if (!this.isRotating) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      // 拖动旋转整个球体视角
      this.group.rotation.y += dx * 0.01;
      this.group.rotation.x += dy * 0.01;
      // 限制俯仰角
      this.group.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.group.rotation.x));
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mouseup', () => {
      this.isRotating = false;
    });

    // 点击球体设置相机位置
    canvas.addEventListener('click', e => {
      if (this.isRotating) return;
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // 计算球面上的点击位置
      const ray = new THREE.Raycaster();
      ray.setFromCamera(this.mouse, this.camera);
      const sphere = new THREE.SphereGeometry(0.9, 32, 32);
      const sphereMesh = new THREE.Mesh(sphere);
      const intersects = ray.intersectObject(sphereMesh);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        // 转换为球坐标
        const r = point.length();
        const theta = Math.atan2(point.x, point.z);  // 偏航角
        const phi = Math.asin(point.y / r);           // 俯仰角

        this.pitch = Math.round(phi * 180 / Math.PI);
        this.yaw = Math.round(theta * 180 / Math.PI);
        this._updateCameraIndicator();
        this.onChange({ pitch: this.pitch, yaw: this.yaw, fov: this.fov });
      }
    });

    // Resize
    const ro = new ResizeObserver(() => {
      const w = this.container.clientWidth || 180;
      const h = this.container.clientHeight || 180;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    ro.observe(this.container);
  }

  _updateCameraIndicator() {
    if (!this.cameraIndicator) return;

    // 球面坐标转笛卡尔坐标
    const pitchRad = this.pitch * Math.PI / 180;
    const yawRad = this.yaw * Math.PI / 180;
    const r = 0.9;

    const x = r * Math.cos(pitchRad) * Math.sin(yawRad);
    const y = r * Math.sin(pitchRad);
    const z = r * Math.cos(pitchRad) * Math.cos(yawRad);

    // 相机朝向中心
    this.cameraIndicator.position.set(x, y, z);
    this.cameraIndicator.lookAt(0, 0, 0);
    // 翻转使镜头朝向物体
    this.cameraIndicator.rotateY(Math.PI);

    // 更新连线
    if (this.cameraLine) {
      const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(x * 1.3, y * 1.3, z * 1.3)
      ];
      this.cameraLine.geometry.setFromPoints(points);
      this.cameraLine.computeLineDistances();
    }
  }

  _animate() {
    this.animFrame = requestAnimationFrame(() => this._animate());
    this.renderer.render(this.scene, this.camera);
  }

  setPitch(pitch) {
    this.pitch = Math.max(-90, Math.min(90, pitch));
    this._updateCameraIndicator();
    this.onChange({ pitch: this.pitch, yaw: this.yaw, fov: this.fov });
  }

  setYaw(yaw) {
    this.yaw = ((yaw + 180) % 360) - 180;
    this._updateCameraIndicator();
    this.onChange({ pitch: this.pitch, yaw: this.yaw, fov: this.fov });
  }

  setFov(fov) {
    this.fov = Math.max(20, Math.min(120, fov));
    this.onChange({ pitch: this.pitch, yaw: this.yaw, fov: this.fov });
  }

  setAngles(pitch, yaw) {
    this.pitch = Math.max(-90, Math.min(90, pitch));
    this.yaw = ((yaw + 180) % 360) - 180;
    this._updateCameraIndicator();
    this.onChange({ pitch: this.pitch, yaw: this.yaw, fov: this.fov });
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}

// ===================== 相机视角球管理器 =====================
window.CameraViewManager = {
  instances: {},

  create(containerId, options) {
    if (this.instances[containerId]) {
      this.instances[containerId].destroy();
    }
    this.instances[containerId] = new CameraViewBall(containerId, options);
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
